import { Hono } from 'hono'
import { getContainer } from '../../../container'
import { StatsError } from '../../../domain/stats/StatsError'
import type { AppEnv } from '../../../types/hono'
import { requireAuth } from '../middleware/auth'

const statsRoutes = new Hono<AppEnv>()

statsRoutes.use('/*', requireAuth)

const STATUS_MAP: Record<StatsError['code'], 404 | 409> = {
  NOT_FOUND: 404,
  NOT_MEMBER: 404,
  ALREADY_UNLOCKED: 409,
}

// GET /api/pools/:poolId/stats — server-side gated read.
// Locked → { unlocked:false, teaser, price }; unlocked → the panel.
statsRoutes.get('/pools/:poolId/stats', async (c) => {
  const currentUser = c.get('user')
  const { poolId } = c.req.param()

  try {
    const result = await getContainer().getParticipantStatsUseCase.execute({
      userId: currentUser.id,
      poolId,
    })
    return c.json(result)
  } catch (err) {
    if (err instanceof StatsError) {
      return c.json({ error: err.code, message: err.message }, STATUS_MAP[err.code])
    }
    throw err
  }
})

// POST /api/pools/:poolId/stats/unlock — create a one-time Pix checkout.
statsRoutes.post('/pools/:poolId/stats/unlock', async (c) => {
  const currentUser = c.get('user')
  const { poolId } = c.req.param()

  try {
    const result = await getContainer().unlockStatsUseCase.execute({
      userId: currentUser.id,
      poolId,
    })
    return c.json(
      {
        payment: {
          id: result.payment.payment.id,
          checkoutUrl: result.payment.checkoutUrl,
          amount: result.amount,
        },
      },
      201,
    )
  } catch (err) {
    if (err instanceof StatsError) {
      return c.json({ error: err.code, message: err.message }, STATUS_MAP[err.code])
    }
    throw err
  }
})

export { statsRoutes }
