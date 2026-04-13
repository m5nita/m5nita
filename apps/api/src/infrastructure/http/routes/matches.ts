import { and, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../../../db/client'
import { match } from '../../../db/schema/match'
import { getFeaturedCompetitionIds } from '../../../services/competition'
import type { AppEnv } from '../../../types/hono'
import { requireAuth } from '../middleware/auth'

const matchesRoutes = new Hono<AppEnv>()

matchesRoutes.use('/*', requireAuth)

// GET /api/matches — List matches with filters
matchesRoutes.get('/matches', async (c) => {
  const stage = c.req.query('stage')
  const group = c.req.query('group')
  const status = c.req.query('status')
  const competitionId = c.req.query('competitionId')
  const featured = c.req.query('featured')

  let query = db.select().from(match).$dynamic()

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
  if (stage) conditions.push(eq(match.stage, stage))
  if (group) conditions.push(eq(match.group, group))
  if (status) conditions.push(eq(match.status, status))

  if (conditions.length > 0) {
    query = query.where(and(...conditions))
  }

  const matches = await query.orderBy(match.matchDate)
  return c.json({ matches })
})

// GET /api/matches/live — Live matches only
matchesRoutes.get('/matches/live', async (c) => {
  const matches = await db
    .select()
    .from(match)
    .where(eq(match.status, 'live'))
    .orderBy(match.matchDate)

  return c.json({ matches })
})

export { matchesRoutes }
