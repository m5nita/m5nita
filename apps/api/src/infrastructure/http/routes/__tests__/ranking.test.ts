import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rankingRoutes } from '../ranking'

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

const mockGetPoolRanking = vi.fn()

vi.mock('../../../../services/ranking', () => ({
  getPoolRanking: (...args: unknown[]) => mockGetPoolRanking(...args),
}))

vi.mock('../../../../db/client', () => ({
  db: {
    query: {
      pool: {
        findFirst: vi.fn(() => ({ id: 'pool-1', entryFee: 5000 })),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => [{ count: 3 }]),
      })),
    })),
  },
}))

const testUser = { id: 'user-1', name: 'Test', phoneNumber: '+5511999999999' }
const headers = { 'x-test-user': JSON.stringify(testUser) }

function createTestApp() {
  const app = new Hono()
  app.route('/api', rankingRoutes)
  return app
}

describe('GET /api/pools/:poolId/ranking', () => {
  let app: Hono

  beforeEach(() => {
    app = createTestApp()
    vi.clearAllMocks()
  })

  it('returns_poolRanking_orderedByPoints', async () => {
    mockGetPoolRanking.mockResolvedValue([
      {
        position: 1,
        userId: 'user-2',
        name: 'Alice',
        totalPoints: 50,
        exactMatches: 3,
        isCurrentUser: false,
      },
      {
        position: 2,
        userId: 'user-1',
        name: 'Test',
        totalPoints: 40,
        exactMatches: 2,
        isCurrentUser: true,
      },
      {
        position: 3,
        userId: 'user-3',
        name: 'Bob',
        totalPoints: 30,
        exactMatches: 1,
        isCurrentUser: false,
      },
    ])

    const res = await app.request('/api/pools/pool-1/ranking', { headers })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ranking).toHaveLength(3)
    expect(body.ranking[0].position).toBe(1)
    expect(body.ranking[0].totalPoints).toBe(50)
    expect(body.ranking[1].isCurrentUser).toBe(true)
  })

  it('returns_tiebreakerByExactMatches', async () => {
    mockGetPoolRanking.mockResolvedValue([
      {
        position: 1,
        userId: 'user-2',
        name: 'Alice',
        totalPoints: 40,
        exactMatches: 3,
        isCurrentUser: false,
      },
      {
        position: 2,
        userId: 'user-1',
        name: 'Test',
        totalPoints: 40,
        exactMatches: 2,
        isCurrentUser: true,
      },
    ])

    const res = await app.request('/api/pools/pool-1/ranking', { headers })
    const body = await res.json()

    expect(body.ranking[0].exactMatches).toBe(3)
    expect(body.ranking[1].exactMatches).toBe(2)
    expect(body.ranking[0].position).toBe(1)
    expect(body.ranking[1].position).toBe(2)
  })

  it('returns_prizeTotal', async () => {
    mockGetPoolRanking.mockResolvedValue([])

    const res = await app.request('/api/pools/pool-1/ranking', { headers })
    const body = await res.json()

    expect(body.prizeTotal).toBeDefined()
    expect(typeof body.prizeTotal).toBe('number')
  })

  it('rejects_noAuth_401', async () => {
    const res = await app.request('/api/pools/pool-1/ranking')
    expect(res.status).toBe(401)
  })
})
