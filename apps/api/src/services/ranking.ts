import { desc, eq, sql } from 'drizzle-orm'
import { getContainer } from '../container'
import { db } from '../db/client'
import { user } from '../db/schema/auth'
import { match as matchTable } from '../db/schema/match'
import { poolMember } from '../db/schema/poolMember'
import { prediction } from '../db/schema/prediction'
import { Ranking } from '../domain/ranking/Ranking'
import type { ScoringPolicy } from '../domain/scoring/ScoringPolicy'

export async function getPoolRanking(poolId: string, currentUserId: string) {
  const { poolRepo } = getContainer()
  const pool = await poolRepo.findById(poolId)

  const rawEntries = await db
    .select({
      userId: poolMember.userId,
      name: user.name,
      totalPoints: sql<number>`coalesce(sum(${prediction.points}), 0)::int`.as('total_points'),
      exactMatches: sql<number>`count(case when ${prediction.points} = 10 then 1 end)::int`.as(
        'exact_matches',
      ),
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

  const livePoints = pool ? await computeLivePointsByUser(poolId, pool.scoringPolicy()) : new Map()

  const entries = rawEntries.map((r) => ({
    userId: r.userId,
    name: r.name,
    totalPoints: r.totalPoints,
    livePoints: livePoints.get(r.userId) ?? 0,
    exactMatches: r.exactMatches,
  }))

  return Ranking.build(entries, currentUserId)
}

async function computeLivePointsByUser(
  poolId: string,
  scoringPolicy: ScoringPolicy,
): Promise<Map<string, number>> {
  const livePreds = await db
    .select({
      userId: prediction.userId,
      predHome: prediction.homeScore,
      predAway: prediction.awayScore,
      actualHome: matchTable.homeScore,
      actualAway: matchTable.awayScore,
    })
    .from(prediction)
    .innerJoin(matchTable, eq(matchTable.id, prediction.matchId))
    .where(sql`${prediction.poolId} = ${poolId} and ${matchTable.status} = 'live'`)

  const byUser = new Map<string, number>()
  for (const row of livePreds) {
    if (row.actualHome === null || row.actualAway === null) continue
    const pts = scoringPolicy.score(
      row.predHome,
      row.predAway,
      row.actualHome,
      row.actualAway,
    ).points
    byUser.set(row.userId, (byUser.get(row.userId) ?? 0) + pts)
  }
  return byUser
}

export async function getPoolPrizeTotal(poolId: string) {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(poolMember)
    .where(eq(poolMember.poolId, poolId))

  const memberCount = result?.count ?? 0
  return { memberCount }
}
