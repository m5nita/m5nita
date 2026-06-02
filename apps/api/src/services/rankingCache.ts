import { createTtlCache } from '../lib/ttlCache'

export type RankingAggregateRow = {
  userId: string
  name: string | null
  totalPoints: number
  exactMatches: number
}

// The finished-match aggregate is the dominant cost on the ranking hot path
// (~63k-row sum + exact-match count for a large league pool) and is recomputed
// on every load AND every 30s live poll, even though finished-match points are
// immutable until the next match-finish transition. Memoize it per pool for
// just under the poll interval so concurrent viewers + window-focus bursts
// collapse to one aggregate per cycle. Live points and the per-user
// `isCurrentUser` marker stay OUTSIDE the cache (computed fresh per request),
// so it is safe to share across users.
//
// Lives in its own db-free module so the invalidation path (calcPoints, on
// match finish) can import it without pulling in the db client.
const RANKING_AGGREGATE_TTL_MS = 25_000
export const rankingAggregateCache = createTtlCache<string, RankingAggregateRow[]>(
  RANKING_AGGREGATE_TTL_MS,
)

/**
 * Bust a pool's cached finished-aggregate. Called when a match finishes and new
 * prediction.points are written, so the next ranking read reflects them
 * immediately instead of after the TTL — otherwise a just-finished match's
 * points briefly vanish (live badge gone, finished total not yet cached).
 */
export function invalidateRankingAggregate(poolId: string): void {
  rankingAggregateCache.invalidate(poolId)
}
