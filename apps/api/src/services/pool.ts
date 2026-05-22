import { POOL } from '@m5nita/shared'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { match } from '../db/schema/match'
import { pool } from '../db/schema/pool'
import { poolMember } from '../db/schema/poolMember'
import { getEffectiveFeeRate } from './coupon'

export async function getPoolById(poolId: string, userId: string) {
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

  const hasLiveMatch = await poolHasLiveMatch(
    poolData.competitionId,
    poolData.matchdayFrom,
    poolData.matchdayTo,
    poolData.matchId,
  )

  const isMember = await isPoolMember(poolId, userId)

  const discountPercent = poolData.coupon?.discountPercent ?? 0
  const effectiveRate = getEffectiveFeeRate(discountPercent)
  const prizeTotal = Math.floor(poolData.entryFee * (memberCount?.count ?? 0) * (1 - effectiveRate))

  return {
    ...poolData,
    owner: { id: poolData.owner.id, name: poolData.owner.name },
    competitionName: poolData.competition.name,
    memberCount: memberCount?.count ?? 0,
    prizeTotal,
    hasLiveMatch,
    isMember,
    discountPercent,
    originalPlatformFee: Math.floor(poolData.entryFee * POOL.PLATFORM_FEE_RATE),
    platformFee: Math.floor(poolData.entryFee * effectiveRate),
  }
}

export async function poolHasLiveMatch(
  competitionId: string,
  matchdayFrom: number | null,
  matchdayTo: number | null,
  matchId: string | null = null,
): Promise<boolean> {
  // Single-match scope: only the chosen match counts as "live for this pool".
  if (matchId !== null) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(match)
      .where(and(eq(match.id, matchId), eq(match.status, 'live')))
    return (row?.count ?? 0) > 0
  }
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(match)
    .where(
      and(
        eq(match.competitionId, competitionId),
        eq(match.status, 'live'),
        matchdayFrom != null ? sql`${match.matchday} >= ${matchdayFrom}` : sql`true`,
        matchdayTo != null ? sql`${match.matchday} <= ${matchdayTo}` : sql`true`,
      ),
    )
  return (row?.count ?? 0) > 0
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

  let singleMatch: {
    id: string
    homeTeam: string
    awayTeam: string
    homeFlag: string
    awayFlag: string
    kickoffAt: string
    stage: string | null
    matchday: number | null
  } | null = null
  if (poolData.matchId) {
    const [m] = await db
      .select({
        id: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeFlag: match.homeFlag,
        awayFlag: match.awayFlag,
        matchDate: match.matchDate,
        stage: match.stage,
        matchday: match.matchday,
      })
      .from(match)
      .where(eq(match.id, poolData.matchId))
      .limit(1)
    if (m) {
      singleMatch = {
        id: m.id,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        homeFlag: m.homeFlag ?? '',
        awayFlag: m.awayFlag ?? '',
        kickoffAt: m.matchDate.toISOString(),
        stage: m.stage ?? null,
        matchday: m.matchday,
      }
    }
  }

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
    matchId: poolData.matchId,
    singleMatch,
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
