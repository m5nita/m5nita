import { and, eq, ne } from 'drizzle-orm'
import type { DbExecutor } from '../../db/client'
import { payment } from '../../db/schema/payment'
import type { ClaimedPayment, PaymentRepository } from '../../domain/payment/PaymentRepository.port'

export class DrizzlePaymentRepository implements PaymentRepository {
  constructor(private readonly db: DbExecutor) {}

  async claimCompletion(paymentId: string): Promise<ClaimedPayment | null> {
    const claimed = await this.db
      .update(payment)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(and(eq(payment.id, paymentId), ne(payment.status, 'completed')))
      .returning()

    const row = claimed[0]
    if (!row) return null
    return {
      id: row.id,
      poolId: row.poolId,
      userId: row.userId,
      type: row.type as ClaimedPayment['type'],
    }
  }

  async exists(paymentId: string): Promise<boolean> {
    const row = await this.db.query.payment.findFirst({
      where: eq(payment.id, paymentId),
      columns: { id: true },
    })
    return row !== undefined
  }
}
