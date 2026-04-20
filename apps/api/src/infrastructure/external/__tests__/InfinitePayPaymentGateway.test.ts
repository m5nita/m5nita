import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { db as DbClient } from '../../../db/client'
import { InfinitePayPaymentGateway } from '../InfinitePayPaymentGateway'

const HANDLE = 'test-handle'
const PAYMENT_ID = '00000000-0000-4000-8000-000000000001'

type MockUser = {
  name: string | null
  email: string | null
  phoneNumber: string | null
} | null

function createMockDb(opts: { user?: MockUser } = {}) {
  const paymentRecord = {
    id: PAYMENT_ID,
    userId: 'user-1',
    poolId: 'pool-1',
    amount: 2000,
    platformFee: 100,
    externalPaymentId: null,
    status: 'pending',
    type: 'entry',
  }

  const insertWhere = vi.fn().mockResolvedValue(undefined)
  const insertSet = vi.fn().mockReturnValue({ where: insertWhere })
  const update = vi.fn().mockReturnValue({ set: insertSet })

  const deleteWhere = vi.fn().mockResolvedValue(undefined)
  const del = vi.fn().mockReturnValue({ where: deleteWhere })

  const insert = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([paymentRecord]),
    }),
  })

  return {
    paymentRecord,
    deleteWhere,
    insertSet,
    db: {
      insert,
      update,
      delete: del,
      query: {
        user: {
          findFirst: vi.fn().mockResolvedValue(opts.user ?? null),
        },
      },
    },
  }
}

describe('InfinitePayPaymentGateway', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ALLOWED_ORIGIN = 'http://localhost:5173'
    process.env.BETTER_AUTH_URL = 'http://localhost:3001'
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function buildGateway(
    mock: ReturnType<typeof createMockDb>,
    options: { maxAttempts?: number } = {},
  ) {
    return new InfinitePayPaymentGateway(HANDLE, mock.db as unknown as typeof DbClient, {
      maxAttempts: options.maxAttempts ?? 3,
      initialDelayMs: 0,
      sleep: async () => {},
    })
  }

  function mockSuccessResponse(url = 'https://checkout.infinitepay.io/test?lenc=abc.v1.xyz') {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ url }),
    })
  }

  it('createCheckoutSession_buildsRequestPayloadCorrectly', async () => {
    const mock = createMockDb({
      user: { name: 'Maria', email: 'maria@example.com', phoneNumber: '+5511999999999' },
    })
    mockSuccessResponse()

    await buildGateway(mock).createCheckoutSession({
      userId: 'user-1',
      poolId: 'pool-1',
      amount: 2000,
      platformFee: 100,
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] ?? []
    expect(url).toBe('https://api.infinitepay.io/invoices/public/checkout/links')
    expect(init?.method).toBe('POST')
    const body = JSON.parse(init?.body as string)
    expect(body).toMatchObject({
      handle: HANDLE,
      redirect_url: `http://localhost:5173/pools/payment-success?payment_id=${PAYMENT_ID}`,
      webhook_url: 'http://localhost:3001/api/webhooks/infinitepay',
      order_nsu: PAYMENT_ID,
      customer: { name: 'Maria', email: 'maria@example.com', phone_number: '+5511999999999' },
      items: [{ description: 'Entrada no Bolão', quantity: 1, price: 2000 }],
    })
  })

  it('createCheckoutSession_persistsPaymentIdAsExternalPaymentId', async () => {
    const mock = createMockDb()
    mockSuccessResponse()

    await buildGateway(mock).createCheckoutSession({
      userId: 'user-1',
      poolId: 'pool-1',
      amount: 2000,
      platformFee: 100,
    })

    expect(mock.insertSet).toHaveBeenCalledWith({ externalPaymentId: PAYMENT_ID })
  })

  it('createCheckoutSession_returnsCheckoutUrlAndPaymentId', async () => {
    const mock = createMockDb()
    mockSuccessResponse('https://infinitepay.io/c/xyz')

    const result = await buildGateway(mock).createCheckoutSession({
      userId: 'user-1',
      poolId: 'pool-1',
      amount: 2000,
      platformFee: 100,
    })

    expect(result).toEqual({
      payment: { id: PAYMENT_ID },
      checkoutUrl: 'https://infinitepay.io/c/xyz',
    })
  })

  it('createCheckoutSession_omitsCustomerFieldsWhenMissing', async () => {
    const mock = createMockDb({ user: null })
    mockSuccessResponse()

    await buildGateway(mock).createCheckoutSession({
      userId: 'user-1',
      poolId: 'pool-1',
      amount: 2000,
      platformFee: 100,
    })

    const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string)
    expect(body.customer).toBeUndefined()
  })

  it('createCheckoutSession_omitsPhoneOnlyWhenPhoneMissing', async () => {
    const mock = createMockDb({
      user: { name: 'Maria', email: 'maria@example.com', phoneNumber: null },
    })
    mockSuccessResponse()

    await buildGateway(mock).createCheckoutSession({
      userId: 'user-1',
      poolId: 'pool-1',
      amount: 2000,
      platformFee: 100,
    })

    const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string)
    expect(body.customer).toEqual({ name: 'Maria', email: 'maria@example.com' })
    expect(body.customer.phone_number).toBeUndefined()
  })

  it('createCheckoutSession_throwsAndDeletesLocalRowAfterMaxRetriesOnRetryableStatus', async () => {
    const mock = createMockDb()
    const serverErrorResponse = {
      ok: false,
      status: 502,
      json: async () => ({}),
      text: async () => '502 server error',
    }
    fetchSpy.mockResolvedValue(serverErrorResponse)

    await expect(
      buildGateway(mock).createCheckoutSession({
        userId: 'user-1',
        poolId: 'pool-1',
        amount: 2000,
        platformFee: 100,
      }),
    ).rejects.toThrow('InfinitePay checkout creation failed')

    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(mock.db.delete).toHaveBeenCalled()
    expect(mock.deleteWhere).toHaveBeenCalled()
  })

  it('createCheckoutSession_throwsAndDeletesLocalRowAfterMaxRetriesOnNetworkError', async () => {
    const mock = createMockDb()
    fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'))

    await expect(
      buildGateway(mock).createCheckoutSession({
        userId: 'user-1',
        poolId: 'pool-1',
        amount: 2000,
        platformFee: 100,
      }),
    ).rejects.toThrow('InfinitePay checkout creation failed')

    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(mock.db.delete).toHaveBeenCalled()
  })

  it('createCheckoutSession_retriesOn502AndSucceedsOnSecondAttempt', async () => {
    const mock = createMockDb()
    fetchSpy
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({}),
        text: async () => '502',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ url: 'https://checkout.example/ok' }),
      })

    const result = await buildGateway(mock).createCheckoutSession({
      userId: 'user-1',
      poolId: 'pool-1',
      amount: 2000,
      platformFee: 100,
    })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(result.checkoutUrl).toBe('https://checkout.example/ok')
    expect(mock.db.delete).not.toHaveBeenCalled()
  })

  it('createCheckoutSession_retriesOnNetworkErrorAndSucceedsOnSecondAttempt', async () => {
    const mock = createMockDb()
    fetchSpy.mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ url: 'https://checkout.example/ok' }),
    })

    const result = await buildGateway(mock).createCheckoutSession({
      userId: 'user-1',
      poolId: 'pool-1',
      amount: 2000,
      platformFee: 100,
    })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(result.checkoutUrl).toBe('https://checkout.example/ok')
    expect(mock.db.delete).not.toHaveBeenCalled()
  })

  it('createCheckoutSession_doesNotRetryOnNonRetryableClientError', async () => {
    const mock = createMockDb()
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({}),
      text: async () => 'bad request',
    })

    await expect(
      buildGateway(mock).createCheckoutSession({
        userId: 'user-1',
        poolId: 'pool-1',
        amount: 2000,
        platformFee: 100,
      }),
    ).rejects.toThrow('InfinitePay checkout creation failed')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(mock.db.delete).toHaveBeenCalled()
  })

  it('createCheckoutSession_rejectsResponseFailingZodSchema', async () => {
    const mock = createMockDb()
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ wrong_field: 'value' }),
    })

    await expect(
      buildGateway(mock).createCheckoutSession({
        userId: 'user-1',
        poolId: 'pool-1',
        amount: 2000,
        platformFee: 100,
      }),
    ).rejects.toThrow('InfinitePay checkout creation failed')

    expect(mock.db.delete).toHaveBeenCalled()
  })

  it('isConfigured_returnsTrue', () => {
    const mock = createMockDb()
    expect(buildGateway(mock).isConfigured()).toBe(true)
  })
})
