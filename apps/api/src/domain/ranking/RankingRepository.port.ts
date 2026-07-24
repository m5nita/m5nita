export type RankingEntry = {
  position: number
  userId: string
  name: string | null
  totalPoints: number
  exactMatches: number
  isCurrentUser: boolean
}

/** A member's finished-match standing, before position assignment. */
export type StandingRow = {
  userId: string
  name: string | null
  totalPoints: number
  exactMatches: number
}

/** A standing row tagged with its pool, for batched multi-pool reads. */
export type PoolStandingRow = StandingRow & { poolId: string }

export interface RankingRepository {
  /** Read precomputed standings (one row per member), sorted by the tiebreaker. */
  getStandings(poolId: string): Promise<StandingRow[]>
  /**
   * Standings for many pools in ONE read (avoids the per-pool N+1). Rows are
   * grouped by pool, each group pre-sorted by the same tiebreaker as
   * `getStandings`, so callers can delegate position assignment to `Ranking.build`.
   */
  getStandingsForPools(poolIds: string[]): Promise<PoolStandingRow[]>
  /** Recompute and upsert a pool's standings from predictions (run on match finish). */
  recomputeStandings(poolId: string): Promise<void>
  getPoolRanking(poolId: string, userId: string): Promise<RankingEntry[]>
  getPoolMemberCount(poolId: string): Promise<number>
}
