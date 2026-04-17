import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type {
  CheckoutParams,
  CheckoutResult,
  PaymentGateway,
} from '../../application/ports/PaymentGateway.port'
import type { db as DbClient } from '../../db/client'
import { user } from '../../db/schema/auth'
import { payment } from '../../db/schema/payment'

const CREATE_LINK_URL = 'https://api.infinitepay.io/invoices/public/checkout/links'

const CreateLinkResponseSchema = z
  .object({
    url: z.string().url().optional(),
    checkout_url: z.string().url().optional(),
    link_url: z.string().url().optional(),
    link: z.string().url().optional(),
  })
  .passthrough()

function pickCheckoutUrl(parsed: z.infer<typeof CreateLinkResponseSchema>): string | null {
  return parsed.url ?? parsed.checkout_url ?? parsed.link_url ?? parsed.link ?? null
}

type CustomerInfo = { name?: string; email?: string; phone_number?: string }

function buildCustomer(
  record: {
    name: string | null
    email: string | null
    phoneNumber: string | null
  } | null,
): CustomerInfo | undefined {
  if (!record) return undefined
  const customer: CustomerInfo = {}
  if (record.name) customer.name = record.name
  if (record.email) customer.email = record.email
  if (record.phoneNumber) customer.phone_number = record.phoneNumber
  return Object.keys(customer).length > 0 ? customer : undefined
}

export class InfinitePayPaymentGateway implements PaymentGateway {
  constructor(
    private handle: string,
    private db: typeof DbClient,
  ) {}

  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    const paymentRecord = await this.insertPendingRow(params)
    try {
      const checkoutUrl = await this.createLink(paymentRecord.id, params.userId, params.amount)
      return { payment: { id: paymentRecord.id }, checkoutUrl }
    } catch (err) {
      console.error(
        '[InfinitePay] checkout creation failed',
        err instanceof Error ? err.message : 'unknown error',
      )
      await this.db.delete(payment).where(eq(payment.id, paymentRecord.id))
      throw new Error('InfinitePay checkout creation failed')
    }
  }

  isConfigured(): boolean {
    return true
  }

  private async insertPendingRow(params: CheckoutParams) {
    const [row] = await this.db
      .insert(payment)
      .values({
        userId: params.userId,
        poolId: params.poolId,
        amount: params.amount,
        platformFee: params.platformFee,
        status: 'pending',
        type: 'entry',
      })
      .returning()
    if (!row) throw new Error('Failed to create payment record')
    return row
  }

  private async createLink(paymentId: string, userId: string, amount: number): Promise<string> {
    const customerRecord = await this.db.query.user.findFirst({ where: eq(user.id, userId) })
    const body = this.buildRequestBody(paymentId, amount, buildCustomer(customerRecord ?? null))

    const response = await fetch(CREATE_LINK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const errorText = await response.text().catch(() => '<unreadable>')
      throw new Error(
        `InfinitePay create-link returned ${response.status}: ${errorText.slice(0, 500)}`,
      )
    }

    const rawResponse = await response.json()
    const parsed = CreateLinkResponseSchema.parse(rawResponse)
    const checkoutUrl = pickCheckoutUrl(parsed)
    if (!checkoutUrl) {
      throw new Error(
        `InfinitePay response missing checkout url: ${JSON.stringify(rawResponse).slice(0, 500)}`,
      )
    }
    await this.db
      .update(payment)
      .set({ externalPaymentId: paymentId })
      .where(eq(payment.id, paymentId))

    console.info(`[InfinitePay] checkout link created (order_nsu=${paymentId})`)
    return checkoutUrl
  }

  private buildRequestBody(paymentId: string, amount: number, customer: CustomerInfo | undefined) {
    const origin = process.env.ALLOWED_ORIGIN || 'http://localhost:5173'
    const apiUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3001'
    return {
      handle: this.handle,
      redirect_url: `${origin}/pools/payment-success?payment_id=${paymentId}`,
      webhook_url: `${apiUrl}/api/webhooks/infinitepay`,
      order_nsu: paymentId,
      ...(customer ? { customer } : {}),
      items: [{ description: 'Entrada no Bolão', quantity: 1, price: amount }],
    }
  }
}
