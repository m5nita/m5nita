import { and, eq } from 'drizzle-orm'
import type {
  CheckoutParams,
  CheckoutResult,
  PaymentGateway,
} from '../../application/ports/PaymentGateway.port'
import type { db as DbClient } from '../../db/client'
import { payment } from '../../db/schema/payment'
import { pool } from '../../db/schema/pool'
import { poolMember } from '../../db/schema/poolMember'

export class MockPaymentGateway implements PaymentGateway {
  constructor(private db: typeof DbClient) {}

  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    const { userId, poolId, amount, platformFee } = params

    console.log(`[DEV] Mock payment: ${amount / 100} BRL for pool ${poolId}`)

    const [paymentRecord] = await this.db
      .insert(payment)
      .values({
        userId,
        poolId,
        amount,
        platformFee,
        stripePaymentIntentId: `mock_pi_${crypto.randomUUID()}`,
        status: 'completed',
        type: 'entry',
      })
      .returning()

    await this.db
      .update(pool)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(pool.id, poolId))

    const existing = await this.db.query.poolMember.findFirst({
      where: and(eq(poolMember.poolId, poolId), eq(poolMember.userId, userId)),
    })
    if (!existing && paymentRecord) {
      await this.db.insert(poolMember).values({
        poolId,
        userId,
        paymentId: paymentRecord.id,
      })
    }

    return {
      payment: paymentRecord as NonNullable<typeof paymentRecord>,
      checkoutUrl: null,
    }
  }

  async refund(paymentId: string): Promise<void> {
    const paymentRecord = await this.db.query.payment.findFirst({
      where: eq(payment.id, paymentId),
    })

    if (!paymentRecord || paymentRecord.status !== 'completed') {
      throw new Error('Payment not found or not completed')
    }

    await this.db
      .update(payment)
      .set({ status: 'refunded', updatedAt: new Date() })
      .where(eq(payment.id, paymentId))

    await this.db
      .delete(poolMember)
      .where(
        and(
          eq(poolMember.poolId, paymentRecord.poolId),
          eq(poolMember.userId, paymentRecord.userId),
        ),
      )
  }

  isConfigured(): boolean {
    return false
  }
}
