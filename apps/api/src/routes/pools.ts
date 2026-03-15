import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'
import { createPoolSchema } from '@manita/shared'
import { createPool, getUserPools, getPoolById, getPoolByInviteCode, isPoolMember, PoolError } from '../services/pool'
import { createEntryPayment } from '../services/payment'

const poolsRoutes = new Hono()

poolsRoutes.use('/*', requireAuth)

// POST /api/pools — Create pool
poolsRoutes.post('/pools', async (c) => {
  const currentUser = c.get('user')
  const body = await c.req.json()
  const parsed = createPoolSchema.safeParse(body)

  if (!parsed.success) {
    return c.json(
      { error: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Dados invalidos' },
      400,
    )
  }

  try {
    const result = await createPool(currentUser.id, parsed.data.name, parsed.data.entryFee)
    const paymentResult = await createEntryPayment(
      currentUser.id,
      result.pool.id,
      parsed.data.entryFee,
    )

    return c.json(
      {
        pool: {
          ...result.pool,
          platformFee: result.platformFee,
        },
        payment: {
          id: paymentResult.payment.id,
          clientSecret: paymentResult.clientSecret,
          amount: parsed.data.entryFee,
        },
      },
      201,
    )
  } catch (err) {
    if (err instanceof PoolError) {
      return c.json({ error: err.code, message: err.message }, 400)
    }
    throw err
  }
})

// GET /api/pools — List user pools
poolsRoutes.get('/pools', async (c) => {
  const currentUser = c.get('user')
  const pools = await getUserPools(currentUser.id)
  return c.json({ pools })
})

// GET /api/pools/invite/:inviteCode — Public pool info for invite
poolsRoutes.get('/pools/invite/:inviteCode', async (c) => {
  const { inviteCode } = c.req.param()
  const currentUser = c.get('user')

  const poolInfo = await getPoolByInviteCode(inviteCode)
  if (!poolInfo) {
    return c.json({ error: 'NOT_FOUND', message: 'Convite invalido' }, 404)
  }

  if (!poolInfo.isOpen) {
    return c.json({ error: 'POOL_CLOSED', message: 'Este bolao nao aceita novas entradas' }, 409)
  }

  const alreadyMember = await isPoolMember(poolInfo.id, currentUser.id)
  if (alreadyMember) {
    return c.json({ error: 'ALREADY_MEMBER', message: 'Voce ja participa deste bolao' }, 409)
  }

  return c.json(poolInfo)
})

// GET /api/pools/:poolId — Pool details
poolsRoutes.get('/pools/:poolId', async (c) => {
  const { poolId } = c.req.param()
  const currentUser = c.get('user')

  const poolData = await getPoolById(poolId, currentUser.id)
  if (!poolData) {
    return c.json({ error: 'NOT_FOUND', message: 'Bolao nao encontrado' }, 404)
  }

  return c.json(poolData)
})

// POST /api/pools/:poolId/join — Join pool via invite
poolsRoutes.post('/pools/:poolId/join', async (c) => {
  const { poolId } = c.req.param()
  const currentUser = c.get('user')

  const poolData = await getPoolById(poolId, currentUser.id)
  if (!poolData) {
    return c.json({ error: 'NOT_FOUND', message: 'Bolao nao encontrado' }, 404)
  }

  if (!poolData.isOpen) {
    return c.json({ error: 'POOL_CLOSED', message: 'Este bolao nao aceita novas entradas' }, 409)
  }

  const alreadyMember = await isPoolMember(poolId, currentUser.id)
  if (alreadyMember) {
    return c.json({ error: 'ALREADY_MEMBER', message: 'Voce ja participa deste bolao' }, 409)
  }

  const paymentResult = await createEntryPayment(currentUser.id, poolId, poolData.entryFee)

  return c.json(
    {
      payment: {
        id: paymentResult.payment.id,
        clientSecret: paymentResult.clientSecret,
        amount: poolData.entryFee,
      },
    },
    201,
  )
})

export { poolsRoutes }
