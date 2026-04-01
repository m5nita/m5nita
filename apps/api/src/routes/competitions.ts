import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'
import { getActiveCompetitions } from '../services/competition'
import type { AppEnv } from '../types/hono'

const competitionsRoutes = new Hono<AppEnv>()

competitionsRoutes.use('/*', requireAuth)

// GET /api/competitions — List active competitions
competitionsRoutes.get('/competitions', async (c) => {
  const competitions = await getActiveCompetitions()
  return c.json({ competitions })
})

export { competitionsRoutes }
