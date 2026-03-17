import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { match } from '../db/schema/match'

const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4'
const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY || ''

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

function mapStatus(apiStatus: string): string {
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
  }
  return stageMap[stage] || 'group'
}

function extractGroup(group: string | null): string | null {
  if (!group) return null
  const groupMatch = group.match(/GROUP_([A-L])/i)
  return groupMatch ? groupMatch[1]!.toUpperCase() : null
}

async function fetchMatches(endpoint: string): Promise<FootballDataMatch[]> {
  const res = await fetch(`${FOOTBALL_DATA_BASE}${endpoint}`, {
    headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY },
  })

  if (!res.ok) {
    console.error(`[Match Sync] API error: ${res.status}`)
    return []
  }

  const data: FootballDataResponse = await res.json()
  return data.matches || []
}

async function upsertMatches(matches: FootballDataMatch[]) {
  for (const m of matches) {
    const existing = await db.query.match.findFirst({
      where: eq(match.externalId, m.id),
    })

    const values = {
      externalId: m.id,
      homeTeam: m.homeTeam.name || 'TBD',
      awayTeam: m.awayTeam.name || 'TBD',
      homeFlag: m.homeTeam.crest || null,
      awayFlag: m.awayTeam.crest || null,
      homeScore: m.score.fullTime.home,
      awayScore: m.score.fullTime.away,
      stage: mapStage(m.stage),
      group: extractGroup(m.group),
      matchday: m.matchday,
      matchDate: new Date(m.utcDate),
      status: mapStatus(m.status),
      updatedAt: new Date(),
    }

    if (existing) {
      await db.update(match).set(values).where(eq(match.id, existing.id))
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

  try {
    const matches = await fetchMatches('/competitions/WC/matches?season=2026')
    await upsertMatches(matches)
    console.log(`[Match Sync] Synced ${matches.length} fixtures`)
  } catch (err) {
    console.error('[Match Sync] Error:', err)
  }
}

export async function syncLiveScores() {
  if (!FOOTBALL_DATA_API_KEY) return

  try {
    const matches = await fetchMatches('/competitions/WC/matches?status=LIVE')

    for (const m of matches) {
      await db
        .update(match)
        .set({
          homeScore: m.score.fullTime.home,
          awayScore: m.score.fullTime.away,
          status: mapStatus(m.status),
          updatedAt: new Date(),
        })
        .where(eq(match.externalId, m.id))
    }
  } catch (err) {
    console.error('[Live Sync] Error:', err)
  }
}
