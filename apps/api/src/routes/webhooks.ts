import { Hono } from 'hono'
import { stripe } from '../lib/stripe'
import { handlePaymentSucceeded, handlePaymentFailed } from '../services/payment'

const webhooksRoutes = new Hono()

// POST /api/webhooks/stripe — Stripe webhook handler
// No auth middleware — uses Stripe signature verification
webhooksRoutes.post('/webhooks/stripe', async (c) => {
  const body = await c.req.text()
  const sig = c.req.header('stripe-signature')

  if (!sig) {
    return c.json({ error: 'MISSING_SIGNATURE', message: 'Stripe signature missing' }, 400)
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured')
    return c.json({ error: 'CONFIG_ERROR', message: 'Webhook not configured' }, 500)
  }

  let event
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return c.json({ error: 'INVALID_SIGNATURE', message: 'Invalid signature' }, 400)
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object
      await handlePaymentSucceeded(paymentIntent.id)
      break
    }
    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object
      await handlePaymentFailed(paymentIntent.id)
      break
    }
    default:
      // Unhandled event type — acknowledge but ignore
      break
  }

  return c.json({ received: true })
})

export { webhooksRoutes }
