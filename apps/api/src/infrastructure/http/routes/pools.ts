import {
  createPoolSchema,
  POOL,
  updatePoolSchema,
  validateCouponSchema,
  withdrawPrizeSchema,
} from '@m5nita/shared'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { getContainer } from '../../../container'
import { db } from '../../../db/client'
import { user } from '../../../db/schema/auth'
import { pool } from '../../../db/schema/pool'
import { poolMember } from '../../../db/schema/poolMember'
import { PoolError } from '../../../domain/pool/PoolError'
import { PrizeWithdrawalError } from '../../../domain/prize/PrizeWithdrawalError'
import { getEffectiveFeeRate, validateCoupon } from '../../../services/coupon'
import { createRefund } from '../../../services/payment'
import { getPoolById, getPoolByInviteCode, isPoolMember } from '../../../services/pool'
import type { AppEnv } from '../../../types/hono'
import { requireAuth } from '../middleware/auth'

const poolsRoutes = new Hono<AppEnv>()

poolsRoutes.use('/*', requireAuth)

// POST /api/pools/validate-coupon — Validate coupon in real-time
poolsRoutes.post('/pools/validate-coupon', async (c) => {
  const body = await c.req.json()
  const parsed = validateCouponSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ valid: false, reason: 'not_found' })
  }

  const result = await validateCoupon(parsed.data.couponCode)

  if (!result.valid) {
    return c.json({ valid: false, reason: result.reason })
  }

  const originalFee = Math.floor(parsed.data.entryFee * POOL.PLATFORM_FEE_RATE)
  const effectiveRate = getEffectiveFeeRate(result.discountPercent)
  const discountedFee = Math.floor(parsed.data.entryFee * effectiveRate)

  return c.json({
    valid: true,
    discountPercent: result.discountPercent,
    originalFee,
    discountedFee,
  })
})

// POST /api/pools — Create pool
poolsRoutes.post('/pools', async (c) => {
  const currentUser = c.get('user')
  const body = await c.req.json()
  const parsed = createPoolSchema.safeParse(body)

  if (!parsed.success) {
    return c.json(
      { error: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Dados inválidos' },
      400,
    )
  }

  try {
    const result = await getContainer().createPoolUseCase.execute({
      userId: currentUser.id,
      name: parsed.data.name,
      entryFee: parsed.data.entryFee,
      competitionId: parsed.data.competitionId,
      matchdayFrom: parsed.data.matchdayFrom,
      matchdayTo: parsed.data.matchdayTo,
      couponCode: parsed.data.couponCode,
    })

    return c.json(
      {
        pool: {
          id: result.pool.id,
          name: result.pool.name,
          entryFee: result.pool.entryFee.value.centavos,
          ownerId: result.pool.ownerId,
          inviteCode: result.pool.inviteCode.value,
          competitionId: result.pool.competitionId,
          matchdayFrom: result.pool.matchdayRange?.from ?? null,
          matchdayTo: result.pool.matchdayRange?.to ?? null,
          status: result.pool.status.value,
          isOpen: result.pool.isOpen,
          couponId: result.pool.couponId,
          platformFee: result.platformFee,
          originalPlatformFee: result.originalPlatformFee,
          discountPercent: result.discountPercent,
          couponCode: result.couponCode,
        },
        payment: {
          id: result.payment.payment.id,
          checkoutUrl: result.payment.checkoutUrl,
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
  const pools = await getContainer().getUserPoolsUseCase.execute({ userId: currentUser.id })
  return c.json({ pools })
})

// GET /api/pools/invite/:inviteCode — Public pool info for invite
poolsRoutes.get('/pools/invite/:inviteCode', async (c) => {
  const { inviteCode } = c.req.param()
  const currentUser = c.get('user')

  const poolInfo = await getPoolByInviteCode(inviteCode)
  if (!poolInfo) {
    return c.json({ error: 'NOT_FOUND', message: 'Convite inválido' }, 404)
  }

  if (!poolInfo.isOpen) {
    return c.json({ error: 'POOL_CLOSED', message: 'Este bolão não aceita novas entradas' }, 409)
  }

  const alreadyMember = await isPoolMember(poolInfo.id, currentUser.id)
  if (alreadyMember) {
    return c.json({ error: 'ALREADY_MEMBER', message: 'Você já participa deste bolão' }, 409)
  }

  return c.json(poolInfo)
})

// GET /api/pools/:poolId — Pool details
poolsRoutes.get('/pools/:poolId', async (c) => {
  const { poolId } = c.req.param()
  const currentUser = c.get('user')

  const poolData = await getPoolById(poolId, currentUser.id)
  if (!poolData) {
    return c.json({ error: 'NOT_FOUND', message: 'Bolão não encontrado' }, 404)
  }

  return c.json(poolData)
})

// POST /api/pools/:poolId/join — Join pool via invite
poolsRoutes.post('/pools/:poolId/join', async (c) => {
  const { poolId } = c.req.param()
  const currentUser = c.get('user')

  try {
    const result = await getContainer().joinPoolUseCase.execute({
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
    if (err instanceof PoolError) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        POOL_CLOSED: 409,
        ALREADY_MEMBER: 409,
      }
      return c.json({ error: err.code, message: err.message }, (statusMap[err.code] ?? 400) as 400)
    }
    throw err
  }
})

// PATCH /api/pools/:poolId — Update pool (owner only)
poolsRoutes.patch('/pools/:poolId', async (c) => {
  const { poolId } = c.req.param()
  const currentUser = c.get('user')
  const body = await c.req.json()

  const poolData = await db.query.pool.findFirst({ where: eq(pool.id, poolId) })
  if (!poolData) return c.json({ error: 'NOT_FOUND', message: 'Bolão não encontrado' }, 404)
  if (poolData.ownerId !== currentUser.id)
    return c.json({ error: 'FORBIDDEN', message: 'Apenas o criador pode editar' }, 403)

  const parsed = updatePoolSchema.safeParse(body)
  if (!parsed.success)
    return c.json(
      { error: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Dados inválidos' },
      400,
    )

  const [updated] = await db
    .update(pool)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(pool.id, poolId))
    .returning()
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
    .select({
      id: poolMember.id,
      userId: poolMember.userId,
      name: user.name,
      joinedAt: poolMember.joinedAt,
    })
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
  if (!member) return c.json({ error: 'NOT_FOUND', message: 'Membro não encontrado' }, 404)

  await createRefund(member.paymentId)
  return c.json({ refund: { id: member.paymentId, amount: poolData.entryFee, status: 'pending' } })
})

// GET /api/pools/:poolId/prize — Prize info for finalized pool
poolsRoutes.get('/pools/:poolId/prize', async (c) => {
  const { poolId } = c.req.param()
  const currentUser = c.get('user')

  try {
    const prizeInfo = await getContainer().getPrizeInfoUseCase.execute({
      poolId,
      userId: currentUser.id,
    })
    return c.json(prizeInfo)
  } catch (err) {
    if (err instanceof PrizeWithdrawalError) {
      const status = err.code === 'NOT_FOUND' ? 404 : 400
      return c.json({ error: err.code, message: err.message }, status)
    }
    throw err
  }
})

// POST /api/pools/:poolId/prize/withdraw — Request prize withdrawal (winner only)
poolsRoutes.post('/pools/:poolId/prize/withdraw', async (c) => {
  const { poolId } = c.req.param()
  const currentUser = c.get('user')
  const body = await c.req.json()

  const parsed = withdrawPrizeSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { error: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Dados inválidos' },
      400,
    )
  }

  try {
    const withdrawal = await getContainer().requestWithdrawalUseCase.execute({
      poolId,
      userId: currentUser.id,
      pixKeyType: parsed.data.pixKeyType,
      pixKey: parsed.data.pixKey,
    })

    return c.json(withdrawal, 201)
  } catch (err) {
    if (err instanceof PrizeWithdrawalError) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        NOT_A_WINNER: 403,
        WITHDRAWAL_ALREADY_REQUESTED: 409,
        POOL_NOT_CLOSED: 400,
        INVALID_PIX_KEY: 400,
      }
      return c.json({ error: err.code, message: err.message }, (statusMap[err.code] ?? 400) as 400)
    }
    throw err
  }
})

// POST /api/pools/:poolId/cancel — Cancel pool with full refund (owner only)
poolsRoutes.post('/pools/:poolId/cancel', async (c) => {
  const { poolId } = c.req.param()
  const currentUser = c.get('user')

  try {
    const result = await getContainer().cancelPoolUseCase.execute({
      userId: currentUser.id,
      poolId,
    })

    return c.json({ pool: { status: 'cancelled' }, refunds: result.refunds })
  } catch (err) {
    if (err instanceof PoolError) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        FORBIDDEN: 403,
        PRIZE_WITHDRAWAL_REQUESTED: 409,
      }
      return c.json({ error: err.code, message: err.message }, (statusMap[err.code] ?? 400) as 400)
    }
    throw err
  }
})

export { poolsRoutes }
