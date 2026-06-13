import type { PoolStatsAggregateRow } from './StatsRepository.port'

export type ComparisonStat = { average: number; leader: number }

export type PoolComparison = {
  exactPct: ComparisonStat
  resultPct: ComparisonStat
  efficiency: ComparisonStat
  /** The leader's finished-match points (for the gap-to-leader figure). */
  leaderPoints: number
  /** The leader's user id (to pick their evolution line); null when no rated member. */
  leaderUserId: string | null
  /** Members with at least one finished prediction — the basis for averages. */
  ratedMembers: number
}

/**
 * Derives the anonymized pool baselines — the average across members and the
 * leader's figures — for exact-score %, result %, and efficiency. Consumes only
 * aggregated per-member rows; it never sees an individual third party's
 * prediction. The leader is the member with the most finished-match points
 * (tiebreak: exact count), matching the ranking tiebreaker.
 */
export const StatsComparisonPolicy = {
  compute(rows: PoolStatsAggregateRow[], maxPoints: number): PoolComparison {
    const rated = rows.filter((r) => r.finishedCount > 0)
    const leader = pickLeader(rated)

    return {
      exactPct: {
        average: averageOf(rated, exactRate),
        leader: leader ? exactRate(leader) : 0,
      },
      resultPct: {
        average: averageOf(rated, resultRate),
        leader: leader ? resultRate(leader) : 0,
      },
      efficiency: {
        average: averageOf(rated, (r) => effRate(r, maxPoints)),
        leader: leader ? effRate(leader, maxPoints) : 0,
      },
      leaderPoints: leader?.pointsTotal ?? 0,
      leaderUserId: leader?.userId ?? null,
      ratedMembers: rated.length,
    }
  },
}

function exactRate(r: PoolStatsAggregateRow): number {
  return r.finishedCount > 0 ? r.exactCount / r.finishedCount : 0
}

function resultRate(r: PoolStatsAggregateRow): number {
  return r.finishedCount > 0 ? r.resultCount / r.finishedCount : 0
}

function effRate(r: PoolStatsAggregateRow, maxPoints: number): number {
  const denom = r.finishedCount * maxPoints
  return denom > 0 ? r.pointsTotal / denom : 0
}

function averageOf(
  rows: PoolStatsAggregateRow[],
  sel: (r: PoolStatsAggregateRow) => number,
): number {
  if (rows.length === 0) return 0
  return rows.reduce((sum, r) => sum + sel(r), 0) / rows.length
}

function pickLeader(rows: PoolStatsAggregateRow[]): PoolStatsAggregateRow | null {
  if (rows.length === 0) return null
  return rows.reduce((best, r) =>
    r.pointsTotal > best.pointsTotal ||
    (r.pointsTotal === best.pointsTotal && r.exactCount > best.exactCount)
      ? r
      : best,
  )
}
