import { Hono } from 'hono'
import type Stripe from 'stripe'
import { stripe } from '../../../lib/stripe'
import { confirmInfinitePayPayment, PaymentCheckFailedError } from '../../../services/infinitepay'
import { handleCheckoutCompleted } from '../../../services/payment'

const webhooksRoutes = new Hono()

function pickString(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c
  }
  return null
}

function extractField(body: unknown, key: string): string | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const nestedPayment =
    b.payment && typeof b.payment === 'object'
      ? (b.payment as Record<string, unknown>)[key]
      : undefined
  const nestedData =
    b.data && typeof b.data === 'object' ? (b.data as Record<string, unknown>)[key] : undefined
  return pickString(b[key], nestedPayment, nestedData)
}

webhooksRoutes.post('/webhooks/stripe', async (c) => {
  const body = await c.req.text()
  const sig = c.req.header('stripe-signature')

  if (!sig) {
    return c.json({ error: 'MISSING_SIGNATURE', message: 'Stripe signature missing' }, 400)
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret || !stripe) {
    return c.json({ error: 'CONFIG_ERROR', message: 'Stripe webhook not configured' }, 500)
  }

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret)
  } catch (err) {
    console.error('[Stripe] Webhook signature verification failed:', err)
    return c.json({ error: 'INVALID_SIGNATURE', message: 'Invalid signature' }, 400)
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const paymentId = session.metadata?.paymentId
    if (paymentId) {
      await handleCheckoutCompleted(paymentId)
    }
  }

  return c.json({ received: true })
})

webhooksRoutes.post('/webhooks/infinitepay', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'INVALID_BODY' }, 400)
  }

  const orderNsu = extractField(body, 'order_nsu')
  if (!orderNsu) {
    console.info('[InfinitePay] webhook received without extractable order_nsu')
    return c.json({ received: true })
  }

  try {
    const outcome = await confirmInfinitePayPayment({
      orderNsu,
      invoiceSlug: extractField(body, 'invoice_slug') ?? extractField(body, 'slug') ?? undefined,
      transactionNsu: extractField(body, 'transaction_nsu') ?? undefined,
    })
    if (
      outcome === 'invalid_order_nsu' ||
      outcome === 'gateway_not_configured' ||
      outcome === 'payment_not_found'
    ) {
      console.warn(`[InfinitePay] webhook outcome=${outcome} for order_nsu=${orderNsu}`)
    }
    return c.json({ received: true })
  } catch (err) {
    if (err instanceof PaymentCheckFailedError) {
      console.error('[InfinitePay] payment_check call failed', err.message)
      return c.json({ error: 'STATUS_LOOKUP_FAILED' }, 500)
    }
    throw err
  }
})

export { webhooksRoutes }
