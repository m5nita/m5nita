import { updatePoolSchema } from '@m5nita/shared'
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
        scope: { kind: 'whole-competition', range: null, matchId: null },
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
      matchId: undefined,
      couponCode: undefined,
    })
  })

  it('creates_singleMatchScope_passesMatchIdThrough', async () => {
    const matchId = '22222222-2222-4222-8222-222222222222'
    mockCreatePoolExecute.mockResolvedValue({
      pool: {
        id: 'pool-2',
        name: 'Final',
        entryFee: { value: { centavos: 5000 } },
        ownerId: 'user-1',
        inviteCode: { value: 'XYZ987' },
        competitionId: '00000000-0000-0000-0000-000000000001',
        scope: { kind: 'single-match', range: null, matchId },
        status: { value: 'pending' },
        isOpen: true,
        couponId: null,
      },
      payment: {
        payment: { id: 'pay-2' },
        checkoutUrl: 'https://checkout.example/2',
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
        name: 'Final',
        entryFee: 5000,
        competitionId: '00000000-0000-0000-0000-000000000001',
        matchId,
      }),
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.pool.matchId).toBe(matchId)
    expect(mockCreatePoolExecute).toHaveBeenCalledWith(
      expect.objectContaining({ matchId, matchdayFrom: undefined, matchdayTo: undefined }),
    )
  })

  it('rejects_bothMatchIdAndMatchdayRange_400invalidScope', async () => {
    const res = await app.request('/api/pools', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': JSON.stringify(testUser),
      },
      body: JSON.stringify({
        name: 'Mixed',
        entryFee: 5000,
        competitionId: '00000000-0000-0000-0000-000000000001',
        matchId: '22222222-2222-4222-8222-222222222222',
        matchdayFrom: 30,
        matchdayTo: 30,
      }),
    })

    expect(res.status).toBe(400)
    expect(mockCreatePoolExecute).not.toHaveBeenCalled()
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

  it('defaults to active pools when no status is given', async () => {
    mockGetUserPoolsExecute.mockResolvedValue([])
    await app.request('/api/pools', { headers: { 'x-test-user': JSON.stringify(testUser) } })
    expect(mockGetUserPoolsExecute).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
    )
  })

  it('passes status=closed through to the use case', async () => {
    mockGetUserPoolsExecute.mockResolvedValue([])
    await app.request('/api/pools?status=closed', {
      headers: { 'x-test-user': JSON.stringify(testUser) },
    })
    expect(mockGetUserPoolsExecute).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'closed' }),
    )
  })

  it('ignores an invalid status and falls back to active', async () => {
    mockGetUserPoolsExecute.mockResolvedValue([])
    await app.request('/api/pools?status=bogus', {
      headers: { 'x-test-user': JSON.stringify(testUser) },
    })
    expect(mockGetUserPoolsExecute).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
    )
  })
})

describe('updatePoolSchema — FR-014 scope immutability via PATCH /api/pools/:poolId', () => {
  it('strips any scope-related fields a caller tries to smuggle in', () => {
    const parsed = updatePoolSchema.safeParse({
      name: 'Renamed',
      isOpen: false,
      matchId: '22222222-2222-4222-8222-222222222222',
      matchdayFrom: 30,
      matchdayTo: 30,
      competitionId: '99999999-9999-4999-8999-999999999999',
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(Object.keys(parsed.data).sort()).toEqual(['isOpen', 'name'])
  })
})
