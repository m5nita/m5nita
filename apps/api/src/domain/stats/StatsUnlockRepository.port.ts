/**
 * Entitlement port for the per-pool statistics unlock. Granting happens inside
 * the payment-completion unit of work (`CompleteCheckoutUseCase`) as an
 * idempotent `INSERT … ON CONFLICT (user_id, pool_id) DO NOTHING`, mirroring how
 * pool entry inserts `poolMember` in the same transaction — so it is atomic with
 * the payment CAS.
 */
export interface StatsUnlockRepository {
  /** Server-side gate: has this participant unlocked stats for this pool? */
  isUnlocked(userId: string, poolId: string): Promise<boolean>
  /** Users with an entitlement in the pool (bounded set for match-finish recompute). */
  listUnlockedUsers(poolId: string): Promise<string[]>
  /** Idempotent grant of the entitlement, referencing the completed payment. */
  grant(data: { userId: string; poolId: string; paymentId: string }): Promise<void>
}
