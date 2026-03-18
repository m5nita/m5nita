import { Hono } from 'hono'
import { eq, sql } from 'drizzle-orm'
import { requireAuth } from '../middleware/auth'
import { getPoolRanking } from '../services/ranking'
import { db } from '../db/client'
import { pool } from '../db/schema/pool'
import { poolMember } from '../db/schema/poolMember'
import { POOL } from '@m5nita/shared'

const rankingRoutes = new Hono()

rankingRoutes.use('/*', requireAuth)

// GET /api/pools/:poolId/ranking
rankingRoutes.get('/pools/:poolId/ranking', async (c) => {
  const currentUser = c.get('user')
  const { poolId } = c.req.param()

  const ranking = await getPoolRanking(poolId, currentUser.id)

  // Calculate prize total
  const poolData = await db.query.pool.findFirst({
    where: eq(pool.id, poolId),
  })
  const [memberCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(poolMember)
    .where(eq(poolMember.poolId, poolId))

  const count = memberCount?.count ?? 0
  const prizeTotal = poolData
    ? Math.floor(poolData.entryFee * count * (1 - POOL.PLATFORM_FEE_RATE))
    : 0

  return c.json({ ranking, prizeTotal })
})

export { rankingRoutes }
