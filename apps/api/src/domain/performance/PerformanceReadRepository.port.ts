/**
 * Raw, per-pool facts for one non-cancelled pool the user belongs to. These are
 * primitives projected by the infrastructure; the domain
 * (`PerformanceCalculation`) turns them into the aggregate summary. Keeping this
 * a projection (not the `Pool` aggregate) is what lets the read stay batched.
 */
export type UserPoolFact = {
  poolId: string
  name: string
  /** Pool lifecycle: 'closed' = decided; anything else here = em andamento. */
  status: string
  entryFeeCentavos: number
  discountPercent: number
  memberCount: number
  /** What the user actually paid to enter (coupon-net; 0 for comp members). */
  entryPaidCentavos: number
  joinedAt: Date
  /** When the pool closed (≈ settlement); null while em andamento. */
  settledAt: Date | null
}

export interface PerformanceReadRepository {
  /** One row per non-cancelled pool the user joined. */
  getUserPoolFacts(userId: string): Promise<UserPoolFact[]>
  /** Pool ids that already have a prize withdrawal row for the user. */
  getUserWithdrawnPoolIds(userId: string): Promise<string[]>
}
