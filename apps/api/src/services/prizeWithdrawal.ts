import { validatePixKey } from '@m5nita/shared'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { payment } from '../db/schema/payment'
import { pool } from '../db/schema/pool'
import { poolMember } from '../db/schema/poolMember'
import { prizeWithdrawal } from '../db/schema/prizeWithdrawal'
import { getEffectiveFeeRate } from './coupon'
import { getPoolRanking } from './ranking'

export class PrizeWithdrawalError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'PrizeWithdrawalError'
  }
}

export async function getPrizeInfo(poolId: string, userId: string) {
  const poolData = await db.query.pool.findFirst({
    where: eq(pool.id, poolId),
    with: { coupon: true },
  })

  if (!poolData) {
    throw new PrizeWithdrawalError('NOT_FOUND', 'Bolão não encontrado')
  }

  if (poolData.status !== 'closed') {
    throw new PrizeWithdrawalError('POOL_NOT_CLOSED', 'O bolão ainda não foi finalizado.')
  }

  const [memberCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(poolMember)
    .where(eq(poolMember.poolId, poolId))

  const count = memberCount?.count ?? 0
  const discountPercent = poolData.coupon?.discountPercent ?? 0
  const effectiveRate = getEffectiveFeeRate(discountPercent)
  const prizeTotal = Math.floor(poolData.entryFee * count * (1 - effectiveRate))

  const ranking = await getPoolRanking(poolId, userId)
  const winners = ranking.filter((r) => r.position === 1)
  const winnerCount = winners.length
  const winnerShare = winnerCount > 0 ? Math.floor(prizeTotal / winnerCount) : 0
  const isWinner = winners.some((w) => w.userId === userId)

  let withdrawal = null
  if (isWinner) {
    const existing = await db.query.prizeWithdrawal.findFirst({
      where: and(eq(prizeWithdrawal.poolId, poolId), eq(prizeWithdrawal.userId, userId)),
    })
    if (existing) {
      withdrawal = {
        id: existing.id,
        amount: existing.amount,
        pixKeyType: existing.pixKeyType,
        pixKey: maskPixKey(existing.pixKey),
        status: existing.status,
        createdAt: existing.createdAt.toISOString(),
      }
    }
  }

  return {
    prizeTotal,
    winnerCount,
    winnerShare,
    isWinner,
    withdrawal,
    winners: winners.map((w) => ({
      userId: w.userId,
      name: w.name,
      position: w.position,
      totalPoints: w.totalPoints,
      exactMatches: w.exactMatches,
    })),
  }
}

export async function requestWithdrawal(
  poolId: string,
  userId: string,
  pixKeyType: string,
  pixKey: string,
) {
  const poolData = await db.query.pool.findFirst({
    where: eq(pool.id, poolId),
    with: { coupon: true },
  })

  if (!poolData) {
    throw new PrizeWithdrawalError('NOT_FOUND', 'Bolão não encontrado')
  }

  if (poolData.status !== 'closed') {
    throw new PrizeWithdrawalError('POOL_NOT_CLOSED', 'O bolão ainda não foi finalizado.')
  }

  const ranking = await getPoolRanking(poolId, userId)
  const winners = ranking.filter((r) => r.position === 1)
  const isWinner = winners.some((w) => w.userId === userId)

  if (!isWinner) {
    throw new PrizeWithdrawalError(
      'NOT_A_WINNER',
      'Apenas o vencedor pode solicitar a retirada do prêmio.',
    )
  }

  const existing = await db.query.prizeWithdrawal.findFirst({
    where: and(eq(prizeWithdrawal.poolId, poolId), eq(prizeWithdrawal.userId, userId)),
  })

  if (existing) {
    throw new PrizeWithdrawalError(
      'WITHDRAWAL_ALREADY_REQUESTED',
      'Você já solicitou a retirada do prêmio deste bolão.',
    )
  }

  const validation = validatePixKey(pixKeyType, pixKey)
  if (!validation.success) {
    throw new PrizeWithdrawalError(
      'INVALID_PIX_KEY',
      validation.error ?? 'A chave PIX informada é inválida para o tipo selecionado.',
    )
  }

  const [memberCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(poolMember)
    .where(eq(poolMember.poolId, poolId))

  const count = memberCount?.count ?? 0
  const discountPercent = poolData.coupon?.discountPercent ?? 0
  const effectiveRate = getEffectiveFeeRate(discountPercent)
  const prizeTotal = Math.floor(poolData.entryFee * count * (1 - effectiveRate))
  const winnerShare = Math.floor(prizeTotal / winners.length)

  const [prizePayment] = await db
    .insert(payment)
    .values({
      userId,
      poolId,
      amount: winnerShare,
      platformFee: 0,
      type: 'prize',
      status: 'pending',
    })
    .returning()

  const paymentRecord = prizePayment as NonNullable<typeof prizePayment>

  const [withdrawal] = await db
    .insert(prizeWithdrawal)
    .values({
      poolId,
      userId,
      paymentId: paymentRecord.id,
      amount: winnerShare,
      pixKeyType,
      pixKey,
    })
    .returning()

  return withdrawal as NonNullable<typeof withdrawal>
}

function maskPixKey(key: string): string {
  if (key.length <= 4) return key
  return `${'*'.repeat(key.length - 4)}${key.slice(-4)}`
}
