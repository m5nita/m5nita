/**
 * Raw aggregated reads for participant statistics. Infrastructure returns
 * sums/counts per dimension (RAW); the domain (`ParticipantPoolStats`,
 * `StatsComparisonPolicy`, `PendingMatchImpactPolicy`) derives percentages,
 * deltas, efficiency, trend and impact. Same split as the ranking machine
 * (infra aggregates, domain positions). No statistic math lives here.
 */

/** One participant's finished-match aggregates (the viewer). */
export type ParticipantStatsRow = {
  finishedCount: number
  exactCount: number
  resultCount: number
  pointsTotal: number
  homeCorrect: number
  homeTotal: number
  awayCorrect: number
  awayTotal: number
  lowGoalsCorrect: number
  lowGoalsTotal: number
  highGoalsCorrect: number
  highGoalsTotal: number
  /** Current ranking position (1-indexed); null when not yet ranked. */
  position: number | null
  /** Position at the previous recompute; null on first snapshot (trend). */
  prevPosition: number | null
}

/** Per-member aggregates used to derive the pool average and the leader. */
export type PoolStatsAggregateRow = {
  userId: string
  finishedCount: number
  exactCount: number
  resultCount: number
  pointsTotal: number
}

/** The viewer's points in a single finished round (Block B series). */
export type RoundPointsRow = {
  matchday: number
  points: number
}

export interface StatsRepository {
  /**
   * The viewer's persisted finished-match snapshot, or null when no snapshot row
   * exists yet (the caller may bootstrap it via `recomputeSnapshot`).
   */
  participantRow(poolId: string, userId: string): Promise<ParticipantStatsRow | null>
  /** Per-member raw aggregates for the whole pool (average + leader baseline). */
  poolAggregate(poolId: string): Promise<PoolStatsAggregateRow[]>
  /** The viewer's points grouped by finished matchday (Block B). */
  roundPoints(poolId: string, userId: string): Promise<RoundPointsRow[]>
  /** Recompute and upsert the per-user snapshot (run at match finish + on grant). */
  recomputeSnapshot(poolId: string, userId: string): Promise<void>
  // pendingMatches() is added in US3 — its scope-aware match selection must go
  // through the Pool aggregate to stay leak-free, so it lands with that work.
}
