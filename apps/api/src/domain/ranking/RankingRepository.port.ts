export type RankingEntry = {
  position: number
  userId: string
  name: string | null
  totalPoints: number
  exactMatches: number
  isCurrentUser: boolean
}

export interface RankingRepository {
  getPoolRanking(poolId: string, userId: string): Promise<RankingEntry[]>
  getPoolMemberCount(poolId: string): Promise<number>
}
