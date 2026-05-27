import { desc, eq, sql } from 'drizzle-orm'
import type { db as dbClient } from '../../db/client'
import { user } from '../../db/schema/auth'
import { match as matchTable } from '../../db/schema/match'
import { poolMember } from '../../db/schema/poolMember'
import { prediction } from '../../db/schema/prediction'
import type { RankingEntry, RankingRepository } from '../../domain/ranking/RankingRepository.port'

export type { RankingEntry, RankingRepository }

export class DrizzleRankingRepository implements RankingRepository {
  constructor(private readonly db: typeof dbClient) {}

  async getPoolRanking(poolId: string, currentUserId: string): Promise<RankingEntry[]> {
    // See services/ranking.ts: exact is derived from match scores, not from
    // `points = 10`, because single-match scoring stores 10 + bonus.
    const exactExpr = sql`count(case when ${matchTable.status} = 'finished'
        and ${prediction.homeScore} = ${matchTable.homeScore}
        and ${prediction.awayScore} = ${matchTable.awayScore} then 1 end)`
    const results = await this.db
      .select({
        userId: poolMember.userId,
        name: user.name,
        totalPoints: sql<number>`coalesce(sum(${prediction.points}), 0)::int`.as('total_points'),
        exactMatches: sql<number>`${exactExpr}::int`.as('exact_matches'),
      })
      .from(poolMember)
      .innerJoin(user, eq(user.id, poolMember.userId))
      .leftJoin(
        prediction,
        sql`${prediction.userId} = ${poolMember.userId} and ${prediction.poolId} = ${poolMember.poolId}`,
      )
      .leftJoin(matchTable, eq(matchTable.id, prediction.matchId))
      .where(eq(poolMember.poolId, poolId))
      .groupBy(poolMember.userId, user.name)
      .orderBy(desc(sql`coalesce(sum(${prediction.points}), 0)`), desc(exactExpr))

    let position = 0
    let lastPoints = -1
    let lastExact = -1

    return results.map((r, index) => {
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
  }

  async getPoolMemberCount(poolId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(poolMember)
      .where(eq(poolMember.poolId, poolId))
    return result?.count ?? 0
  }
}
