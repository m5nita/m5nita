import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { match } from '../db/schema/match'

const API_FOOTBALL_BASE = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io'
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY || ''

interface ApiFixture {
  fixture: { id: number; date: string; status: { short: string } }
  league: { round: string }
  teams: { home: { name: string; logo: string }; away: { name: string; logo: string } }
  goals: { home: number | null; away: number | null }
}

function mapStatus(apiStatus: string): string {
  const statusMap: Record<string, string> = {
    NS: 'scheduled', TBD: 'scheduled', '1H': 'live', HT: 'live', '2H': 'live',
    ET: 'live', BT: 'live', P: 'live', FT: 'finished', AET: 'finished',
    PEN: 'finished', PST: 'postponed', CANC: 'cancelled', ABD: 'cancelled',
  }
  return statusMap[apiStatus] || 'scheduled'
}

function mapStage(round: string): string {
  const lower = round.toLowerCase()
  if (lower.includes('group')) return 'group'
  if (lower.includes('32')) return 'round-of-32'
  if (lower.includes('16')) return 'round-of-16'
  if (lower.includes('quarter')) return 'quarter'
  if (lower.includes('semi') && !lower.includes('final')) return 'semi'
  if (lower.includes('3rd') || lower.includes('third')) return 'third-place'
  if (lower.includes('final')) return 'final'
  return 'group'
}

function extractGroup(round: string): string | null {
  const groupMatch = round.match(/Group\s+([A-L])/i)
  return groupMatch ? groupMatch[1]!.toUpperCase() : null
}

export async function syncFixtures() {
  if (!API_FOOTBALL_KEY) {
    console.warn('[Match Sync] API_FOOTBALL_KEY not set, skipping sync')
    return
  }

  try {
    const res = await fetch(`${API_FOOTBALL_BASE}/fixtures?league=1&season=2026`, {
      headers: { 'x-apisports-key': API_FOOTBALL_KEY },
    })

    if (!res.ok) {
      console.error(`[Match Sync] API error: ${res.status}`)
      return
    }

    const data = await res.json()
    const fixtures: ApiFixture[] = data.response || []

    for (const f of fixtures) {
      const existing = await db.query.match.findFirst({
        where: eq(match.externalId, f.fixture.id),
      })

      const values = {
        externalId: f.fixture.id,
        homeTeam: f.teams.home.name,
        awayTeam: f.teams.away.name,
        homeFlag: f.teams.home.logo,
        awayFlag: f.teams.away.logo,
        homeScore: f.goals.home,
        awayScore: f.goals.away,
        stage: mapStage(f.league.round),
        group: extractGroup(f.league.round),
        matchDate: new Date(f.fixture.date),
        status: mapStatus(f.fixture.status.short),
        updatedAt: new Date(),
      }

      if (existing) {
        await db.update(match).set(values).where(eq(match.id, existing.id))
      } else {
        await db.insert(match).values(values)
      }
    }

    console.log(`[Match Sync] Synced ${fixtures.length} fixtures`)
  } catch (err) {
    console.error('[Match Sync] Error:', err)
  }
}

export async function syncLiveScores() {
  if (!API_FOOTBALL_KEY) return

  try {
    const res = await fetch(`${API_FOOTBALL_BASE}/fixtures?live=all`, {
      headers: { 'x-apisports-key': API_FOOTBALL_KEY },
    })

    if (!res.ok) return

    const data = await res.json()
    const fixtures: ApiFixture[] = data.response || []

    for (const f of fixtures) {
      await db
        .update(match)
        .set({
          homeScore: f.goals.home,
          awayScore: f.goals.away,
          status: mapStatus(f.fixture.status.short),
          updatedAt: new Date(),
        })
        .where(eq(match.externalId, f.fixture.id))
    }
  } catch (err) {
    console.error('[Live Sync] Error:', err)
  }
}
