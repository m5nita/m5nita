import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rankingRoutes } from './ranking'

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

const mockGetPoolRanking = vi.fn()
const mockFindByIdWithDetails = vi.fn(async () => ({
  id: 'pool-1',
  entryFee: 5000,
  competitionId: 'comp-1',
  matchdayFrom: null,
  matchdayTo: null,
  matchId: null,
  memberCount: 3,
  prizeTotal: 14250,
  hasLiveMatch: false,
  coupon: null,
}))

vi.mock('../../../services/ranking', () => ({
  getPoolRanking: (...args: unknown[]) => mockGetPoolRanking(...args),
}))

const mockPoolHasLiveMatch = vi.fn(async (..._args: unknown[]) => false)
vi.mock('../../../services/pool', () => ({
  poolHasLiveMatch: (...args: unknown[]) => mockPoolHasLiveMatch(...args),
}))

const mockIsMember = vi.fn(async () => true)
vi.mock('../../../container', () => ({
  getContainer: () => ({
    poolRepo: { findByIdWithDetails: mockFindByIdWithDetails, isMember: mockIsMember },
  }),
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
        livePoints: 0,
        exactMatches: 3,
        isCurrentUser: false,
      },
      {
        position: 2,
        userId: 'user-1',
        name: 'Test',
        totalPoints: 40,
        livePoints: 0,
        exactMatches: 2,
        isCurrentUser: true,
      },
      {
        position: 3,
        userId: 'user-3',
        name: 'Bob',
        totalPoints: 30,
        livePoints: 0,
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
        livePoints: 0,
        exactMatches: 3,
        isCurrentUser: false,
      },
      {
        position: 2,
        userId: 'user-1',
        name: 'Test',
        totalPoints: 40,
        livePoints: 0,
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

  it('returns_livePoints_field_on_each_entry', async () => {
    mockGetPoolRanking.mockResolvedValue([
      {
        position: 1,
        userId: 'u-1',
        name: 'Ana',
        totalPoints: 30,
        livePoints: 25,
        exactMatches: 3,
        isCurrentUser: false,
      },
    ])

    const res = await app.request('/api/pools/pool-1/ranking', { headers })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ranking).toHaveLength(1)
    expect(body.ranking[0].livePoints).toBe(25)
  })

  it('returns_prizeTotal', async () => {
    mockGetPoolRanking.mockResolvedValue([])

    const res = await app.request('/api/pools/pool-1/ranking', { headers })
    const body = await res.json()

    expect(body.prizeTotal).toBeDefined()
    expect(typeof body.prizeTotal).toBe('number')
  })

  it('returns_hasLiveMatch_from_pool_details_without_extra_query', async () => {
    mockGetPoolRanking.mockResolvedValue([])
    mockFindByIdWithDetails.mockResolvedValueOnce({
      id: 'pool-1',
      entryFee: 5000,
      competitionId: 'comp-1',
      matchdayFrom: null,
      matchdayTo: null,
      matchId: null,
      memberCount: 3,
      prizeTotal: 14250,
      hasLiveMatch: true,
      coupon: null,
    })

    const res = await app.request('/api/pools/pool-1/ranking', { headers })
    const body = await res.json()

    // hasLiveMatch must come from the single findByIdWithDetails read, not a
    // second poolHasLiveMatch query (mocked to return false).
    expect(body.hasLiveMatch).toBe(true)
    expect(mockPoolHasLiveMatch).not.toHaveBeenCalled()
  })

  it('rejects_noAuth_401', async () => {
    const res = await app.request('/api/pools/pool-1/ranking')
    expect(res.status).toBe(401)
  })

  it('rejects_nonMember_403_withoutLeakingRanking', async () => {
    mockIsMember.mockResolvedValueOnce(false)
    mockGetPoolRanking.mockResolvedValue([
      {
        position: 1,
        userId: 'user-2',
        name: 'Alice',
        totalPoints: 50,
        livePoints: 0,
        exactMatches: 3,
        isCurrentUser: false,
      },
    ])

    const res = await app.request('/api/pools/pool-1/ranking', { headers })

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.ranking).toBeUndefined()
    // A non-member must not trigger the standings read at all.
    expect(mockGetPoolRanking).not.toHaveBeenCalled()
  })
})
