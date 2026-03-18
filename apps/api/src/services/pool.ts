import { eq, and, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { pool } from '../db/schema/pool'
import { poolMember } from '../db/schema/poolMember'
import { payment } from '../db/schema/payment'
import { user } from '../db/schema/auth'
import { POOL } from '@m5nita/shared'

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < POOL.INVITE_CODE_LENGTH; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export async function createPool(userId: string, name: string, entryFee: number) {
  // Validate
  if (name.length < POOL.MIN_NAME_LENGTH || name.length > POOL.MAX_NAME_LENGTH) {
    throw new PoolError('VALIDATION_ERROR', 'Nome deve ter entre 3 e 50 caracteres')
  }
  if (entryFee < POOL.MIN_ENTRY_FEE || entryFee > POOL.MAX_ENTRY_FEE) {
    throw new PoolError('VALIDATION_ERROR', 'Valor deve ser entre R$ 10 e R$ 1.000')
  }

  const inviteCode = generateInviteCode()
  const platformFee = Math.floor(entryFee * POOL.PLATFORM_FEE_RATE)

  const [newPool] = await db.insert(pool).values({
    name,
    entryFee,
    ownerId: userId,
    inviteCode,
  }).returning()

  return { pool: newPool!, platformFee }
}

export async function getUserPools(userId: string) {
  const members = await db.query.poolMember.findMany({
    where: eq(poolMember.userId, userId),
    with: {
      pool: true,
    },
  })

  return members.map((m) => ({
    id: m.pool.id,
    name: m.pool.name,
    entryFee: m.pool.entryFee,
    status: m.pool.status,
    memberCount: 0, // Will be enriched later
    userPosition: null,
    userPoints: 0,
  }))
}

export async function getPoolById(poolId: string, userId: string) {
  const poolData = await db.query.pool.findFirst({
    where: eq(pool.id, poolId),
    with: {
      owner: true,
    },
  })

  if (!poolData) return null

  // Count members
  const [memberCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(poolMember)
    .where(eq(poolMember.poolId, poolId))

  const prizeTotal = Math.floor(poolData.entryFee * (memberCount?.count ?? 0) * (1 - POOL.PLATFORM_FEE_RATE))

  return {
    ...poolData,
    owner: { id: poolData.owner.id, name: poolData.owner.name },
    memberCount: memberCount?.count ?? 0,
    prizeTotal,
  }
}

export async function getPoolByInviteCode(inviteCode: string) {
  const poolData = await db.query.pool.findFirst({
    where: eq(pool.inviteCode, inviteCode),
    with: {
      owner: true,
    },
  })

  if (!poolData) return null

  const [memberCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(poolMember)
    .where(eq(poolMember.poolId, poolData.id))

  const count = memberCount?.count ?? 0
  const platformFee = Math.floor(poolData.entryFee * POOL.PLATFORM_FEE_RATE)
  const prizeTotal = Math.floor(poolData.entryFee * count * (1 - POOL.PLATFORM_FEE_RATE))

  return {
    id: poolData.id,
    name: poolData.name,
    entryFee: poolData.entryFee,
    platformFee,
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
