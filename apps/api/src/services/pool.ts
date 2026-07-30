import { and, eq, sql } from 'drizzle-orm'
import { getContainer } from '../container'
import { db } from '../db/client'
import { match } from '../db/schema/match'
import { poolMember } from '../db/schema/poolMember'
import { FeePolicy } from '../domain/shared/FeePolicy'
import { Money } from '../domain/shared/Money'
import { PoolScope } from '../domain/shared/PoolScope'

/**
 * HTTP read helper. Returns a flattened shape consumed by routes. Prize/fee
 * are computed by the `Pool` aggregate inside the repository (read-model).
 */
export async function getPoolById(poolId: string, userId: string) {
  const { poolRepo, statsUnlockRepo } = getContainer()
  // Independent reads — pool detail, membership and this viewer's stats
  // entitlement together, so the availability flag costs no extra round trip.
  const [details, isMember, hasStatsUnlock] = await Promise.all([
    poolRepo.findByIdWithDetails(poolId),
    isPoolMember(poolId, userId),
    statsUnlockRepo.isUnlocked(userId, poolId),
  ])
  if (!details) return null

  const feePolicy = FeePolicy.from(details.coupon?.discountPercent ?? null)
  const entryMoney = Money.of(details.entryFee)
  const platformFee = feePolicy.applyTo(entryMoney).centavos
  const originalPlatformFee = FeePolicy.standard().applyTo(entryMoney).centavos

  return {
    ...details,
    // The invite code lets anyone join; never hand it to a non-member who could
    // be probing pool ids. Members still receive it for sharing.
    inviteCode: isMember ? details.inviteCode : '',
    isMember,
    // Per viewer: the scope decides for everyone, except that whoever already
    // paid for an unlock keeps access on a pool that no longer offers it.
    statsAvailable: PoolScope.fromRow(details).supportsParticipantStats() || hasStatsUnlock,
    discountPercent: details.coupon?.discountPercent ?? 0,
    originalPlatformFee,
    platformFee,
  }
}

export async function poolHasLiveMatch(
  competitionId: string,
  matchdayFrom: number | null,
  matchdayTo: number | null,
  matchId: string | null = null,
): Promise<boolean> {
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
  const { poolRepo } = getContainer()
  const details = await poolRepo.findByInviteCode(inviteCode)
  // Return the pool whenever it exists — even closed/cancelled. The invite route
  // distinguishes "join allowed" via `isOpen` (false once closed) and answers
  // POOL_CLOSED → "Bolão fechado". Returning null here would 404 → "Convite inválido".
  if (!details) return null

  const feePolicy = FeePolicy.from(details.coupon?.discountPercent ?? null)
  const entryMoney = Money.of(details.entryFee)
  const platformFee = feePolicy.applyTo(entryMoney).centavos
  const originalPlatformFee = FeePolicy.standard().applyTo(entryMoney).centavos

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
  if (details.matchId) {
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
      .where(eq(match.id, details.matchId))
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
    id: details.id,
    name: details.name,
    entryFee: details.entryFee,
    platformFee,
    originalPlatformFee,
    discountPercent: details.coupon?.discountPercent ?? 0,
    competitionName: details.competitionName,
    matchdayFrom: details.matchdayFrom,
    matchdayTo: details.matchdayTo,
    matchId: details.matchId,
    singleMatch,
    owner: { name: details.owner.name },
    memberCount: details.memberCount,
    prizeTotal: details.prizeTotal,
    isOpen: details.isOpen,
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
