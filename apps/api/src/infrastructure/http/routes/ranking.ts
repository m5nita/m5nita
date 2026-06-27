import { Hono } from 'hono'
import { getContainer } from '../../../container'
import { renderRankingOgPng } from '../../../lib/rankingImage'
import { createTtlCache } from '../../../lib/ttlCache'
import { getPoolRanking } from '../../../services/ranking'
import type { AppEnv } from '../../../types/hono'
import { requireAuth } from '../middleware/auth'

const rankingRoutes = new Hono<AppEnv>()

rankingRoutes.use('/*', requireAuth)

const RANKING_IMG_TTL_MS = 5 * 60_000
const rankingImageCache = createTtlCache<string, Buffer>(RANKING_IMG_TTL_MS)

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

// GET /api/pools/:poolId/ranking/image.png — member-gated shareable PNG
rankingRoutes.get('/pools/:poolId/ranking/image.png', async (c) => {
  const currentUser = c.get('user')
  const { poolId } = c.req.param()

  const { poolRepo } = getContainer()
  const isMember = await poolRepo.isMember(poolId, currentUser.id)
  if (!isMember) {
    return c.json({ error: 'NOT_MEMBER', message: 'Você não é membro deste bolão' }, 403)
  }

  const [ranking, details] = await Promise.all([
    getPoolRanking(poolId, currentUser.id),
    poolRepo.findByIdWithDetails(poolId),
  ])

  // Bust on standings change: key by a cheap content signature (points per row).
  const signature = ranking.map((r) => `${r.userId}:${r.totalPoints + r.livePoints}`).join('|')
  const png = await rankingImageCache.getOrCompute(`${poolId}:${signature}`, () =>
    renderRankingOgPng({
      poolName: details?.name ?? 'Bolão',
      competitionName: details?.competitionName ?? '',
      prizeCentavos: details?.prizeTotal ?? 0,
      rows: ranking.map((r) => ({
        position: r.position,
        name: r.name ?? 'Anônimo',
        points: r.totalPoints + r.livePoints,
        isViewer: r.isCurrentUser,
      })),
    }),
  )

  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, max-age=300',
    },
  })
})

export { rankingRoutes }
