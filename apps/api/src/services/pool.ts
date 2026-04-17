import { POOL } from '@m5nita/shared'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { pool } from '../db/schema/pool'
import { poolMember } from '../db/schema/poolMember'
import { getCompetitionById } from './competition'
import { getEffectiveFeeRate, incrementUsage, validateCoupon } from './coupon'

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < POOL.INVITE_CODE_LENGTH; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export async function createPool(
  userId: string,
  name: string,
  entryFee: number,
  competitionId: string,
  matchdayFrom?: number,
  matchdayTo?: number,
  couponCode?: string,
) {
  if (name.length < POOL.MIN_NAME_LENGTH || name.length > POOL.MAX_NAME_LENGTH) {
    throw new PoolError('VALIDATION_ERROR', 'Nome deve ter entre 3 e 50 caracteres')
  }
  if (entryFee < POOL.MIN_ENTRY_FEE || entryFee > POOL.MAX_ENTRY_FEE) {
    throw new PoolError('VALIDATION_ERROR', 'Valor deve ser entre R$ 10 e R$ 1.000')
  }

  const comp = await getCompetitionById(competitionId)
  if (!comp) {
    throw new PoolError('INVALID_COMPETITION', 'Competição não encontrada')
  }
  if (comp.status !== 'active') {
    throw new PoolError('INVALID_COMPETITION', 'Competição não está ativa')
  }

  let couponId: string | null = null
  let discountPercent = 0

  if (couponCode) {
    const result = await validateCoupon(couponCode)
    if (!result.valid) {
      const messages: Record<string, string> = {
        not_found: 'Cupom inválido ou expirado',
        expired: 'Cupom inválido ou expirado',
        exhausted: 'Cupom atingiu o limite de utilizações',
        inactive: 'Cupom inválido ou expirado',
      }
      throw new PoolError('INVALID_COUPON', messages[result.reason] ?? 'Cupom inválido')
    }
    const incremented = await incrementUsage(result.couponId)
    if (!incremented) {
      throw new PoolError('COUPON_EXHAUSTED', 'Cupom atingiu o limite de utilizações')
    }
    couponId = result.couponId
    discountPercent = result.discountPercent
  }

  const effectiveRate = getEffectiveFeeRate(discountPercent)
  const platformFee = Math.floor(entryFee * effectiveRate)
  const originalPlatformFee = Math.floor(entryFee * POOL.PLATFORM_FEE_RATE)
  const inviteCode = generateInviteCode()

  const [newPool] = await db
    .insert(pool)
    .values({
      name,
      entryFee,
      ownerId: userId,
      inviteCode,
      competitionId,
      matchdayFrom: matchdayFrom ?? null,
      matchdayTo: matchdayTo ?? null,
      couponId,
      status: 'pending',
    })
    .returning()

  return {
    pool: newPool as NonNullable<typeof newPool>,
    platformFee,
    originalPlatformFee,
    discountPercent,
    couponCode: couponCode?.trim().toUpperCase() ?? null,
  }
}

export async function getPoolById(poolId: string, _userId: string) {
  const poolData = await db.query.pool.findFirst({
    where: eq(pool.id, poolId),
    with: {
      owner: true,
      coupon: true,
      competition: true,
    },
  })

  if (!poolData) return null

  const [memberCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(poolMember)
    .where(eq(poolMember.poolId, poolId))

  const discountPercent = poolData.coupon?.discountPercent ?? 0
  const effectiveRate = getEffectiveFeeRate(discountPercent)
  const prizeTotal = Math.floor(poolData.entryFee * (memberCount?.count ?? 0) * (1 - effectiveRate))

  return {
    ...poolData,
    owner: { id: poolData.owner.id, name: poolData.owner.name },
    competitionName: poolData.competition.name,
    memberCount: memberCount?.count ?? 0,
    prizeTotal,
    discountPercent,
    originalPlatformFee: Math.floor(poolData.entryFee * POOL.PLATFORM_FEE_RATE),
    platformFee: Math.floor(poolData.entryFee * effectiveRate),
  }
}

export async function getPoolByInviteCode(inviteCode: string) {
  const poolData = await db.query.pool.findFirst({
    where: eq(pool.inviteCode, inviteCode),
    with: {
      owner: true,
      coupon: true,
      competition: true,
    },
  })

  if (!poolData || poolData.status !== 'active') return null

  const [memberCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(poolMember)
    .where(eq(poolMember.poolId, poolData.id))

  const count = memberCount?.count ?? 0
  const discountPercent = poolData.coupon?.discountPercent ?? 0
  const effectiveRate = getEffectiveFeeRate(discountPercent)
  const originalPlatformFee = Math.floor(poolData.entryFee * POOL.PLATFORM_FEE_RATE)
  const platformFee = Math.floor(poolData.entryFee * effectiveRate)
  const prizeTotal = Math.floor(poolData.entryFee * count * (1 - effectiveRate))

  return {
    id: poolData.id,
    name: poolData.name,
    entryFee: poolData.entryFee,
    platformFee,
    originalPlatformFee,
    discountPercent,
    competitionName: poolData.competition.name,
    matchdayFrom: poolData.matchdayFrom,
    matchdayTo: poolData.matchdayTo,
    owner: { name: poolData.owner.name },
    memberCount: count,
    prizeTotal,
    isOpen: poolData.isOpen,
  }
}

export async function isPoolMember(poolId: string, userId: string): Promise<boolean> {
  const existing = await db.query.poolMember.findFirst({
    where: and(eq(poolMember.poolId, poolId), eq(poolMember.userId, userId)),
  })
  return !!existing
}

export class PoolError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'PoolError'
  }
}
