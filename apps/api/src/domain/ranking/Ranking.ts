/**
 * Ranking VO. Encapsulates the tiebreaker policy and shared-position rule used
 * across the application. Callers fetch raw entries already sorted by the full
 * deterministic key (points desc, exactMatches desc, name asc, userId asc) and
 * delegate position assignment here so the rule lives in one place.
 */

export type RankingInput = {
  userId: string
  name: string | null
  totalPoints: number
  livePoints: number
  exactMatches: number
}

export type RankingEntry = RankingInput & {
  position: number
  isCurrentUser: boolean
}

export const Ranking = {
  /**
   * Builds a ranking with shared positions for entries that tie on both
   * `totalPoints` AND `exactMatches`. Assumes `entries` is already sorted
   * by the same tiebreaker (points desc, exactMatches desc).
   */
  build(entries: RankingInput[], currentUserId: string): RankingEntry[] {
    let position = 0
    let lastPoints = Number.NaN
    let lastExact = Number.NaN

    return entries.map((entry, index) => {
      if (entry.totalPoints !== lastPoints || entry.exactMatches !== lastExact) {
        position = index + 1
        lastPoints = entry.totalPoints
        lastExact = entry.exactMatches
      }
      return {
        ...entry,
        position,
        isCurrentUser: entry.userId === currentUserId,
      }
    })
  },
}
