import { and, eq, gte, inArray, lte } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../../../db/client'
import { match } from '../../../db/schema/match'
import { getFeaturedCompetitionIds } from '../../../services/competition'
import type { AppEnv } from '../../../types/hono'
import { requireAuth } from '../middleware/auth'

const matchesRoutes = new Hono<AppEnv>()

matchesRoutes.use('/*', requireAuth)

/**
 * Parse the `status` query param into a list of statuses. Accepts either a
 * single value ("scheduled") or a comma-separated list ("scheduled,live"),
 * trimming blanks — so the home screen can ask for upcoming + live in one call.
 */
export function parseStatusFilter(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Build the Drizzle WHERE condition for the `status` filter, or null when no
 * status was requested. Accepts one or many statuses — `IN (...)` matches a
 * single value just like equality, so the home can ask for upcoming + live.
 */
function buildStatusCondition(raw: string | undefined) {
  const statuses = parseStatusFilter(raw)
  return statuses.length > 0 ? inArray(match.status, statuses) : null
}

// Only the columns in the shared Match type — skip external_id/created_at/
// updated_at, which the client never reads, to trim the payload.
const matchColumns = {
  id: match.id,
  competitionId: match.competitionId,
  homeTeam: match.homeTeam,
  awayTeam: match.awayTeam,
  homeFlag: match.homeFlag,
  awayFlag: match.awayFlag,
  homeScore: match.homeScore,
  awayScore: match.awayScore,
  extraTimeHomeScore: match.extraTimeHomeScore,
  extraTimeAwayScore: match.extraTimeAwayScore,
  penaltyHomeScore: match.penaltyHomeScore,
  penaltyAwayScore: match.penaltyAwayScore,
  winner: match.winner,
  duration: match.duration,
  stage: match.stage,
  group: match.group,
  matchday: match.matchday,
  matchDate: match.matchDate,
  status: match.status,
  minute: match.minute,
  injuryTime: match.injuryTime,
}

// GET /api/matches — List matches with filters
matchesRoutes.get('/matches', async (c) => {
  const stage = c.req.query('stage')
  const group = c.req.query('group')
  const status = c.req.query('status')
  const competitionId = c.req.query('competitionId')
  const featured = c.req.query('featured')
  // Optional pool-scope filters (additive — absent params preserve old behaviour).
  const matchId = c.req.query('matchId')
  const matchdayFrom = c.req.query('matchdayFrom')
  const matchdayTo = c.req.query('matchdayTo')
  const limit = c.req.query('limit')

  let query = db.select(matchColumns).from(match).$dynamic()

  const conditions = []
  if (competitionId) {
    conditions.push(eq(match.competitionId, competitionId))
  } else if (featured === 'true') {
    const featuredIds = await getFeaturedCompetitionIds()
    if (featuredIds.length > 0) {
      conditions.push(inArray(match.competitionId, featuredIds))
    } else {
      return c.json({ matches: [] })
    }
  }
  if (matchId) conditions.push(eq(match.id, matchId))
  if (matchdayFrom) conditions.push(gte(match.matchday, Number(matchdayFrom)))
  if (matchdayTo) conditions.push(lte(match.matchday, Number(matchdayTo)))
  if (stage) conditions.push(eq(match.stage, stage))
  if (group) conditions.push(eq(match.group, group))
  const statusCondition = buildStatusCondition(status)
  if (statusCondition) conditions.push(statusCondition)

  if (conditions.length > 0) {
    query = query.where(and(...conditions))
  }

  query = query.orderBy(match.matchDate)
  const limitNum = limit ? Number(limit) : Number.NaN
  if (Number.isInteger(limitNum) && limitNum > 0) {
    query = query.limit(limitNum)
  }

  const matches = await query
  return c.json({ matches })
})

// GET /api/matches/live — Live matches only
matchesRoutes.get('/matches/live', async (c) => {
  const matches = await db
    .select(matchColumns)
    .from(match)
    .where(eq(match.status, 'live'))
    .orderBy(match.matchDate)

  return c.json({ matches })
})

export { matchesRoutes }
