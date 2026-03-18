import { eq, sql, desc } from 'drizzle-orm'
import { db } from '../db/client'
import { poolMember } from '../db/schema/poolMember'
import { prediction } from '../db/schema/prediction'
import { user } from '../db/schema/auth'
import { POOL } from '@m5nita/shared'

export async function getPoolRanking(poolId: string, currentUserId: string) {
  const results = await db
    .select({
      userId: poolMember.userId,
      name: user.name,
      totalPoints: sql<number>`coalesce(sum(${prediction.points}), 0)::int`.as('total_points'),
      exactMatches: sql<number>`count(case when ${prediction.points} = 10 then 1 end)::int`.as('exact_matches'),
    })
    .from(poolMember)
    .innerJoin(user, eq(user.id, poolMember.userId))
    .leftJoin(
      prediction,
      sql`${prediction.userId} = ${poolMember.userId} and ${prediction.poolId} = ${poolMember.poolId}`,
    )
    .where(eq(poolMember.poolId, poolId))
    .groupBy(poolMember.userId, user.name)
    .orderBy(
      desc(sql`coalesce(sum(${prediction.points}), 0)`),
      desc(sql`count(case when ${prediction.points} = 10 then 1 end)`),
    )

  // Assign positions with shared ranks for ties
  let position = 0
  let lastPoints = -1
  let lastExact = -1

  const ranking = results.map((r, index) => {
    if (r.totalPoints !== lastPoints || r.exactMatches !== lastExact) {
      position = index + 1
      lastPoints = r.totalPoints
      lastExact = r.exactMatches
    }

    return {
      position,
      userId: r.userId,
      name: r.name,
      totalPoints: r.totalPoints,
      exactMatches: r.exactMatches,
      isCurrentUser: r.userId === currentUserId,
    }
  })

  return ranking
}

export async function getPoolPrizeTotal(poolId: string) {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(poolMember)
    .where(eq(poolMember.poolId, poolId))

  // Need pool entry fee - get from first payment
  const pool = await db.query.pool.findFirst({
    where: eq(poolMember.poolId, poolId),
  })

  // Fallback calculation
  const memberCount = result?.count ?? 0
  return { memberCount }
}
