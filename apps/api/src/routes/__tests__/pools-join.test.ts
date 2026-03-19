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

const mockGetPoolByInviteCode = vi.fn()
const mockIsPoolMember = vi.fn()
const mockGetPoolById = vi.fn()
const mockCreateEntryPayment = vi.fn()

vi.mock('../../services/pool', () => ({
  createPool: vi.fn(),
  getUserPools: vi.fn(() => []),
  getPoolById: (...args: unknown[]) => mockGetPoolById(...args),
  getPoolByInviteCode: (...args: unknown[]) => mockGetPoolByInviteCode(...args),
  isPoolMember: (...args: unknown[]) => mockIsPoolMember(...args),
  PoolError: class extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  },
}))

vi.mock('../../services/payment', () => ({
  createEntryPayment: (...args: unknown[]) => mockCreateEntryPayment(...args),
}))

const testUser = { id: 'user-1', name: 'Test', phoneNumber: '+5511999999999' }
const headers = { 'x-test-user': JSON.stringify(testUser) }

function createTestApp() {
  const app = new Hono()
  app.route('/api', poolsRoutes)
  return app
}

describe('GET /api/pools/invite/:inviteCode', () => {
  let app: Hono

  beforeEach(() => {
    app = createTestApp()
    vi.clearAllMocks()
  })

  it('returns_validCode_poolInfo', async () => {
    mockGetPoolByInviteCode.mockResolvedValue({
      id: 'pool-1',
      name: 'Test Pool',
      entryFee: 5000,
      platformFee: 250,
      owner: { name: 'Owner' },
      memberCount: 3,
      prizeTotal: 14250,
      isOpen: true,
    })
    mockIsPoolMember.mockResolvedValue(false)

    const res = await app.request('/api/pools/invite/ABC123', { headers })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('Test Pool')
    expect(body.prizeTotal).toBe(14250)
  })

  it('returns_invalidCode_404', async () => {
    mockGetPoolByInviteCode.mockResolvedValue(null)

    const res = await app.request('/api/pools/invite/INVALID', { headers })
    expect(res.status).toBe(404)
  })

  it('returns_closedPool_409', async () => {
    mockGetPoolByInviteCode.mockResolvedValue({
      id: 'pool-1',
      name: 'Closed Pool',
      isOpen: false,
    })

    const res = await app.request('/api/pools/invite/CLOSED1', { headers })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('POOL_CLOSED')
  })

  it('returns_alreadyMember_409', async () => {
    mockGetPoolByInviteCode.mockResolvedValue({
      id: 'pool-1',
      name: 'Test Pool',
      isOpen: true,
    })
    mockIsPoolMember.mockResolvedValue(true)

    const res = await app.request('/api/pools/invite/ABC123', { headers })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('ALREADY_MEMBER')
  })
})

describe('POST /api/pools/:poolId/join', () => {
  let app: Hono

  beforeEach(() => {
    app = createTestApp()
    vi.clearAllMocks()
  })

  it('joins_validPool_201withPayment', async () => {
    mockGetPoolById.mockResolvedValue({
      id: 'pool-1',
      entryFee: 5000,
      isOpen: true,
    })
    mockIsPoolMember.mockResolvedValue(false)
    mockCreateEntryPayment.mockResolvedValue({
      payment: { id: 'pay-1' },
      checkoutUrl: 'https://checkout.stripe.com/join',
    })

    const res = await app.request('/api/pools/pool-1/join', {
      method: 'POST',
      headers,
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.payment.checkoutUrl).toBe('https://checkout.stripe.com/join')
  })

  it('rejects_closedPool_409', async () => {
    mockGetPoolById.mockResolvedValue({
      id: 'pool-1',
      entryFee: 5000,
      isOpen: false,
    })

    const res = await app.request('/api/pools/pool-1/join', {
      method: 'POST',
      headers,
    })

    expect(res.status).toBe(409)
  })

  it('rejects_alreadyMember_409', async () => {
    mockGetPoolById.mockResolvedValue({
      id: 'pool-1',
      entryFee: 5000,
      isOpen: true,
    })
    mockIsPoolMember.mockResolvedValue(true)

    const res = await app.request('/api/pools/pool-1/join', {
      method: 'POST',
      headers,
    })

    expect(res.status).toBe(409)
  })
})
