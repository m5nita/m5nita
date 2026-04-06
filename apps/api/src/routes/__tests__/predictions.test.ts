import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { predictionsRoutes } from '../predictions'

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

const mockUpsertPrediction = vi.fn()
const mockGetUserPredictions = vi.fn()

vi.mock('../../services/prediction', () => {
  class PredictionError extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
      this.name = 'PredictionError'
    }
  }

  return {
    upsertPrediction: (...args: unknown[]) => mockUpsertPrediction(...args),
    getUserPredictions: (...args: unknown[]) => mockGetUserPredictions(...args),
    PredictionError,
  }
})

const testUser = { id: 'user-1', name: 'Test', phoneNumber: '+5511999999999' }
const headers = { 'x-test-user': JSON.stringify(testUser) }

function createTestApp() {
  const app = new Hono()
  app.route('/api', predictionsRoutes)
  return app
}

describe('PUT /api/pools/:poolId/predictions/:matchId', () => {
  let app: Hono

  beforeEach(() => {
    app = createTestApp()
    vi.clearAllMocks()
  })

  it('saves_validPrediction_200', async () => {
    mockUpsertPrediction.mockResolvedValue({
      id: 'pred-1',
      matchId: 'match-1',
      homeScore: 2,
      awayScore: 1,
      points: null,
    })

    const res = await app.request('/api/pools/pool-1/predictions/match-1', {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 2, awayScore: 1 }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.homeScore).toBe(2)
    expect(body.awayScore).toBe(1)
    expect(mockUpsertPrediction).toHaveBeenCalledWith('user-1', 'pool-1', 'match-1', 2, 1)
  })

  it('rejects_matchStarted_403', async () => {
    const { PredictionError } = await import('../../services/prediction')
    mockUpsertPrediction.mockRejectedValue(
      new PredictionError('MATCH_STARTED', 'Nao e possivel palpitar apos o inicio do jogo'),
    )

    const res = await app.request('/api/pools/pool-1/predictions/match-1', {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 2, awayScore: 1 }),
    })

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('MATCH_STARTED')
  })

  it('rejects_notMember_403', async () => {
    const { PredictionError } = await import('../../services/prediction')
    mockUpsertPrediction.mockRejectedValue(
      new PredictionError('NOT_MEMBER', 'Você não é membro deste bolão'),
    )

    const res = await app.request('/api/pools/pool-1/predictions/match-1', {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 2, awayScore: 1 }),
    })

    expect(res.status).toBe(403)
  })

  it('rejects_negativeScore_400', async () => {
    const res = await app.request('/api/pools/pool-1/predictions/match-1', {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: -1, awayScore: 1 }),
    })

    expect(res.status).toBe(400)
  })

  it('rejects_noAuth_401', async () => {
    const res = await app.request('/api/pools/pool-1/predictions/match-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 2, awayScore: 1 }),
    })

    expect(res.status).toBe(401)
  })
})

describe('GET /api/pools/:poolId/predictions', () => {
  let app: Hono

  beforeEach(() => {
    app = createTestApp()
    vi.clearAllMocks()
  })

  it('returns_authenticated_userPredictions', async () => {
    mockGetUserPredictions.mockResolvedValue([
      { id: 'pred-1', matchId: 'match-1', homeScore: 2, awayScore: 1, points: 5 },
    ])

    const res = await app.request('/api/pools/pool-1/predictions', { headers })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.predictions).toHaveLength(1)
  })
})
