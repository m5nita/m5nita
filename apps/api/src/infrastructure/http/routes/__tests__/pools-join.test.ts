import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../db/client', () => ({
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

const mockJoinPoolExecute = vi.fn()

vi.mock('../../../../container', () => ({
  getContainer: () => ({
    createPoolUseCase: { execute: vi.fn() },
    getUserPoolsUseCase: { execute: vi.fn() },
    joinPoolUseCase: { execute: (...args: unknown[]) => mockJoinPoolExecute(...args) },
    cancelPoolUseCase: { execute: vi.fn() },
    getPrizeInfoUseCase: { execute: vi.fn() },
    requestWithdrawalUseCase: { execute: vi.fn() },
    getPoolDetailsUseCase: { execute: vi.fn() },
    upsertPredictionUseCase: { execute: vi.fn() },
    getUserPredictionsUseCase: { execute: vi.fn() },
    getMatchPredictionsUseCase: { execute: vi.fn() },
  }),
}))

import { PoolError } from '../../../../domain/pool/PoolError'
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

vi.mock('../../../../services/pool', () => ({
  getPoolById: (...args: unknown[]) => mockGetPoolById(...args),
  getPoolByInviteCode: (...args: unknown[]) => mockGetPoolByInviteCode(...args),
  isPoolMember: (...args: unknown[]) => mockIsPoolMember(...args),
}))

vi.mock('../../../../services/payment', () => ({
  handleCheckoutCompleted: vi.fn(),
  handleCheckoutExpired: vi.fn(),
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
    mockJoinPoolExecute.mockResolvedValue({
      payment: {
        payment: { id: 'pay-1' },
        checkoutUrl: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=join',
      },
      amount: 5000,
    })

    const res = await app.request('/api/pools/pool-1/join', {
      method: 'POST',
      headers,
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.payment.checkoutUrl).toBe(
      'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=join',
    )
  })

  it('rejects_closedPool_409', async () => {
    mockJoinPoolExecute.mockRejectedValue(
      new PoolError('POOL_CLOSED', 'Este bolão não aceita novas entradas'),
    )

    const res = await app.request('/api/pools/pool-1/join', {
      method: 'POST',
      headers,
    })

    expect(res.status).toBe(409)
  })

  it('rejects_alreadyMember_409', async () => {
    mockJoinPoolExecute.mockRejectedValue(
      new PoolError('ALREADY_MEMBER', 'Você já participa deste bolão'),
    )

    const res = await app.request('/api/pools/pool-1/join', {
      method: 'POST',
      headers,
    })

    expect(res.status).toBe(409)
  })
})
