import type { MercadoPagoConfig } from 'mercadopago'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { db as DbClient } from '../../db/client'
import { MercadoPagoPaymentGateway } from './MercadoPagoPaymentGateway'

const mockPreferenceCreate = vi.fn()

vi.mock('mercadopago', () => ({
  Preference: class {
    create(...args: unknown[]) {
      return mockPreferenceCreate(...args)
    }
  },
}))

function createMockDb() {
  const mockPaymentRecord = {
    id: 'payment-uuid-123',
    userId: 'user-1',
    poolId: 'pool-1',
    amount: 2000,
    platformFee: 100,
    externalPaymentId: null,
    status: 'pending',
    type: 'entry',
  }

  return {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockPaymentRecord]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  }
}

describe('MercadoPagoPaymentGateway', () => {
  let gateway: MercadoPagoPaymentGateway
  let mockDb: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    mockDb = createMockDb()
    const mockClient = { accessToken: 'TEST-token' }
    gateway = new MercadoPagoPaymentGateway(
      mockClient as unknown as MercadoPagoConfig,
      mockDb as unknown as typeof DbClient,
    )

    process.env.ALLOWED_ORIGIN = 'http://localhost:5173'
    process.env.BETTER_AUTH_URL = 'http://localhost:3001'
  })

  it('createCheckoutSession_createsPreferenceWithCorrectParams', async () => {
    mockPreferenceCreate.mockResolvedValueOnce({
      id: 'pref-123',
      init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-123',
    })

    const result = await gateway.createCheckoutSession({
      userId: 'user-1',
      poolId: 'pool-1',
      amount: 2000,
      platformFee: 100,
    })

    expect(mockPreferenceCreate).toHaveBeenCalledWith({
      body: expect.objectContaining({
        items: [
          expect.objectContaining({
            title: 'Entrada no Bolão',
            quantity: 1,
            unit_price: 20,
            currency_id: 'BRL',
          }),
        ],
        back_urls: {
          success: 'http://localhost:5173/pools/payment-success',
          failure: 'http://localhost:5173/',
          pending: 'http://localhost:5173/pools/payment-success',
        },
        external_reference: 'payment-uuid-123',
        metadata: { userId: 'user-1', poolId: 'pool-1', type: 'entry' },
        notification_url: 'http://localhost:3001/api/webhooks/mercadopago',
      }),
    })

    expect(result.checkoutUrl).toBe(
      'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-123',
    )
    expect(result.payment.id).toBe('payment-uuid-123')
  })

  it('createCheckoutSession_convertsAmountFromCentavosToReais', async () => {
    mockPreferenceCreate.mockResolvedValueOnce({
      id: 'pref-456',
      init_point: 'https://mp.com/checkout',
    })

    await gateway.createCheckoutSession({
      userId: 'user-1',
      poolId: 'pool-1',
      amount: 5050,
      platformFee: 252,
    })

    const createCall = mockPreferenceCreate.mock.calls[0]?.[0] as
      | { body: { items: { unit_price: number }[] } }
      | undefined
    expect(createCall?.body.items[0]?.unit_price).toBe(50.5)
  })

  it('isConfigured_returnsTrue', () => {
    expect(gateway.isConfigured()).toBe(true)
  })
})
