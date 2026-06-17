/**
 * Raw aggregated reads for participant statistics. Infrastructure returns
 * sums/counts per dimension (RAW); the domain (`ParticipantPoolStats`,
 * `StatsComparisonPolicy`, `PredictorProfilePolicy`, `ClimbPolicy`) derives
 * percentages, deltas, efficiency, trend, the profile and the climb. Same split
 * as the ranking machine (infra aggregates, domain positions). No statistic math
 * lives here.
 */

/** One participant's finished-match aggregates (the viewer). */
export type ParticipantStatsRow = {
  finishedCount: number
  exactCount: number
  resultCount: number
  pointsTotal: number
  /** Current ranking position (1-indexed); null when not yet ranked. */
  position: number | null
  /** Position at the previous recompute; null on first snapshot (trend). */
  prevPosition: number | null
}

/** Per-member aggregates used to derive the pool average, the leader, and the
 * climb standings. `displayName` is the leaderboard-public name (null when the
 * user has none); only the climb uses it (comparison baselines ignore it). */
export type PoolStatsAggregateRow = {
  userId: string
  displayName: string | null
  finishedCount: number
  exactCount: number
  resultCount: number
  pointsTotal: number
}

/** Per-member points for one finished match — the basis for the evolution lines. */
export type PoolMatchPointsRow = {
  userId: string
  matchId: string
  matchDate: Date
  points: number
}

/**
 * One of the viewer's finished predictions — raw scores plus the points already
 * persisted for it. Powers both the recent-form strip and the predictor profile
 * (draws, near-miss, goal calibration, goal-type strength) in the domain.
 */
export type ProfileFactRow = {
  predHome: number
  predAway: number
  actualHome: number
  actualAway: number
  points: number
}

export interface StatsRepository {
  /**
   * The viewer's persisted finished-match snapshot, or null when no snapshot row
   * exists yet (the caller may bootstrap it via `recomputeSnapshot`).
   */
  participantRow(poolId: string, userId: string): Promise<ParticipantStatsRow | null>
  /** Per-member raw aggregates for the whole pool (average + leader + climb baseline). */
  poolAggregate(poolId: string): Promise<PoolStatsAggregateRow[]>
  /** Per-member points for each finished match in the pool (evolution lines). */
  poolMatchPoints(poolId: string): Promise<PoolMatchPointsRow[]>
  /** All the viewer's finished predictions, most-recent first (form strip + profile). */
  viewerFinishedPredictions(poolId: string, userId: string): Promise<ProfileFactRow[]>
  /** Recompute and upsert the per-user snapshot (run at match finish + on grant). */
  recomputeSnapshot(poolId: string, userId: string): Promise<void>
}
