import { eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../../../db/client'
import { pool } from '../../../db/schema/pool'
import { poolMember } from '../../../db/schema/poolMember'
import { getEffectiveFeeRate } from '../../../services/coupon'
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

  const poolData = await db.query.pool.findFirst({
    where: eq(pool.id, poolId),
    with: { coupon: true },
  })
  const [memberCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(poolMember)
    .where(eq(poolMember.poolId, poolId))

  const count = memberCount?.count ?? 0
  const discountPercent = poolData?.coupon?.discountPercent ?? 0
  const effectiveRate = getEffectiveFeeRate(discountPercent)
  const prizeTotal = poolData ? Math.floor(poolData.entryFee * count * (1 - effectiveRate)) : 0
  const hasLiveMatch = poolData
    ? await poolHasLiveMatch(poolData.competitionId, poolData.matchdayFrom, poolData.matchdayTo)
    : false

  return c.json({ ranking, prizeTotal, hasLiveMatch })
})

export { rankingRoutes }
