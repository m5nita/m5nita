import { eq } from 'drizzle-orm'
import { getContainer } from '../container'
import { db } from '../db/client'
import { competition } from '../db/schema/competition'
import { match } from '../db/schema/match'
import { calcPointsForMatch } from '../jobs/calcPoints'
import { checkAndClosePools } from '../jobs/closePoolsJob'
import { extractGroup, mapStageForCompetition, mapStatus } from './matchUtils'

const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4'
const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY || ''
const RATE_LIMIT_DELAY_MS = 2000

interface FootballDataMatch {
  id: number
  utcDate: string
  status: string
  stage: string
  group: string | null
  matchday: number | null
  homeTeam: { name: string; crest: string }
  awayTeam: { name: string; crest: string }
  score: {
    fullTime: { home: number | null; away: number | null }
  }
}

interface FootballDataResponse {
  matches: FootballDataMatch[]
}

async function fetchMatches(endpoint: string): Promise<FootballDataMatch[]> {
  const res = await fetch(`${FOOTBALL_DATA_BASE}${endpoint}`, {
    headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY },
  })

  if (!res.ok) {
    console.error(`[Match Sync] API error: ${res.status} for ${endpoint}`)
    return []
  }

  const data: FootballDataResponse = await res.json()
  return data.matches || []
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function upsertMatches(
  matches: FootballDataMatch[],
  competitionId: string,
  competitionType: string,
) {
  for (const m of matches) {
    const existing = await db.query.match.findFirst({
      where: eq(match.externalId, m.id),
    })

    const newStatus = mapStatus(m.status, m.score, m.utcDate)
    const values = {
      competitionId,
      externalId: m.id,
      homeTeam: m.homeTeam.name || 'TBD',
      awayTeam: m.awayTeam.name || 'TBD',
      homeFlag: m.homeTeam.crest || null,
      awayFlag: m.awayTeam.crest || null,
      homeScore: m.score.fullTime.home,
      awayScore: m.score.fullTime.away,
      stage: mapStageForCompetition(m.stage, competitionType),
      group: extractGroup(m.group),
      matchday: m.matchday,
      matchDate: new Date(m.utcDate),
      status: newStatus,
      updatedAt: new Date(),
    }

    if (existing) {
      const wasNotFinished = existing.status !== 'finished'
      const isNowFinished = newStatus === 'finished'

      await db.update(match).set(values).where(eq(match.id, existing.id))

      if (wasNotFinished && isNowFinished) {
        console.log(`[Fixture Sync] Match ${existing.id} finished, calculating points...`)
        await calcPointsForMatch(existing.id)
      }
    } else {
      await db.insert(match).values(values)
    }
  }
}

export async function syncFixtures() {
  if (!FOOTBALL_DATA_API_KEY) {
    console.warn('[Match Sync] FOOTBALL_DATA_API_KEY not set, skipping sync')
    return
  }

  const activeCompetitions = await db.query.competition.findMany({
    where: eq(competition.status, 'active'),
  })

  if (activeCompetitions.length === 0) {
    console.log('[Match Sync] No active competitions, skipping sync')
    return
  }

  for (const [i, comp] of activeCompetitions.entries()) {
    try {
      const matches = await fetchMatches(
        `/competitions/${comp.externalId}/matches?season=${comp.season}`,
      )
      await upsertMatches(matches, comp.id, comp.type)
      console.log(`[Match Sync] Synced ${matches.length} fixtures for ${comp.name}`)
    } catch (err) {
      console.error(`[Match Sync] Error syncing ${comp.name}:`, err)
    }

    if (i < activeCompetitions.length - 1) {
      await delay(RATE_LIMIT_DELAY_MS)
    }
  }
}

export async function syncLiveScores() {
  if (!FOOTBALL_DATA_API_KEY) return

  const activeCompetitions = await db.query.competition.findMany({
    where: eq(competition.status, 'active'),
  })

  for (const [i, comp] of activeCompetitions.entries()) {
    try {
      const allMatches = await fetchMatches(
        `/competitions/${comp.externalId}/matches?status=IN_PLAY,PAUSED,FINISHED&dateFrom=${getTodayDate()}&dateTo=${getTodayDate()}`,
      )

      for (const m of allMatches) {
        const existing = await db.query.match.findFirst({
          where: eq(match.externalId, m.id),
        })

        if (!existing) continue

        const newStatus = mapStatus(m.status, m.score, m.utcDate)
        const wasNotFinished = existing.status !== 'finished'
        const isNowFinished = newStatus === 'finished'

        await db
          .update(match)
          .set({
            homeScore: m.score.fullTime.home,
            awayScore: m.score.fullTime.away,
            status: newStatus,
            updatedAt: new Date(),
          })
          .where(eq(match.id, existing.id))

        if (wasNotFinished && isNowFinished) {
          console.log(`[Live Sync] Match ${existing.id} finished, calculating points...`)
          await calcPointsForMatch(existing.id)
        }
      }
    } catch (err) {
      console.error(`[Live Sync] Error syncing ${comp.name}:`, err)
    }

    if (i < activeCompetitions.length - 1) {
      await delay(RATE_LIMIT_DELAY_MS)
    }
  }

  checkAndClosePools().catch((err) => console.error('[Live Sync] Close pools check failed:', err))
}

function getTodayDate(): string {
  return getContainer().clock.now().toISOString().split('T')[0] as string
}
