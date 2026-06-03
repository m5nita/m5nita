import type { PoolStatsAggregateRow } from '../domain/stats/StatsRepository.port'
import { createTtlCache } from '../lib/ttlCache'

// Sibling of rankingCache: the per-pool stats aggregate (per-member finished
// counts) is heavy read-side work, immutable until the next match-finish. Cache
// it per pool just under the live-poll interval so concurrent viewers and
// focus bursts collapse to one aggregate per cycle. It holds only anonymized
// per-member counts — safe to share across viewers. Invalidated at the SAME
// point as the ranking aggregate (jobs/calcPoints, on match finish).
//
// db-free module so the invalidation path can import it without the db client.
const PARTICIPANT_STATS_AGGREGATE_TTL_MS = 25_000

export const participantStatsAggregateCache = createTtlCache<string, PoolStatsAggregateRow[]>(
  PARTICIPANT_STATS_AGGREGATE_TTL_MS,
)

/** Bust a pool's cached stats aggregate (called on match finish, with ranking). */
export function invalidateParticipantStatsAggregate(poolId: string): void {
  participantStatsAggregateCache.invalidate(poolId)
}
