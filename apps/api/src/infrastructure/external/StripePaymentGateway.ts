import { eq } from 'drizzle-orm'
import type Stripe from 'stripe'
import type {
  CheckoutParams,
  CheckoutResult,
  PaymentGateway,
} from '../../application/ports/PaymentGateway.port'
import type { db as DbClient } from '../../db/client'
import { payment } from '../../db/schema/payment'

export class StripePaymentGateway implements PaymentGateway {
  constructor(
    private stripe: Stripe,
    private db: typeof DbClient,
  ) {}

  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    const { userId, poolId, amount, platformFee } = params

    const [paymentRecord] = await this.db
      .insert(payment)
      .values({
        userId,
        poolId,
        amount,
        platformFee,
        status: 'pending',
        type: 'entry',
      })
      .returning()

    if (!paymentRecord) {
      throw new Error('Failed to create payment record')
    }

    const origin = process.env.ALLOWED_ORIGIN || 'http://localhost:5173'

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
      metadata: { userId, poolId, type: 'entry', paymentId: paymentRecord.id },
      success_url: `${origin}/pools/payment-success`,
      cancel_url: `${origin}/`,
    })

    await this.db
      .update(payment)
      .set({ externalPaymentId: session.id })
      .where(eq(payment.id, paymentRecord.id))

    return {
      payment: paymentRecord,
      checkoutUrl: session.url,
    }
  }

  isConfigured(): boolean {
    return true
  }
}
