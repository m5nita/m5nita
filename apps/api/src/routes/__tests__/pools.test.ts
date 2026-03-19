import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../db/client', () => ({
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

import { poolsRoutes } from '../pools'

vi.mock('../../middleware/auth', () => ({
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

const mockCreatePool = vi.fn()
const mockGetUserPools = vi.fn()
const mockGetPoolById = vi.fn()
const mockCreateEntryPayment = vi.fn()

vi.mock('../../services/pool', () => ({
  createPool: (...args: unknown[]) => mockCreatePool(...args),
  getUserPools: (...args: unknown[]) => mockGetUserPools(...args),
  getPoolById: (...args: unknown[]) => mockGetPoolById(...args),
  getPoolByInviteCode: vi.fn(),
  isPoolMember: vi.fn(() => false),
  PoolError: class extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
      this.name = 'PoolError'
    }
  },
}))

vi.mock('../../services/payment', () => ({
  createEntryPayment: (...args: unknown[]) => mockCreateEntryPayment(...args),
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
    mockCreatePool.mockResolvedValue({
      pool: { id: 'pool-1', name: 'Test Pool', inviteCode: 'ABC123', entryFee: 5000 },
      platformFee: 250,
    })
    mockCreateEntryPayment.mockResolvedValue({
      payment: { id: 'pay-1' },
      checkoutUrl: 'https://checkout.stripe.com/test',
    })

    const res = await app.request('/api/pools', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': JSON.stringify(testUser),
      },
      body: JSON.stringify({ name: 'Test Pool', entryFee: 5000 }),
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.pool.name).toBe('Test Pool')
    expect(body.payment.checkoutUrl).toBe('https://checkout.stripe.com/test')
    expect(mockCreatePool).toHaveBeenCalledWith('user-1', 'Test Pool', 5000)
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

  it('returns_authenticated_userPools', async () => {
    mockGetUserPools.mockResolvedValue([
      { id: 'pool-1', name: 'Pool A', entryFee: 5000, memberCount: 5, status: 'active' },
    ])

    const res = await app.request('/api/pools', {
      headers: { 'x-test-user': JSON.stringify(testUser) },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pools).toHaveLength(1)
    expect(body.pools[0].name).toBe('Pool A')
  })
})
