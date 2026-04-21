import type { Hono } from 'hono'
import type { AppEnv } from '../../../src/types/hono'
import { infinitePayStub } from './stubs'

/**
 * Marks a pending InfinitePay payment as paid in the stub, then delivers the
 * webhook to the real /api/webhooks/infinitepay handler. Returns the webhook
 * response so scenarios can assert status.
 */
export async function deliverInfinitePayPaidWebhook(
  app: Hono<AppEnv>,
  paymentId: string,
): Promise<Response> {
  infinitePayStub.setStatus(paymentId, 'paid')
  return app.fetch(
    new Request('http://localhost/api/webhooks/infinitepay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'http://localhost:5173',
      },
      body: JSON.stringify({
        order_nsu: paymentId,
        invoice_slug: `slug-${paymentId}`,
        transaction_nsu: `txn-${paymentId}`,
      }),
    }),
  )
}

export async function deliverInfinitePayFailedWebhook(
  app: Hono<AppEnv>,
  paymentId: string,
): Promise<Response> {
  infinitePayStub.setStatus(paymentId, 'rejected')
  return app.fetch(
    new Request('http://localhost/api/webhooks/infinitepay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'http://localhost:5173',
      },
      body: JSON.stringify({
        order_nsu: paymentId,
        invoice_slug: `slug-${paymentId}`,
        transaction_nsu: `txn-${paymentId}`,
      }),
    }),
  )
}
