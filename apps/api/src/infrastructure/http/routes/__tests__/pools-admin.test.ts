import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../middleware/auth', () => ({
  requireAuth: vi.fn((c, next) => {
    const testUser = c.req.header('x-test-user')
    if (testUser) {
      c.set('user', JSON.parse(testUser))
      return next()
    }
    return c.json({ error: 'UNAUTHORIZED' }, 401)
  }),
}))

vi.mock('../../../../services/pool', () => ({
  getPoolById: vi.fn(),
  getPoolByInviteCode: vi.fn(),
  isPoolMember: vi.fn(() => false),
}))

vi.mock('../../../../services/payment', () => ({
  handleCheckoutCompleted: vi.fn(),
  handleCheckoutExpired: vi.fn(),
}))

const mockPool = {
  id: 'pool-1',
  name: 'Test',
  entryFee: 5000,
  ownerId: 'owner-1',
  isOpen: true,
  status: 'active',
}

vi.mock('../../../../db/client', () => ({
  db: {
    query: {
      pool: { findFirst: vi.fn(() => mockPool) },
      poolMember: {
        findFirst: vi.fn(() => ({ id: 'member-1', paymentId: 'pay-1', userId: 'user-2' })),
      },
      payment: {
        findMany: vi.fn(() => [
          { id: 'pay-1', userId: 'user-2', amount: 5000, type: 'entry', status: 'completed' },
        ]),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => [
            { id: 'member-1', userId: 'user-2', name: 'Bob', joinedAt: new Date() },
          ]),
        })),
        where: vi.fn(() => ({
          limit: vi.fn(() => []),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => [{ ...mockPool, name: 'Updated' }]),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(),
    })),
  },
}))

const mockCancelPoolExecute = vi.fn()

vi.mock('../../../../container', () => ({
  getContainer: () => ({
    createPoolUseCase: { execute: vi.fn() },
    getUserPoolsUseCase: { execute: vi.fn() },
    joinPoolUseCase: { execute: vi.fn() },
    cancelPoolUseCase: { execute: (...args: unknown[]) => mockCancelPoolExecute(...args) },
    getPrizeInfoUseCase: { execute: vi.fn() },
    requestWithdrawalUseCase: { execute: vi.fn() },
    getPoolDetailsUseCase: { execute: vi.fn() },
    upsertPredictionUseCase: { execute: vi.fn() },
    getUserPredictionsUseCase: { execute: vi.fn() },
    getMatchPredictionsUseCase: { execute: vi.fn() },
  }),
}))

import { poolsRoutes } from '../pools'

const owner = { id: 'owner-1', name: 'Owner', phoneNumber: '+5511000000000' }
const nonOwner = { id: 'user-2', name: 'Other', phoneNumber: '+5511111111111' }

function createTestApp() {
  const app = new Hono()
  app.route('/api', poolsRoutes)
  return app
}

describe('Admin endpoints', () => {
  let app: Hono

  beforeEach(() => {
    app = createTestApp()
    vi.clearAllMocks()
    mockCancelPoolExecute.mockResolvedValue(undefined)
  })

  it('patchPool_owner_200updated', async () => {
    const res = await app.request('/api/pools/pool-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(owner) },
      body: JSON.stringify({ name: 'Updated Pool' }),
    })
    expect(res.status).toBe(200)
  })

  it('patchPool_nonOwner_403forbidden', async () => {
    const res = await app.request('/api/pools/pool-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(nonOwner) },
      body: JSON.stringify({ name: 'Hack' }),
    })
    expect(res.status).toBe(403)
  })

  it('getMembers_owner_200list', async () => {
    const res = await app.request('/api/pools/pool-1/members', {
      headers: { 'x-test-user': JSON.stringify(owner) },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.members).toBeDefined()
  })

  it('getMembers_nonOwner_403', async () => {
    const res = await app.request('/api/pools/pool-1/members', {
      headers: { 'x-test-user': JSON.stringify(nonOwner) },
    })
    expect(res.status).toBe(403)
  })

  it('removeMember_owner_200removed', async () => {
    const res = await app.request('/api/pools/pool-1/members/member-1', {
      method: 'DELETE',
      headers: { 'x-test-user': JSON.stringify(owner) },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.removed).toBe(true)
  })

  it('cancelPool_owner_200cancelled', async () => {
    const res = await app.request('/api/pools/pool-1/cancel', {
      method: 'POST',
      headers: { 'x-test-user': JSON.stringify(owner) },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cancelled).toBe(true)
  })
})
