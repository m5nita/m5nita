import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'
import { createPoolSchema, updatePoolSchema } from '@manita/shared'
import { createPool, getUserPools, getPoolById, getPoolByInviteCode, isPoolMember, PoolError } from '../services/pool'
import { createEntryPayment, createRefund } from '../services/payment'
import { eq, and, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { pool } from '../db/schema/pool'
import { poolMember } from '../db/schema/poolMember'
import { payment } from '../db/schema/payment'
import { user } from '../db/schema/auth'

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

// PATCH /api/pools/:poolId — Update pool (owner only)
poolsRoutes.patch('/pools/:poolId', async (c) => {
  const { poolId } = c.req.param()
  const currentUser = c.get('user')
  const body = await c.req.json()

  const poolData = await db.query.pool.findFirst({ where: eq(pool.id, poolId) })
  if (!poolData) return c.json({ error: 'NOT_FOUND', message: 'Bolao nao encontrado' }, 404)
  if (poolData.ownerId !== currentUser.id) return c.json({ error: 'FORBIDDEN', message: 'Apenas o criador pode editar' }, 403)

  const parsed = updatePoolSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Dados invalidos' }, 400)

  const [updated] = await db.update(pool).set({ ...parsed.data, updatedAt: new Date() }).where(eq(pool.id, poolId)).returning()
  return c.json(updated)
})

// GET /api/pools/:poolId/members — List members (owner only)
poolsRoutes.get('/pools/:poolId/members', async (c) => {
  const { poolId } = c.req.param()
  const currentUser = c.get('user')

  const poolData = await db.query.pool.findFirst({ where: eq(pool.id, poolId) })
  if (!poolData) return c.json({ error: 'NOT_FOUND' }, 404)
  if (poolData.ownerId !== currentUser.id) return c.json({ error: 'FORBIDDEN' }, 403)

  const members = await db
    .select({ id: poolMember.id, userId: poolMember.userId, name: user.name, joinedAt: poolMember.joinedAt })
    .from(poolMember)
    .innerJoin(user, eq(user.id, poolMember.userId))
    .where(eq(poolMember.poolId, poolId))

  return c.json({ members })
})

// DELETE /api/pools/:poolId/members/:memberId — Remove member with refund (owner only)
poolsRoutes.delete('/pools/:poolId/members/:memberId', async (c) => {
  const { poolId, memberId } = c.req.param()
  const currentUser = c.get('user')

  const poolData = await db.query.pool.findFirst({ where: eq(pool.id, poolId) })
  if (!poolData) return c.json({ error: 'NOT_FOUND' }, 404)
  if (poolData.ownerId !== currentUser.id) return c.json({ error: 'FORBIDDEN' }, 403)

  const member = await db.query.poolMember.findFirst({ where: eq(poolMember.id, memberId) })
  if (!member) return c.json({ error: 'NOT_FOUND', message: 'Membro nao encontrado' }, 404)

  await createRefund(member.paymentId)
  return c.json({ refund: { id: member.paymentId, amount: poolData.entryFee, status: 'pending' } })
})

// POST /api/pools/:poolId/cancel — Cancel pool with full refund (owner only)
poolsRoutes.post('/pools/:poolId/cancel', async (c) => {
  const { poolId } = c.req.param()
  const currentUser = c.get('user')

  const poolData = await db.query.pool.findFirst({ where: eq(pool.id, poolId) })
  if (!poolData) return c.json({ error: 'NOT_FOUND' }, 404)
  if (poolData.ownerId !== currentUser.id) return c.json({ error: 'FORBIDDEN' }, 403)

  // Check if prize already distributed
  const [prizePayment] = await db
    .select()
    .from(payment)
    .where(and(eq(payment.poolId, poolId), eq(payment.type, 'prize'), eq(payment.status, 'completed')))
    .limit(1)

  if (prizePayment) {
    return c.json({ error: 'PRIZE_ALREADY_DISTRIBUTED', message: 'Nao e possivel encerrar apos distribuicao do premio' }, 409)
  }

  // Refund all members
  const payments = await db.query.payment.findMany({
    where: and(eq(payment.poolId, poolId), eq(payment.type, 'entry'), eq(payment.status, 'completed')),
  })

  const refunds = []
  for (const p of payments) {
    try {
      await createRefund(p.id)
      refunds.push({ userId: p.userId, amount: p.amount, status: 'pending' })
    } catch (err) {
      refunds.push({ userId: p.userId, amount: p.amount, status: 'error' })
    }
  }

  await db.update(pool).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(pool.id, poolId))

  return c.json({ pool: { status: 'cancelled' }, refunds })
})

export { poolsRoutes }
