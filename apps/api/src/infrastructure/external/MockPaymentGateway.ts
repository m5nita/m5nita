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
        externalPaymentId: `mock_pi_${crypto.randomUUID()}`,
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

  isConfigured(): boolean {
    return false
  }
}
