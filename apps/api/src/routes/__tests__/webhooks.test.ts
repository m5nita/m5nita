import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { webhooksRoutes } from '../webhooks'

const mockHandleSucceeded = vi.fn()
const mockHandleFailed = vi.fn()

vi.mock('../../services/payment', () => ({
  handlePaymentSucceeded: (...args: unknown[]) => mockHandleSucceeded(...args),
  handlePaymentFailed: (...args: unknown[]) => mockHandleFailed(...args),
}))

vi.mock('../../lib/stripe', () => ({
  stripe: {
    webhooks: {
      constructEventAsync: vi.fn(async (body: string) => {
        const parsed = JSON.parse(body)
        return parsed
      }),
    },
  },
}))

function createTestApp() {
  const app = new Hono()
  app.route('/api', webhooksRoutes)
  return app
}

describe('POST /api/webhooks/stripe', () => {
  let app: Hono

  beforeEach(() => {
    app = createTestApp()
    vi.clearAllMocks()
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  })

  it('handles_paymentSucceeded_callsHandler', async () => {
    const event = {
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_123' } },
    }

    const res = await app.request('/api/webhooks/stripe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'test_sig',
      },
      body: JSON.stringify(event),
    })

    expect(res.status).toBe(200)
    expect(mockHandleSucceeded).toHaveBeenCalledWith('pi_123')
  })

  it('handles_paymentFailed_callsHandler', async () => {
    const event = {
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_456' } },
    }

    const res = await app.request('/api/webhooks/stripe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'test_sig',
      },
      body: JSON.stringify(event),
    })

    expect(res.status).toBe(200)
    expect(mockHandleFailed).toHaveBeenCalledWith('pi_456')
  })

  it('rejects_missingSignature_400', async () => {
    const res = await app.request('/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })

    expect(res.status).toBe(400)
  })
})
