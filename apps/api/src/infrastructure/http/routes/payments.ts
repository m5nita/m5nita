import { Hono } from 'hono'
import { z } from 'zod'
import { confirmInfinitePayPayment, PaymentCheckFailedError } from '../../../services/infinitepay'
import { requireAuth } from '../middleware/auth'

const paymentsRoutes = new Hono()

const ConfirmBodySchema = z.object({
  orderNsu: z.string().min(1),
  invoiceSlug: z.string().min(1).optional(),
  transactionNsu: z.string().min(1).optional(),
})

paymentsRoutes.post('/payments/infinitepay/confirm', requireAuth, async (c) => {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return c.json({ error: 'INVALID_BODY' }, 400)
  }

  const parsed = ConfirmBodySchema.safeParse(raw)
  if (!parsed.success) {
    return c.json({ error: 'INVALID_BODY' }, 400)
  }

  try {
    const outcome = await confirmInfinitePayPayment(parsed.data)
    if (outcome === 'invalid_order_nsu' || outcome === 'payment_not_found') {
      return c.json({ error: outcome.toUpperCase() }, 404)
    }
    if (outcome === 'gateway_not_configured') {
      return c.json({ error: 'GATEWAY_NOT_CONFIGURED' }, 503)
    }
    return c.json({ status: outcome })
  } catch (err) {
    if (err instanceof PaymentCheckFailedError) {
      return c.json({ error: 'STATUS_LOOKUP_FAILED', message: err.message }, 502)
    }
    throw err
  }
})

export { paymentsRoutes }
