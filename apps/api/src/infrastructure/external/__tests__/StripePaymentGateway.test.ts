import type Stripe from 'stripe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { db as DbClient } from '../../../db/client'
import { StripePaymentGateway } from '../StripePaymentGateway'

const mockSessionCreate = vi.fn()

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

describe('StripePaymentGateway', () => {
  let gateway: StripePaymentGateway
  let mockDb: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    mockDb = createMockDb()
    const mockStripe = {
      checkout: {
        sessions: {
          create: mockSessionCreate,
        },
      },
    }
    gateway = new StripePaymentGateway(
      mockStripe as unknown as Stripe,
      mockDb as unknown as typeof DbClient,
    )

    process.env.ALLOWED_ORIGIN = 'http://localhost:5173'
  })

  it('createCheckoutSession_createsSessionWithCorrectParams', async () => {
    mockSessionCreate.mockResolvedValueOnce({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
    })

    const result = await gateway.createCheckoutSession({
      userId: 'user-1',
      poolId: 'pool-1',
      amount: 2000,
      platformFee: 100,
    })

    expect(mockSessionCreate).toHaveBeenCalledWith({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: { name: 'Entrada no Bolão' },
            unit_amount: 2000,
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: 'user-1',
        poolId: 'pool-1',
        type: 'entry',
        paymentId: 'payment-uuid-123',
      },
      success_url: 'http://localhost:5173/pools/payment-success',
      cancel_url: 'http://localhost:5173/',
    })

    expect(result.checkoutUrl).toBe('https://checkout.stripe.com/c/pay/cs_test_123')
    expect(result.payment.id).toBe('payment-uuid-123')
  })

  it('createCheckoutSession_passesAmountInCentavos', async () => {
    mockSessionCreate.mockResolvedValueOnce({ id: 'cs_1', url: 'https://stripe.com/c' })

    await gateway.createCheckoutSession({
      userId: 'user-1',
      poolId: 'pool-1',
      amount: 5050,
      platformFee: 252,
    })

    const createCall = mockSessionCreate.mock.calls[0]?.[0] as
      | { line_items: { price_data: { unit_amount: number } }[] }
      | undefined
    expect(createCall?.line_items[0]?.price_data.unit_amount).toBe(5050)
  })

  it('isConfigured_returnsTrue', () => {
    expect(gateway.isConfigured()).toBe(true)
  })
})
