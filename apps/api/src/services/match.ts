import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { competition } from '../db/schema/competition'
import { match } from '../db/schema/match'
import { calcPointsForMatch } from '../jobs/calcPoints'
import { checkAndClosePools } from '../jobs/closePoolsJob'

const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4'
const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY || ''
const RATE_LIMIT_DELAY_MS = 6000

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

const MATCH_MAX_DURATION_MS = 12 * 60 * 60 * 1000

function mapStatus(
  apiStatus: string,
  score?: FootballDataMatch['score'],
  utcDate?: string,
): string {
  if (
    (apiStatus === 'IN_PLAY' || apiStatus === 'PAUSED') &&
    utcDate &&
    score?.fullTime.home !== null &&
    score?.fullTime.away !== null &&
    Date.now() - new Date(utcDate).getTime() > MATCH_MAX_DURATION_MS
  ) {
    return 'finished'
  }

  const statusMap: Record<string, string> = {
    SCHEDULED: 'scheduled',
    TIMED: 'scheduled',
    IN_PLAY: 'live',
    PAUSED: 'live',
    FINISHED: 'finished',
    POSTPONED: 'postponed',
    CANCELLED: 'cancelled',
    SUSPENDED: 'cancelled',
    AWARDED: 'finished',
  }
  return statusMap[apiStatus] || 'scheduled'
}

function mapStage(stage: string): string {
  const stageMap: Record<string, string> = {
    GROUP_STAGE: 'group',
    LAST_32: 'round-of-32',
    ROUND_OF_32: 'round-of-32',
    LAST_16: 'round-of-16',
    ROUND_OF_16: 'round-of-16',
    QUARTER_FINALS: 'quarter',
    SEMI_FINALS: 'semi',
    THIRD_PLACE: 'third-place',
    FINAL: 'final',
    REGULAR_SEASON: 'league',
  }
  return stageMap[stage] || 'group'
}

export function mapStageForCompetition(stage: string, competitionType: string): string {
  if (competitionType === 'league') return 'league'
  return mapStage(stage)
}

function extractGroup(group: string | null): string | null {
  if (!group) return null
  const groupMatch = group.match(/GROUP_([A-L])/i)
  return groupMatch ? (groupMatch[1]?.toUpperCase() ?? null) : null
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
      const liveMatches = await fetchMatches(`/competitions/${comp.externalId}/matches?status=LIVE`)
      const finishedMatches = await fetchMatches(
        `/competitions/${comp.externalId}/matches?status=FINISHED&dateFrom=${getTodayDate()}&dateTo=${getTodayDate()}`,
      )

      const allMatches = [...liveMatches, ...finishedMatches]

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
  return new Date().toISOString().split('T')[0] as string
}
