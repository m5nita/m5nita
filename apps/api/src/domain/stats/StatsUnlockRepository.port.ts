/**
 * Entitlement port for the per-pool statistics unlock. Granting itself happens
 * inside the payment-completion transaction (`services/payment.ts`) as an
 * idempotent `INSERT … ON CONFLICT (user_id, pool_id) DO NOTHING`, mirroring how
 * pool entry inserts `poolMember` in the same tx — so it is atomic with the
 * payment CAS. This port exposes the reads the rest of the app needs.
 */
export interface StatsUnlockRepository {
  /** Server-side gate: has this participant unlocked stats for this pool? */
  isUnlocked(userId: string, poolId: string): Promise<boolean>
  /** Users with an entitlement in the pool (bounded set for match-finish recompute). */
  listUnlockedUsers(poolId: string): Promise<string[]>
}
