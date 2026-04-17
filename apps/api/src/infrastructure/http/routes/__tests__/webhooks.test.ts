import { createHmac } from 'node:crypto'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { webhooksRoutes } from '../webhooks'

const mockHandleCheckoutCompleted = vi.fn()

vi.mock('../../../../services/payment', () => ({
  handleCheckoutCompleted: (...args: unknown[]) => mockHandleCheckoutCompleted(...args),
}))

vi.mock('../../../../lib/mercadopago', () => ({
  mercadoPagoClient: { accessToken: 'TEST-token' },
}))

const mockStripeConstructEvent = vi.fn()
vi.mock('../../../../lib/stripe', () => ({
  stripe: {
    webhooks: {
      constructEventAsync: (...args: unknown[]) => mockStripeConstructEvent(...args),
    },
  },
}))

const mockPaymentGet = vi.fn()
vi.mock('mercadopago', () => ({
  Payment: class {
    get(...args: unknown[]) {
      return mockPaymentGet(...args)
    }
  },
}))

const mockPaymentFindFirst = vi.fn()
const mockUpdateWhere = vi.fn()
const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere })
const mockDbUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet })

vi.mock('../../../../db/client', () => ({
  db: {
    query: {
      payment: {
        findFirst: (...args: unknown[]) => mockPaymentFindFirst(...args),
      },
    },
    update: (...args: unknown[]) => mockDbUpdate(...args),
  },
}))

vi.mock('../../../../lib/infinitepay', () => ({
  infinitePayConfig: { handle: 'test-handle' },
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

describe('POST /api/webhooks/stripe', () => {
  let app: Hono

  beforeEach(() => {
    app = createTestApp()
    vi.clearAllMocks()
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  })

  it('checkoutCompleted_callsHandleCheckoutCompleted', async () => {
    mockStripeConstructEvent.mockResolvedValueOnce({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          metadata: { paymentId: 'payment-uuid-456' },
        },
      },
    })

    const res = await app.request('/api/webhooks/stripe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'test_sig',
      },
      body: '{}',
    })

    expect(res.status).toBe(200)
    expect(mockHandleCheckoutCompleted).toHaveBeenCalledWith('payment-uuid-456')
  })

  it('otherEventTypes_doNotCallHandler', async () => {
    mockStripeConstructEvent.mockResolvedValueOnce({
      type: 'checkout.session.expired',
      data: { object: { id: 'cs_456' } },
    })

    const res = await app.request('/api/webhooks/stripe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'test_sig',
      },
      body: '{}',
    })

    expect(res.status).toBe(200)
    expect(mockHandleCheckoutCompleted).not.toHaveBeenCalled()
  })

  it('missingSignature_returns400', async () => {
    const res = await app.request('/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })

    expect(res.status).toBe(400)
  })

  it('invalidSignature_returns400', async () => {
    mockStripeConstructEvent.mockRejectedValueOnce(new Error('Invalid signature'))

    const res = await app.request('/api/webhooks/stripe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'bad_sig',
      },
      body: '{}',
    })

    expect(res.status).toBe(400)
    expect(mockHandleCheckoutCompleted).not.toHaveBeenCalled()
  })
})

describe('POST /api/webhooks/infinitepay', () => {
  const PAYMENT_UUID = '00000000-0000-4000-8000-000000000001'
  let app: Hono
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    app = createTestApp()
    vi.clearAllMocks()
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function seedPayment(overrides: { status?: string; externalPaymentId?: string | null } = {}) {
    const externalPaymentId =
      'externalPaymentId' in overrides ? overrides.externalPaymentId : PAYMENT_UUID
    mockPaymentFindFirst.mockResolvedValueOnce({
      id: PAYMENT_UUID,
      userId: 'user-1',
      poolId: 'pool-1',
      status: overrides.status ?? 'pending',
      externalPaymentId,
      type: 'entry',
    })
  }

  function post(body: string, contentType = 'application/json') {
    return app.request('/api/webhooks/infinitepay', {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
    })
  }

  function mockPaymentCheckStatus(status: string) {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, payment: { status } }),
    })
  }

  it('returns400ForNonJsonBody', async () => {
    const res = await post('not-json-at-all')
    expect(res.status).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns200WhenBodyHasNoExtractableIdentifier', async () => {
    const res = await post(JSON.stringify({}))
    expect(res.status).toBe(200)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mockPaymentFindFirst).not.toHaveBeenCalled()
  })

  it('returns200WhenIdentifierIsNotValidUuid', async () => {
    const res = await post(JSON.stringify({ order_nsu: 'not-a-uuid' }))
    expect(res.status).toBe(200)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns200WhenIdentifierHasNoLocalPaymentMatch', async () => {
    mockPaymentFindFirst.mockResolvedValueOnce(undefined)
    const res = await post(JSON.stringify({ order_nsu: PAYMENT_UUID }))
    expect(res.status).toBe(200)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('callsPaymentCheckWithHandleAndOrderNsuAndSlugFromBody', async () => {
    seedPayment()
    mockPaymentCheckStatus('pending')

    await post(
      JSON.stringify({
        order_nsu: PAYMENT_UUID,
        invoice_slug: 'inv-abc',
        transaction_nsu: 'tx-123',
      }),
    )

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] ?? []
    expect(url).toBe('https://api.infinitepay.io/invoices/public/checkout/payment_check')
    const body = JSON.parse(init?.body as string)
    // NOTE: InfinitePay's payment_check API expects "slug" (not "invoice_slug") as the field
    // name — even though the webhook body and redirect URL use "invoice_slug" for the same value.
    expect(body).toMatchObject({
      handle: 'test-handle',
      slug: 'inv-abc',
      transaction_nsu: 'tx-123',
      order_nsu: PAYMENT_UUID,
    })
    expect(body.invoice_slug).toBeUndefined()
  })

  it('callsPaymentCheckEvenWithoutSlugInBody', async () => {
    seedPayment()
    mockPaymentCheckStatus('pending')

    await post(JSON.stringify({ order_nsu: PAYMENT_UUID }))

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string)
    expect(body).toMatchObject({ handle: 'test-handle', order_nsu: PAYMENT_UUID })
    expect(body.slug).toBeUndefined()
  })

  it('marksPaymentCompletedAndActivatesPoolWhenPaymentCheckReturnsPaid', async () => {
    seedPayment()
    mockPaymentCheckStatus('paid')

    const res = await post(JSON.stringify({ order_nsu: PAYMENT_UUID }))

    expect(res.status).toBe(200)
    expect(mockHandleCheckoutCompleted).toHaveBeenCalledWith(PAYMENT_UUID)
  })

  it('marksPaymentExpiredWhenPaymentCheckReturnsRejected', async () => {
    seedPayment()
    mockPaymentCheckStatus('rejected')

    const res = await post(JSON.stringify({ order_nsu: PAYMENT_UUID }))

    expect(res.status).toBe(200)
    expect(mockHandleCheckoutCompleted).not.toHaveBeenCalled()
    expect(mockDbUpdate).toHaveBeenCalled()
    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'expired' }))
  })

  it('leavesPaymentUnchangedWhenPaymentCheckReturnsPending', async () => {
    seedPayment()
    mockPaymentCheckStatus('pending')

    const res = await post(JSON.stringify({ order_nsu: PAYMENT_UUID }))

    expect(res.status).toBe(200)
    expect(mockHandleCheckoutCompleted).not.toHaveBeenCalled()
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('returns500WhenPaymentCheckFailsSoInfinitePayRetries', async () => {
    seedPayment()
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) })

    const res = await post(JSON.stringify({ order_nsu: PAYMENT_UUID }))

    expect(res.status).toBe(500)
    expect(mockHandleCheckoutCompleted).not.toHaveBeenCalled()
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('returns500WhenPaymentCheckThrowsNetworkError', async () => {
    seedPayment()
    fetchSpy.mockRejectedValueOnce(new Error('ECONNRESET'))

    const res = await post(JSON.stringify({ order_nsu: PAYMENT_UUID }))

    expect(res.status).toBe(500)
    expect(mockHandleCheckoutCompleted).not.toHaveBeenCalled()
  })

  it('isIdempotentForDuplicateWebhookOnAlreadyCompletedPayment', async () => {
    seedPayment({ status: 'completed' })
    mockPaymentCheckStatus('paid')

    const res = await post(JSON.stringify({ order_nsu: PAYMENT_UUID }))

    expect(res.status).toBe(200)
    // handleCheckoutCompleted is still called but is itself idempotent (verified in services/payment.ts)
    expect(mockHandleCheckoutCompleted).toHaveBeenCalledWith(PAYMENT_UUID)
  })

  it('treatsUnknownStatusAsTransientNoop', async () => {
    seedPayment()
    mockPaymentCheckStatus('martian')

    const res = await post(JSON.stringify({ order_nsu: PAYMENT_UUID }))

    expect(res.status).toBe(200)
    expect(mockHandleCheckoutCompleted).not.toHaveBeenCalled()
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('extractsIdentifierFromNestedPaymentField', async () => {
    seedPayment()
    mockPaymentCheckStatus('pending')

    await post(JSON.stringify({ payment: { order_nsu: PAYMENT_UUID } }))

    expect(fetchSpy).toHaveBeenCalled()
  })

  it('extractsIdentifierFromNestedDataField', async () => {
    seedPayment()
    mockPaymentCheckStatus('pending')

    await post(JSON.stringify({ data: { order_nsu: PAYMENT_UUID } }))

    expect(fetchSpy).toHaveBeenCalled()
  })
})
