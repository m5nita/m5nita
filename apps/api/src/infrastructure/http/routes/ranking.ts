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

  // Ranking exposes other members' names, points and the prize total — gate it
  // on membership (mirrors predictions/stats), otherwise any authenticated user
  // could read an arbitrary pool's standings by guessing its id.
  const { poolRepo } = getContainer()
  const isMember = await poolRepo.isMember(poolId, currentUser.id)
  if (!isMember) {
    return c.json({ error: 'NOT_MEMBER', message: 'Você não é membro deste bolão' }, 403)
  }

  const ranking = await getPoolRanking(poolId, currentUser.id)

  // findByIdWithDetails already computes prizeTotal AND hasLiveMatch in one read;
  // reuse both instead of re-checking live matches with a second query.
  const details = await poolRepo.findByIdWithDetails(poolId)

  return c.json({
    ranking,
    prizeTotal: details?.prizeTotal ?? 0,
    hasLiveMatch: details?.hasLiveMatch ?? false,
  })
})

export { rankingRoutes }
