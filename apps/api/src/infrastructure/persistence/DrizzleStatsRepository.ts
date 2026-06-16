import { STATS } from '@m5nita/shared'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { db as dbClient } from '../../db/client'
import { match as matchTable } from '../../db/schema/match'
import { participantPoolStats } from '../../db/schema/participantPoolStats'
import { poolMember } from '../../db/schema/poolMember'
import { poolStanding } from '../../db/schema/poolStanding'
import { prediction } from '../../db/schema/prediction'
import type {
  FormSampleRow,
  ParticipantStatsRow,
  PoolMatchPointsRow,
  PoolStatsAggregateRow,
  StatsRepository,
} from '../../domain/stats/StatsRepository.port'

// Reused SQL fragments. Exact/result use literal score comparison (NOT points),
// matching how ranking computes exact counts — never re-deriving scoring.
const FINISHED = sql`${matchTable.status} = 'finished'`
const RESULT_CORRECT = sql`sign(${prediction.homeScore} - ${prediction.awayScore}) = sign(${matchTable.homeScore} - ${matchTable.awayScore})`
const TOTAL_GOALS = sql`(${matchTable.homeScore} + ${matchTable.awayScore})`

export class DrizzleStatsRepository implements StatsRepository {
  constructor(private readonly db: typeof dbClient) {}

  async participantRow(poolId: string, userId: string): Promise<ParticipantStatsRow | null> {
    const row = await this.db.query.participantPoolStats.findFirst({
      where: and(eq(participantPoolStats.poolId, poolId), eq(participantPoolStats.userId, userId)),
    })
    if (!row) return null
    return {
      finishedCount: row.finishedCount,
      exactCount: row.exactCount,
      resultCount: row.resultCount,
      pointsTotal: row.pointsTotal,
      lowGoalsCorrect: row.lowGoalsCorrect,
      lowGoalsTotal: row.lowGoalsTotal,
      highGoalsCorrect: row.highGoalsCorrect,
      highGoalsTotal: row.highGoalsTotal,
      position: row.lastPosition,
      prevPosition: row.prevPosition,
    }
  }

  // One grouped pass over the pool's predictions → per-member finished-match
  // counts. Same cost class as recomputeStandings; cached by the caller.
  async poolAggregate(poolId: string): Promise<PoolStatsAggregateRow[]> {
    return this.db
      .select({
        userId: poolMember.userId,
        finishedCount: sql<number>`count(case when ${FINISHED} then 1 end)::int`.as(
          'finished_count',
        ),
        exactCount:
          sql<number>`count(case when ${FINISHED} and ${prediction.homeScore} = ${matchTable.homeScore} and ${prediction.awayScore} = ${matchTable.awayScore} then 1 end)::int`.as(
            'exact_count',
          ),
        resultCount:
          sql<number>`count(case when ${FINISHED} and ${RESULT_CORRECT} then 1 end)::int`.as(
            'result_count',
          ),
        pointsTotal: sql<number>`coalesce(sum(${prediction.points}), 0)::int`.as('points_total'),
      })
      .from(poolMember)
      .leftJoin(
        prediction,
        sql`${prediction.userId} = ${poolMember.userId} and ${prediction.poolId} = ${poolMember.poolId}`,
      )
      .leftJoin(matchTable, eq(matchTable.id, prediction.matchId))
      .where(eq(poolMember.poolId, poolId))
      .groupBy(poolMember.userId)
  }

  // Per-member points for each finished match in the pool, in kickoff order. The
  // domain builds the viewer / leader / average evolution lines from this, one
  // step per game. Pool-wide and immutable until the next match finish → cached
  // by the caller (like the aggregate). Bounded by members × finished matches.
  async poolMatchPoints(poolId: string): Promise<PoolMatchPointsRow[]> {
    return this.db
      .select({
        userId: prediction.userId,
        matchId: matchTable.id,
        matchDate: matchTable.matchDate,
        points: sql<number>`coalesce(${prediction.points}, 0)::int`.as('points'),
      })
      .from(prediction)
      .innerJoin(matchTable, eq(matchTable.id, prediction.matchId))
      .where(and(eq(prediction.poolId, poolId), eq(matchTable.status, 'finished')))
      .orderBy(asc(matchTable.matchDate), asc(matchTable.id))
  }

  // The viewer's last `limit` finished predictions (most recent first). Returns
  // raw predicted/actual scores; the domain classifies exact/result/miss so the
  // scoring rule stays in one place.
  async recentForm(poolId: string, userId: string, limit: number): Promise<FormSampleRow[]> {
    const rows = await this.db
      .select({
        predHome: prediction.homeScore,
        predAway: prediction.awayScore,
        actualHome: matchTable.homeScore,
        actualAway: matchTable.awayScore,
      })
      .from(prediction)
      .innerJoin(matchTable, eq(matchTable.id, prediction.matchId))
      .where(and(eq(prediction.poolId, poolId), eq(prediction.userId, userId), FINISHED))
      .orderBy(desc(matchTable.matchDate))
      .limit(limit)
    return rows.map((r) => ({
      predHome: r.predHome,
      predAway: r.predAway,
      actualHome: r.actualHome ?? 0,
      actualAway: r.actualAway ?? 0,
    }))
  }

  // Recompute the user's finished-match aggregates + current ranking position
  // and upsert the snapshot. Run at match finish (for unlocked users) and once
  // on first read after unlock. Goal-band cutoff comes from the shared constant.
  async recomputeSnapshot(poolId: string, userId: string): Promise<void> {
    const lowMax = STATS.LOW_GOALS_MAX

    const [agg] = await this.db
      .select({
        finishedCount: sql<number>`count(case when ${FINISHED} then 1 end)::int`.as(
          'finished_count',
        ),
        exactCount:
          sql<number>`count(case when ${FINISHED} and ${prediction.homeScore} = ${matchTable.homeScore} and ${prediction.awayScore} = ${matchTable.awayScore} then 1 end)::int`.as(
            'exact_count',
          ),
        resultCount:
          sql<number>`count(case when ${FINISHED} and ${RESULT_CORRECT} then 1 end)::int`.as(
            'result_count',
          ),
        pointsTotal: sql<number>`coalesce(sum(${prediction.points}), 0)::int`.as('points_total'),
        lowGoalsTotal:
          sql<number>`count(case when ${FINISHED} and ${TOTAL_GOALS} <= ${lowMax} then 1 end)::int`.as(
            'low_goals_total',
          ),
        lowGoalsCorrect:
          sql<number>`count(case when ${FINISHED} and ${TOTAL_GOALS} <= ${lowMax} and ${RESULT_CORRECT} then 1 end)::int`.as(
            'low_goals_correct',
          ),
        highGoalsTotal:
          sql<number>`count(case when ${FINISHED} and ${TOTAL_GOALS} > ${lowMax} then 1 end)::int`.as(
            'high_goals_total',
          ),
        highGoalsCorrect:
          sql<number>`count(case when ${FINISHED} and ${TOTAL_GOALS} > ${lowMax} and ${RESULT_CORRECT} then 1 end)::int`.as(
            'high_goals_correct',
          ),
      })
      .from(prediction)
      .innerJoin(matchTable, eq(matchTable.id, prediction.matchId))
      .where(and(eq(prediction.poolId, poolId), eq(prediction.userId, userId)))

    const position = await this.currentPosition(poolId, userId)
    const existing = await this.db.query.participantPoolStats.findFirst({
      where: and(eq(participantPoolStats.poolId, poolId), eq(participantPoolStats.userId, userId)),
      columns: { lastPosition: true },
    })

    await this.db
      .insert(participantPoolStats)
      .values({
        poolId,
        userId,
        finishedCount: agg?.finishedCount ?? 0,
        exactCount: agg?.exactCount ?? 0,
        resultCount: agg?.resultCount ?? 0,
        pointsTotal: agg?.pointsTotal ?? 0,
        lowGoalsCorrect: agg?.lowGoalsCorrect ?? 0,
        lowGoalsTotal: agg?.lowGoalsTotal ?? 0,
        highGoalsCorrect: agg?.highGoalsCorrect ?? 0,
        highGoalsTotal: agg?.highGoalsTotal ?? 0,
        lastPosition: position,
        prevPosition: existing?.lastPosition ?? null,
      })
      .onConflictDoUpdate({
        target: [participantPoolStats.poolId, participantPoolStats.userId],
        set: {
          finishedCount: sql`excluded.finished_count`,
          exactCount: sql`excluded.exact_count`,
          resultCount: sql`excluded.result_count`,
          pointsTotal: sql`excluded.points_total`,
          lowGoalsCorrect: sql`excluded.low_goals_correct`,
          lowGoalsTotal: sql`excluded.low_goals_total`,
          highGoalsCorrect: sql`excluded.high_goals_correct`,
          highGoalsTotal: sql`excluded.high_goals_total`,
          lastPosition: sql`excluded.last_position`,
          prevPosition: sql`excluded.prev_position`,
          updatedAt: sql`now()`,
        },
      })
  }

  // The user's 1-based rank in the precomputed standings, by the ranking
  // tiebreaker (points desc, exact desc). Null when the user has no standing row.
  private async currentPosition(poolId: string, userId: string): Promise<number | null> {
    const ranked = await this.db
      .select({
        userId: poolStanding.userId,
        rank: sql<number>`rank() over (order by ${poolStanding.pointsTotal} desc, ${poolStanding.exactMatches} desc)::int`.as(
          'rank',
        ),
      })
      .from(poolStanding)
      .where(eq(poolStanding.poolId, poolId))
    return ranked.find((r) => r.userId === userId)?.rank ?? null
  }
}
