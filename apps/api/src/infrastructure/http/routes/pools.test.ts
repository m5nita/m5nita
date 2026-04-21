import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../db/client', () => ({
  db: {
    query: {
      pool: { findFirst: vi.fn() },
      poolMember: { findFirst: vi.fn() },
      payment: { findMany: vi.fn(() => []) },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => []),
        })),
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => []),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => []),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => []),
        })),
      })),
    })),
  },
}))

import { poolsRoutes } from './pools'

vi.mock('../middleware/auth', () => ({
  requireAuth: vi.fn((c, next) => {
    const testUser = c.req.header('x-test-user')
    if (testUser) {
      c.set('user', JSON.parse(testUser))
      c.set('session', { id: 'test-session' })
      return next()
    }
    return c.json({ error: 'UNAUTHORIZED' }, 401)
  }),
}))

const mockCreatePoolExecute = vi.fn()
const mockGetUserPoolsExecute = vi.fn()
const mockJoinPoolExecute = vi.fn()
const mockGetPrizeInfoExecute = vi.fn()
const mockRequestWithdrawalExecute = vi.fn()

vi.mock('../../../container', () => ({
  getContainer: () => ({
    createPoolUseCase: { execute: (...args: unknown[]) => mockCreatePoolExecute(...args) },
    getUserPoolsUseCase: { execute: (...args: unknown[]) => mockGetUserPoolsExecute(...args) },
    joinPoolUseCase: { execute: (...args: unknown[]) => mockJoinPoolExecute(...args) },
    getPrizeInfoUseCase: { execute: (...args: unknown[]) => mockGetPrizeInfoExecute(...args) },
    requestWithdrawalUseCase: {
      execute: (...args: unknown[]) => mockRequestWithdrawalExecute(...args),
    },
    getPoolDetailsUseCase: { execute: vi.fn() },
  }),
}))

const mockGetPoolById = vi.fn()

vi.mock('../../../services/pool', () => ({
  getPoolById: (...args: unknown[]) => mockGetPoolById(...args),
  getPoolByInviteCode: vi.fn(),
  isPoolMember: vi.fn(() => false),
}))

vi.mock('../../../services/payment', () => ({
  handleCheckoutCompleted: vi.fn(),
  handleCheckoutExpired: vi.fn(),
}))

vi.mock('../../../services/coupon', () => ({
  validateCoupon: vi.fn(() => ({ valid: false, reason: 'not_found' })),
  getEffectiveFeeRate: vi.fn((d: number) => 0.05 * (1 - d / 100)),
}))

const testUser = { id: 'user-1', name: 'Test', phoneNumber: '+5511999999999' }

function createTestApp() {
  const app = new Hono()
  app.route('/api', poolsRoutes)
  return app
}

describe('POST /api/pools', () => {
  let app: Hono

  beforeEach(() => {
    app = createTestApp()
    vi.clearAllMocks()
  })

  it('creates_validData_201withPaymentIntent', async () => {
    mockCreatePoolExecute.mockResolvedValue({
      pool: {
        id: 'pool-1',
        name: 'Test Pool',
        entryFee: { value: { centavos: 5000 } },
        ownerId: 'user-1',
        inviteCode: { value: 'ABC123' },
        competitionId: '00000000-0000-0000-0000-000000000001',
        matchdayRange: null,
        status: { value: 'pending' },
        isOpen: true,
        couponId: null,
      },
      payment: {
        payment: { id: 'pay-1' },
        checkoutUrl: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=test',
      },
      platformFee: 250,
      originalPlatformFee: 250,
      discountPercent: 0,
      couponCode: null,
    })

    const res = await app.request('/api/pools', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': JSON.stringify(testUser),
      },
      body: JSON.stringify({
        name: 'Test Pool',
        entryFee: 5000,
        competitionId: '00000000-0000-0000-0000-000000000001',
      }),
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.pool.name).toBe('Test Pool')
    expect(body.payment.checkoutUrl).toBe(
      'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=test',
    )
    expect(mockCreatePoolExecute).toHaveBeenCalledWith({
      userId: 'user-1',
      name: 'Test Pool',
      entryFee: 5000,
      competitionId: '00000000-0000-0000-0000-000000000001',
      matchdayFrom: undefined,
      matchdayTo: undefined,
      couponCode: undefined,
    })
  })

  it('rejects_shortName_400validation', async () => {
    const res = await app.request('/api/pools', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': JSON.stringify(testUser),
      },
      body: JSON.stringify({ name: 'AB', entryFee: 5000 }),
    })

    expect(res.status).toBe(400)
  })

  it('rejects_lowEntryFee_400validation', async () => {
    const res = await app.request('/api/pools', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': JSON.stringify(testUser),
      },
      body: JSON.stringify({ name: 'Test Pool', entryFee: 50 }),
    })

    expect(res.status).toBe(400)
  })

  it('rejects_noAuth_401', async () => {
    const res = await app.request('/api/pools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', entryFee: 5000 }),
    })

    expect(res.status).toBe(401)
  })
})

describe('GET /api/pools', () => {
  let app: Hono

  beforeEach(() => {
    app = createTestApp()
    vi.clearAllMocks()
  })

  it('returns_authenticated_userPools_withMatchTimestamps', async () => {
    const nextDate = new Date('2026-05-01T12:00:00.000Z')
    const lastDate = new Date('2026-05-10T20:00:00.000Z')
    mockGetUserPoolsExecute.mockResolvedValue([
      {
        id: 'pool-1',
        name: 'Pool A',
        entryFee: 5000,
        status: 'active',
        competitionName: 'Copa',
        memberCount: 5,
        userPosition: null,
        userPoints: 0,
        nextMatchAt: nextDate,
        lastMatchAt: lastDate,
      },
    ])

    const res = await app.request('/api/pools', {
      headers: { 'x-test-user': JSON.stringify(testUser) },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pools).toHaveLength(1)
    expect(body.pools[0].name).toBe('Pool A')
    expect(body.pools[0].nextMatchAt).toBe(nextDate.toISOString())
    expect(body.pools[0].lastMatchAt).toBe(lastDate.toISOString())
  })
})
