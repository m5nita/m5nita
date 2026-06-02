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

export interface RankingRepository {
  /** Read precomputed standings (one row per member), sorted by the tiebreaker. */
  getStandings(poolId: string): Promise<StandingRow[]>
  /** Recompute and upsert a pool's standings from predictions (run on match finish). */
  recomputeStandings(poolId: string): Promise<void>
  getPoolRanking(poolId: string, userId: string): Promise<RankingEntry[]>
  getPoolMemberCount(poolId: string): Promise<number>
}
