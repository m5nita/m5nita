/**
 * Port for the payment aggregate's completion path. The adapter implements
 * claimCompletion as a compare-and-set (`status <> 'completed'` guard) so a
 * duplicate webhook can never claim the same payment twice.
 */
export type ClaimedPayment = {
  id: string
  poolId: string
  userId: string
  type: 'entry' | 'stats_unlock' | 'prize'
}

export interface PaymentRepository {
  /**
   * Atomically marks the payment completed if (and only if) it was not
   * already. Returns the claimed payment, or null when there was nothing to
   * claim — already completed or no such record (disambiguate via exists()).
   */
  claimCompletion(paymentId: string): Promise<ClaimedPayment | null>
  /** Whether a payment row with this id exists at all. */
  exists(paymentId: string): Promise<boolean>
}
