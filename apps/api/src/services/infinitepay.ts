import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { payment } from '../db/schema/payment'
import { infinitePayConfig } from '../lib/infinitepay'
import { handleCheckoutCompleted } from './payment'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PAYMENT_CHECK_URL = 'https://api.infinitepay.io/invoices/public/checkout/payment_check'

const PaymentCheckResponseSchema = z
  .object({
    success: z.boolean().optional(),
    paid: z.boolean().optional(),
    payment: z
      .object({ status: z.string().min(1) })
      .passthrough()
      .optional(),
  })
  .passthrough()

export type ConfirmOutcome =
  | 'completed'
  | 'pending'
  | 'expired'
  | 'invalid_order_nsu'
  | 'gateway_not_configured'
  | 'payment_not_found'
  | 'schema_validation_failed'
  | 'unknown_status'

export class PaymentCheckFailedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PaymentCheckFailedError'
  }
}

function buildCheckRequest(
  handle: string,
  orderNsu: string,
  invoiceSlug: string | undefined,
  transactionNsu: string | undefined,
): Record<string, string> {
  const req: Record<string, string> = { handle, order_nsu: orderNsu }
  // InfinitePay's payment_check API uses field name `slug` (even though the webhook body
  // and the redirect URL use `invoice_slug` for the same value).
  if (invoiceSlug) req.slug = invoiceSlug
  if (transactionNsu) req.transaction_nsu = transactionNsu
  return req
}

async function callPaymentCheck(body: Record<string, string>): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(PAYMENT_CHECK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    throw new PaymentCheckFailedError(err instanceof Error ? err.message : 'unknown network error')
  }
  if (!response.ok) {
    const errText = await response.text().catch(() => '<unreadable>')
    throw new PaymentCheckFailedError(`HTTP ${response.status}: ${errText.slice(0, 500)}`)
  }
  return await response.json()
}

async function applyStatus(
  orderNsu: string,
  currentLocalStatus: string,
  upstreamStatus: string,
): Promise<ConfirmOutcome> {
  if (upstreamStatus === 'paid' || upstreamStatus === 'approved') {
    await handleCheckoutCompleted(orderNsu)
    return 'completed'
  }
  if (
    upstreamStatus === 'rejected' ||
    upstreamStatus === 'failed' ||
    upstreamStatus === 'cancelled' ||
    upstreamStatus === 'expired'
  ) {
    if (currentLocalStatus === 'pending') {
      await db
        .update(payment)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(payment.id, orderNsu))
    }
    return 'expired'
  }
  if (upstreamStatus === 'pending' || upstreamStatus === 'processing') {
    return 'pending'
  }
  console.warn(`[InfinitePay] payment_check returned unknown status: ${upstreamStatus}`)
  return 'unknown_status'
}

export async function confirmInfinitePayPayment(args: {
  orderNsu: string
  invoiceSlug?: string
  transactionNsu?: string
}): Promise<ConfirmOutcome> {
  if (!UUID_RE.test(args.orderNsu)) return 'invalid_order_nsu'
  if (!infinitePayConfig) return 'gateway_not_configured'

  const paymentRow = await db.query.payment.findFirst({
    where: eq(payment.id, args.orderNsu),
  })
  if (!paymentRow) return 'payment_not_found'

  const rawResponse = await callPaymentCheck(
    buildCheckRequest(
      infinitePayConfig.handle,
      args.orderNsu,
      args.invoiceSlug,
      args.transactionNsu,
    ),
  )

  const parsed = PaymentCheckResponseSchema.safeParse(rawResponse)
  if (!parsed.success) {
    console.warn('[InfinitePay] payment_check response failed schema validation')
    return 'schema_validation_failed'
  }

  const status = parsed.data.payment?.status ?? (parsed.data.paid ? 'paid' : 'unknown')
  return applyStatus(args.orderNsu, paymentRow.status, status)
}
