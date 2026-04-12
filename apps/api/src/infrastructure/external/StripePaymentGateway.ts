import { and, eq } from 'drizzle-orm'
import type Stripe from 'stripe'
import type {
  CheckoutParams,
  CheckoutResult,
  PaymentGateway,
} from '../../application/ports/PaymentGateway.port'
import type { db as DbClient } from '../../db/client'
import { payment } from '../../db/schema/payment'
import { poolMember } from '../../db/schema/poolMember'

export class StripePaymentGateway implements PaymentGateway {
  constructor(
    private stripe: Stripe,
    private db: typeof DbClient,
  ) {}

  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    const { userId, poolId, amount, platformFee } = params

    const successUrl = `${process.env.ALLOWED_ORIGIN || 'http://localhost:5173'}/pools/payment-success?session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${process.env.ALLOWED_ORIGIN || 'http://localhost:5173'}/`

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: { name: 'Entrada no Bolão' },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      metadata: { userId, poolId, type: 'entry' },
      success_url: successUrl,
      cancel_url: cancelUrl,
    })

    const [paymentRecord] = await this.db
      .insert(payment)
      .values({
        userId,
        poolId,
        amount,
        platformFee,
        stripePaymentIntentId: session.id,
        status: 'pending',
        type: 'entry',
      })
      .returning()

    return {
      payment: paymentRecord as NonNullable<typeof paymentRecord>,
      checkoutUrl: session.url,
    }
  }

  async refund(paymentId: string): Promise<void> {
    const paymentRecord = await this.db.query.payment.findFirst({
      where: eq(payment.id, paymentId),
    })

    if (!paymentRecord || paymentRecord.status !== 'completed') {
      throw new Error('Payment not found or not completed')
    }

    if (paymentRecord.stripePaymentIntentId) {
      const session = await this.stripe.checkout.sessions.retrieve(
        paymentRecord.stripePaymentIntentId,
      )
      if (session.payment_intent) {
        await this.stripe.refunds.create({
          payment_intent: session.payment_intent as string,
        })
      }
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
    return true
  }
}
