import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { db as dbClient } from '../../db/client'
import { user } from '../../db/schema/auth'
import { match as matchTable } from '../../db/schema/match'
import { poolMember } from '../../db/schema/poolMember'
import { poolStanding } from '../../db/schema/poolStanding'
import { prediction } from '../../db/schema/prediction'
import { Ranking } from '../../domain/ranking/Ranking'
import type {
  RankingEntry,
  RankingRepository,
  StandingRow,
} from '../../domain/ranking/RankingRepository.port'

export type { RankingEntry, RankingRepository }

export class DrizzleRankingRepository implements RankingRepository {
  constructor(private readonly db: typeof dbClient) {}

  // Read the precomputed standings: one row per current member (poolMember is
  // authoritative for membership; pool_standing supplies points, 0 if a member
  // has no row yet). Sorted by the tiebreaker so callers can delegate position
  // assignment to the domain `Ranking.build`.
  async getStandings(poolId: string): Promise<StandingRow[]> {
    return this.db
      .select({
        userId: poolMember.userId,
        name: user.name,
        totalPoints: sql<number>`coalesce(${poolStanding.pointsTotal}, 0)::int`.as('total_points'),
        exactMatches: sql<number>`coalesce(${poolStanding.exactMatches}, 0)::int`.as(
          'exact_matches',
        ),
      })
      .from(poolMember)
      .innerJoin(user, eq(user.id, poolMember.userId))
      .leftJoin(
        poolStanding,
        and(eq(poolStanding.poolId, poolMember.poolId), eq(poolStanding.userId, poolMember.userId)),
      )
      .where(eq(poolMember.poolId, poolId))
      .orderBy(
        desc(sql`coalesce(${poolStanding.pointsTotal}, 0)`),
        desc(sql`coalesce(${poolStanding.exactMatches}, 0)`),
        // Deterministic final tiebreaker so members tied on points + exact count
        // keep a stable order across reads (otherwise Postgres returns ties in an
        // arbitrary order that changes between polls → rows visibly shuffle).
        asc(user.name),
        asc(poolMember.userId),
      )
  }

  // Recompute a pool's standings from its predictions and upsert them. Runs the
  // heavy aggregate, but only at write time (when a match finishes) rather than
  // on every ranking read. Exact = predicted == actual finished score (not
  // `points = 10`, since single-match scoring stores 10 + bonus).
  async recomputeStandings(poolId: string): Promise<void> {
    const exactExpr = sql`count(case when ${matchTable.status} = 'finished'
        and ${prediction.homeScore} = ${matchTable.homeScore}
        and ${prediction.awayScore} = ${matchTable.awayScore} then 1 end)`
    const agg = await this.db
      .select({
        userId: poolMember.userId,
        totalPoints: sql<number>`coalesce(sum(${prediction.points}), 0)::int`.as('total_points'),
        exactMatches: sql<number>`${exactExpr}::int`.as('exact_matches'),
      })
      .from(poolMember)
      .leftJoin(
        prediction,
        sql`${prediction.userId} = ${poolMember.userId} and ${prediction.poolId} = ${poolMember.poolId}`,
      )
      .leftJoin(matchTable, eq(matchTable.id, prediction.matchId))
      .where(eq(poolMember.poolId, poolId))
      .groupBy(poolMember.userId)

    if (agg.length === 0) return

    await this.db
      .insert(poolStanding)
      .values(
        agg.map((r) => ({
          poolId,
          userId: r.userId,
          pointsTotal: r.totalPoints,
          exactMatches: r.exactMatches,
        })),
      )
      .onConflictDoUpdate({
        target: [poolStanding.poolId, poolStanding.userId],
        set: {
          pointsTotal: sql`excluded.points_total`,
          exactMatches: sql`excluded.exact_matches`,
          updatedAt: sql`now()`,
        },
      })
  }

  async getPoolRanking(poolId: string, currentUserId: string): Promise<RankingEntry[]> {
    const standings = await this.getStandings(poolId)
    // Delegate the shared-position / tiebreaker rule to the domain. livePoints
    // is 0 on this path (prize/withdrawal/job contexts never use live points).
    return Ranking.build(
      standings.map((s) => ({ ...s, livePoints: 0 })),
      currentUserId,
    ).map((e) => ({
      position: e.position,
      userId: e.userId,
      name: e.name,
      totalPoints: e.totalPoints,
      exactMatches: e.exactMatches,
      isCurrentUser: e.isCurrentUser,
    }))
  }

  async getPoolMemberCount(poolId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(poolMember)
      .where(eq(poolMember.poolId, poolId))
    return result?.count ?? 0
  }
}
