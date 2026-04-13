import { createHmac } from 'node:crypto'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { webhooksRoutes } from '../webhooks'

const mockHandleCheckoutCompleted = vi.fn()

vi.mock('../../../../services/payment', () => ({
  handleCheckoutCompleted: (...args: unknown[]) => mockHandleCheckoutCompleted(...args),
}))

vi.mock('../../../../lib/mercadopago', () => ({
  mercadoPagoClient: { accessToken: 'TEST-token' },
}))

const mockPaymentGet = vi.fn()
vi.mock('mercadopago', () => ({
  Payment: class {
    get(...args: unknown[]) {
      return mockPaymentGet(...args)
    }
  },
}))

const WEBHOOK_SECRET = 'test-webhook-secret'

function createSignature(dataId: string, requestId: string): string {
  const ts = String(Date.now())
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  const hmac = createHmac('sha256', WEBHOOK_SECRET).update(manifest).digest('hex')
  return `ts=${ts},v1=${hmac}`
}

function createTestApp() {
  const app = new Hono()
  app.route('/api', webhooksRoutes)
  return app
}

describe('POST /api/webhooks/mercadopago', () => {
  let app: Hono

  beforeEach(() => {
    app = createTestApp()
    vi.clearAllMocks()
    process.env.MERCADOPAGO_WEBHOOK_SECRET = WEBHOOK_SECRET
  })

  it('approvedPayment_callsHandleCheckoutCompleted', async () => {
    const dataId = '12345'
    const requestId = 'req-abc'

    mockPaymentGet.mockResolvedValueOnce({
      status: 'approved',
      external_reference: 'payment-uuid-123',
    })

    const res = await app.request('/api/webhooks/mercadopago', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': createSignature(dataId, requestId),
        'x-request-id': requestId,
      },
      body: JSON.stringify({ type: 'payment', data: { id: dataId } }),
    })

    expect(res.status).toBe(200)
    expect(mockHandleCheckoutCompleted).toHaveBeenCalledWith('payment-uuid-123')
  })

  it('pendingPayment_doesNotCallHandler', async () => {
    const dataId = '12345'
    const requestId = 'req-abc'

    mockPaymentGet.mockResolvedValueOnce({
      status: 'pending',
      external_reference: 'payment-uuid-123',
    })

    const res = await app.request('/api/webhooks/mercadopago', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': createSignature(dataId, requestId),
        'x-request-id': requestId,
      },
      body: JSON.stringify({ type: 'payment', data: { id: dataId } }),
    })

    expect(res.status).toBe(200)
    expect(mockHandleCheckoutCompleted).not.toHaveBeenCalled()
  })

  it('missingSignatureHeaders_returns400', async () => {
    const res = await app.request('/api/webhooks/mercadopago', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'payment', data: { id: '123' } }),
    })

    expect(res.status).toBe(400)
  })

  it('invalidSignature_logsWarningButProcesses', async () => {
    mockPaymentGet.mockResolvedValueOnce({
      status: 'pending',
      external_reference: 'payment-uuid-123',
    })

    const res = await app.request('/api/webhooks/mercadopago', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': 'ts=123,v1=invalid-hash',
        'x-request-id': 'req-abc',
      },
      body: JSON.stringify({ type: 'payment', data: { id: '123' } }),
    })

    expect(res.status).toBe(200)
    expect(mockHandleCheckoutCompleted).not.toHaveBeenCalled()
  })
})
