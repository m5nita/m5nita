import { upsertPredictionSchema } from '@m5nita/shared'
import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { getContainer } from '../container'
import { PredictionError } from '../domain/prediction/PredictionError'
import { requireAuth } from '../middleware/auth'
import type { AppEnv } from '../types/hono'

const MATCH_PREDICTIONS_STATUS_BY_ERROR: Record<string, ContentfulStatusCode> = {
  NOT_MEMBER: 403,
  MATCH_NOT_LOCKED: 409,
  POOL_NOT_FOUND: 404,
  MATCH_NOT_FOUND: 404,
  MATCH_NOT_IN_POOL: 404,
}

const predictionsRoutes = new Hono<AppEnv>()

predictionsRoutes.use('/*', requireAuth)

// GET /api/pools/:poolId/predictions
predictionsRoutes.get('/pools/:poolId/predictions', async (c) => {
  const currentUser = c.get('user')
  const { poolId } = c.req.param()

  const predictions = await getContainer().getUserPredictionsUseCase.execute({
    userId: currentUser.id,
    poolId,
  })
  return c.json({ predictions })
})

// GET /api/pools/:poolId/matches/:matchId/predictions
predictionsRoutes.get('/pools/:poolId/matches/:matchId/predictions', async (c) => {
  const currentUser = c.get('user')
  const { poolId, matchId } = c.req.param()

  try {
    const response = await getContainer().getMatchPredictionsUseCase.execute({
      viewerUserId: currentUser.id,
      poolId,
      matchId,
    })
    return c.json(response)
  } catch (err) {
    if (err instanceof PredictionError) {
      const status = MATCH_PREDICTIONS_STATUS_BY_ERROR[err.code] ?? 400
      return c.json({ error: err.code, message: err.message }, status)
    }
    throw err
  }
})

// PUT /api/pools/:poolId/predictions/:matchId
predictionsRoutes.put('/pools/:poolId/predictions/:matchId', async (c) => {
  const currentUser = c.get('user')
  const { poolId, matchId } = c.req.param()
  const body = await c.req.json()

  const parsed = upsertPredictionSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { error: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Dados inválidos' },
      400,
    )
  }

  try {
    const result = await getContainer().upsertPredictionUseCase.execute({
      userId: currentUser.id,
      poolId,
      matchId,
      homeScore: parsed.data.homeScore,
      awayScore: parsed.data.awayScore,
    })
    return c.json(result)
  } catch (err) {
    if (err instanceof PredictionError) {
      const status = err.code === 'NOT_MEMBER' ? 403 : err.code === 'MATCH_STARTED' ? 403 : 400
      return c.json({ error: err.code, message: err.message }, status)
    }
    throw err
  }
})

export { predictionsRoutes }
