import { Hono } from 'hono'
import { getContainer } from '../../../container'
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

  // findByIdWithDetails already computes prizeTotal AND hasLiveMatch in one read;
  // reuse both instead of re-checking live matches with a second query.
  const { poolRepo } = getContainer()
  const details = await poolRepo.findByIdWithDetails(poolId)

  return c.json({
    ranking,
    prizeTotal: details?.prizeTotal ?? 0,
    hasLiveMatch: details?.hasLiveMatch ?? false,
  })
})

export { rankingRoutes }
