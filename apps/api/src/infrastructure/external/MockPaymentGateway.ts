import type {
  CheckoutParams,
  CheckoutResult,
  PaymentGateway,
} from '../../application/ports/PaymentGateway.port'
import type { db as DbClient } from '../../db/client'
import { payment } from '../../db/schema/payment'
import { handleCheckoutCompleted } from '../../services/payment'

/**
 * Dev/test gateway: no real provider. Inserts a pending payment with the
 * requested type, then runs the SAME completion path as a real webhook
 * (`handleCheckoutCompleted`) so the dispatch (entry → activate + member;
 * stats_unlock → grant) is exercised once, with no duplicated logic.
 * `handleCheckoutCompleted` uses the module db, which is this gateway's db in
 * dev (the default container db).
 */
export class MockPaymentGateway implements PaymentGateway {
  constructor(private db: typeof DbClient) {}

  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    const { userId, poolId, amount, platformFee } = params
    const type = params.type ?? 'entry'

    console.log(`[DEV] Mock payment: ${amount / 100} BRL for pool ${poolId} (${type})`)

    const [paymentRecord] = await this.db
      .insert(payment)
      .values({
        userId,
        poolId,
        amount,
        platformFee,
        externalPaymentId: `mock_pi_${crypto.randomUUID()}`,
        status: 'pending',
        type,
      })
      .returning()

    if (!paymentRecord) {
      throw new Error('Failed to create payment record')
    }

    await handleCheckoutCompleted(paymentRecord.id)

    return {
      payment: paymentRecord,
      checkoutUrl: null,
    }
  }

  isConfigured(): boolean {
    return false
  }
}
