import { createHmac } from 'node:crypto'
import { Hono } from 'hono'
import { Payment } from 'mercadopago'
import type Stripe from 'stripe'
import { mercadoPagoClient } from '../../../lib/mercadopago'
import { stripe } from '../../../lib/stripe'
import { handleCheckoutCompleted } from '../../../services/payment'

const webhooksRoutes = new Hono()

function verifyWebhookSignature(
  xSignature: string,
  xRequestId: string,
  dataId: string | null,
): boolean {
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET
  if (!webhookSecret) return false

  const signatureParts = xSignature.split(',')
  let ts = ''
  let v1 = ''
  for (const part of signatureParts) {
    const [key = '', value = ''] = part.split('=')
    if (key.trim() === 'ts') ts = value.trim()
    else if (key.trim() === 'v1') v1 = value.trim()
  }

  if (!ts || !v1) return false

  let manifest = ''
  if (dataId) manifest += `id:${dataId};`
  manifest += `request-id:${xRequestId};`
  manifest += `ts:${ts};`

  const hmac = createHmac('sha256', webhookSecret).update(manifest).digest('hex')
  return hmac === v1
}

webhooksRoutes.post('/webhooks/mercadopago', async (c) => {
  const body = await c.req.json()
  const xSignature = c.req.header('x-signature')
  const xRequestId = c.req.header('x-request-id')

  if (!xSignature || !xRequestId) {
    return c.json({ error: 'MISSING_HEADERS', message: 'Signature headers missing' }, 400)
  }

  const isPayment =
    body?.type === 'payment' || body?.topic === 'payment' || c.req.query('topic') === 'payment'

  if (!isPayment) {
    return c.json({ received: true })
  }

  const queryDataId = c.req.query('data.id') ?? null

  if (!verifyWebhookSignature(xSignature, xRequestId, queryDataId)) {
    console.warn('[MercadoPago] Webhook signature verification failed')
  }

  const paymentId = String(body?.data?.id ?? queryDataId ?? '')
  if (!paymentId || !mercadoPagoClient) {
    return c.json({ received: true })
  }

  const paymentClient = new Payment(mercadoPagoClient)
  const mpPayment = await paymentClient.get({ id: Number(paymentId) })

  if (mpPayment.status === 'approved' && mpPayment.external_reference) {
    await handleCheckoutCompleted(mpPayment.external_reference)
  }

  return c.json({ received: true })
})

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

export { webhooksRoutes }
