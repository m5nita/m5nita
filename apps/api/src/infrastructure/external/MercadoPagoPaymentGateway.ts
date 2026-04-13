import { eq } from 'drizzle-orm'
import type { MercadoPagoConfig } from 'mercadopago'
import { Preference } from 'mercadopago'
import type {
  CheckoutParams,
  CheckoutResult,
  PaymentGateway,
} from '../../application/ports/PaymentGateway.port'
import type { db as DbClient } from '../../db/client'
import { payment } from '../../db/schema/payment'

export class MercadoPagoPaymentGateway implements PaymentGateway {
  private preference: Preference

  constructor(
    client: MercadoPagoConfig,
    private db: typeof DbClient,
  ) {
    this.preference = new Preference(client)
  }

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
    const apiUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3001'
    const isLocalhost = origin.includes('localhost')

    const preferenceResponse = await this.preference.create({
      body: {
        items: [
          {
            id: paymentRecord.id,
            title: 'Entrada no Bolão',
            quantity: 1,
            unit_price: amount / 100,
            currency_id: 'BRL',
          },
        ],
        back_urls: {
          success: `${origin}/pools/payment-success`,
          failure: `${origin}/`,
          pending: `${origin}/pools/payment-success`,
        },
        ...(isLocalhost ? {} : { auto_return: 'approved' }),
        external_reference: paymentRecord.id,
        metadata: { userId, poolId, type: 'entry' },
        notification_url: `${apiUrl}/api/webhooks/mercadopago`,
      },
    })

    await this.db
      .update(payment)
      .set({ externalPaymentId: preferenceResponse.id })
      .where(eq(payment.id, paymentRecord.id))

    return {
      payment: paymentRecord,
      checkoutUrl: preferenceResponse.init_point ?? null,
    }
  }

  isConfigured(): boolean {
    return true
  }
}
