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
const mockGetMatchPredictions = vi.fn()

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
    getMatchPredictions: (...args: unknown[]) => mockGetMatchPredictions(...args),
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
      new PredictionError('MATCH_STARTED', 'Não é possível palpitar após o início do jogo'),
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

describe('GET /api/pools/:poolId/matches/:matchId/predictions', () => {
  let app: Hono

  beforeEach(() => {
    app = createTestApp()
    vi.clearAllMocks()
  })

  it('returnsShape_lockedFinishedMatch_200', async () => {
    mockGetMatchPredictions.mockResolvedValue({
      matchId: 'match-1',
      isLocked: true,
      totalMembers: 4,
      viewerIncluded: true,
      viewerDidPredict: true,
      predictors: [
        { userId: 'u-ana', name: 'Ana', homeScore: 2, awayScore: 1, points: 5 },
        { userId: 'u-gus', name: 'Gustavo', homeScore: 2, awayScore: 1, points: 5 },
        { userId: 'u-bru', name: 'Bruno', homeScore: 2, awayScore: 0, points: 2 },
      ],
      nonPredictors: [],
    })

    const res = await app.request('/api/pools/pool-1/matches/match-1/predictions', { headers })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.matchId).toBe('match-1')
    expect(body.isLocked).toBe(true)
    expect(body.totalMembers).toBe(4)
    expect(body.viewerDidPredict).toBe(true)
    expect(body.predictors).toHaveLength(3)
    expect(body.predictors.every((p: { userId: string }) => p.userId !== 'user-1')).toBe(true)
    expect(mockGetMatchPredictions).toHaveBeenCalledWith('user-1', 'pool-1', 'match-1')
  })

  it('rejects_matchNotLocked_409', async () => {
    const { PredictionError } = await import('../../services/prediction')
    mockGetMatchPredictions.mockRejectedValue(
      new PredictionError('MATCH_NOT_LOCKED', 'Este jogo ainda não está bloqueado'),
    )

    const res = await app.request('/api/pools/pool-1/matches/match-1/predictions', { headers })

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('MATCH_NOT_LOCKED')
  })

  it('rejects_notMember_403', async () => {
    const { PredictionError } = await import('../../services/prediction')
    mockGetMatchPredictions.mockRejectedValue(
      new PredictionError('NOT_MEMBER', 'Você não é membro deste bolão'),
    )

    const res = await app.request('/api/pools/pool-1/matches/match-1/predictions', { headers })

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('NOT_MEMBER')
  })

  it('rejects_matchNotFound_404', async () => {
    const { PredictionError } = await import('../../services/prediction')
    mockGetMatchPredictions.mockRejectedValue(
      new PredictionError('MATCH_NOT_FOUND', 'Jogo não encontrado'),
    )

    const res = await app.request('/api/pools/pool-1/matches/missing/predictions', { headers })

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('MATCH_NOT_FOUND')
  })

  it('rejects_matchNotInPool_404', async () => {
    const { PredictionError } = await import('../../services/prediction')
    mockGetMatchPredictions.mockRejectedValue(
      new PredictionError('MATCH_NOT_IN_POOL', 'Este jogo não pertence ao bolão'),
    )

    const res = await app.request('/api/pools/pool-1/matches/match-x/predictions', { headers })

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('MATCH_NOT_IN_POOL')
  })

  it('rejects_poolNotFound_404', async () => {
    const { PredictionError } = await import('../../services/prediction')
    mockGetMatchPredictions.mockRejectedValue(
      new PredictionError('POOL_NOT_FOUND', 'Bolão não encontrado'),
    )

    const res = await app.request('/api/pools/missing/matches/match-1/predictions', { headers })

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('POOL_NOT_FOUND')
  })

  it('rejects_noAuth_401', async () => {
    const res = await app.request('/api/pools/pool-1/matches/match-1/predictions')
    expect(res.status).toBe(401)
  })

  it('allowsPendingPoints_pointsNull_200', async () => {
    mockGetMatchPredictions.mockResolvedValue({
      matchId: 'match-1',
      isLocked: true,
      totalMembers: 3,
      viewerIncluded: true,
      viewerDidPredict: false,
      predictors: [
        { userId: 'u-a', name: 'Ana', homeScore: 2, awayScore: 1, points: null },
        { userId: 'u-b', name: 'Bruno', homeScore: 1, awayScore: 1, points: null },
      ],
      nonPredictors: [],
    })

    const res = await app.request('/api/pools/pool-1/matches/match-1/predictions', { headers })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.predictors[0].points).toBeNull()
    expect(body.viewerDidPredict).toBe(false)
  })
})
