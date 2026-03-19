import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { webhooksRoutes } from '../webhooks'

const mockHandleCheckoutCompleted = vi.fn()
const mockHandleCheckoutExpired = vi.fn()

vi.mock('../../services/payment', () => ({
  handleCheckoutCompleted: (...args: unknown[]) => mockHandleCheckoutCompleted(...args),
  handleCheckoutExpired: (...args: unknown[]) => mockHandleCheckoutExpired(...args),
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

  it('handles_checkoutCompleted_callsHandler', async () => {
    const event = {
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_123' } },
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
    expect(mockHandleCheckoutCompleted).toHaveBeenCalledWith('cs_123')
  })

  it('handles_checkoutExpired_callsHandler', async () => {
    const event = {
      type: 'checkout.session.expired',
      data: { object: { id: 'cs_456' } },
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
    expect(mockHandleCheckoutExpired).toHaveBeenCalledWith('cs_456')
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
