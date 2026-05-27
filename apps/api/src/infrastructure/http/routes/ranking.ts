import { Hono } from 'hono'
import { getContainer } from '../../../container'
import { poolHasLiveMatch } from '../../../services/pool'
import { getPoolRanking } from '../../../services/ranking'
import type { AppEnv } from '../../../types/hono'
import { requireAuth } from '../middleware/auth'

const rankingRoutes = new Hono<AppEnv>()

rankingRoutes.use('/*', requireAuth)

// GET /api/pools/:poolId/ranking
rankingRoutes.get('/pools/:poolId/ranking', async (c) => {
  const currentUser = c.get('user')
  const { poolId } = c.req.param()

  const ranking = await getPoolRanking(poolId, currentUser.id)

  const { poolRepo } = getContainer()
  const details = await poolRepo.findByIdWithDetails(poolId)
  const prizeTotal = details?.prizeTotal ?? 0
  const hasLiveMatch = details
    ? await poolHasLiveMatch(
        details.competitionId,
        details.matchdayFrom,
        details.matchdayTo,
        details.matchId,
      )
    : false

  return c.json({ ranking, prizeTotal, hasLiveMatch })
})

export { rankingRoutes }
