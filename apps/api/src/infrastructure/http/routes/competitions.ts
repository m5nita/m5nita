import { Hono } from 'hono'
import { getContainer } from '../../../container'
import { getActiveCompetitions, getCompetitionById } from '../../../services/competition'
import type { AppEnv } from '../../../types/hono'
import { requireAuth } from '../middleware/auth'

const competitionsRoutes = new Hono<AppEnv>()

competitionsRoutes.use('/*', requireAuth)

// GET /api/competitions — List active competitions
competitionsRoutes.get('/competitions', async (c) => {
  const competitions = await getActiveCompetitions()
  return c.json({ competitions })
})

// GET /api/competitions/:competitionId/upcoming-matches — Backs the single-match picker.
// Returns only future, scope-eligible fixtures ordered by kickoff (FR-003, FR-004).
competitionsRoutes.get('/competitions/:competitionId/upcoming-matches', async (c) => {
  const { competitionId } = c.req.param()
  const competition = await getCompetitionById(competitionId)
  if (competition?.status !== 'active') {
    return c.json({ code: 'COMPETITION_NOT_FOUND' }, 404)
  }
  const { matchRepo, clock } = getContainer()
  const upcoming = await matchRepo.findUpcomingByCompetition(competitionId, clock.now())
  return c.json({
    matches: upcoming.map((m) => ({
      id: m.id,
      matchday: m.matchday,
      stage: m.stage,
      kickoffAt: m.matchDate.toISOString(),
      homeTeam: { name: m.homeTeam, crest: m.homeFlag },
      awayTeam: { name: m.awayTeam, crest: m.awayFlag },
      status: m.status,
    })),
  })
})

export { competitionsRoutes }
