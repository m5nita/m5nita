import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'
import { upsertPredictionSchema } from '@manita/shared'
import { upsertPrediction, getUserPredictions, PredictionError } from '../services/prediction'

const predictionsRoutes = new Hono()

predictionsRoutes.use('/*', requireAuth)

// GET /api/pools/:poolId/predictions
predictionsRoutes.get('/pools/:poolId/predictions', async (c) => {
  const currentUser = c.get('user')
  const { poolId } = c.req.param()

  const predictions = await getUserPredictions(currentUser.id, poolId)
  return c.json({ predictions })
})

// PUT /api/pools/:poolId/predictions/:matchId
predictionsRoutes.put('/pools/:poolId/predictions/:matchId', async (c) => {
  const currentUser = c.get('user')
  const { poolId, matchId } = c.req.param()
  const body = await c.req.json()

  const parsed = upsertPredictionSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { error: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Dados invalidos' },
      400,
    )
  }

  try {
    const result = await upsertPrediction(
      currentUser.id,
      poolId,
      matchId,
      parsed.data.homeScore,
      parsed.data.awayScore,
    )
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
