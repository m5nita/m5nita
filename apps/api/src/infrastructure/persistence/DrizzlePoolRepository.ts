import { POOL } from '@m5nita/shared'
import { and, desc, eq, ne, sql } from 'drizzle-orm'
import type { db as dbClient } from '../../db/client'
import { user } from '../../db/schema/auth'
import { competition } from '../../db/schema/competition'
import { match } from '../../db/schema/match'
import { pool } from '../../db/schema/pool'
import { poolMember } from '../../db/schema/poolMember'
import type { Pool } from '../../domain/pool/Pool'
import type {
  ActivePoolInfo,
  PoolListItem,
  PoolMemberInfo,
  PoolMemberWithPhone,
  PoolRepository,
  PoolWithDetails,
} from '../../domain/pool/PoolRepository.port'
import type { PoolStatus } from '../../domain/shared/PoolStatus'
import { poolToDomain, poolToPersistence } from './mappers/PoolMapper'

export class DrizzlePoolRepository implements PoolRepository {
  constructor(private readonly db: typeof dbClient) {}

  async findById(id: string): Promise<Pool | null> {
    const row = await this.db.query.pool.findFirst({
      where: eq(pool.id, id),
    })
    if (!row) return null
    return poolToDomain(row)
  }

  async findByInviteCode(code: string): Promise<PoolWithDetails | null> {
    const row = await this.db.query.pool.findFirst({
      where: eq(pool.inviteCode, code),
      with: {
        owner: true,
        coupon: true,
        competition: true,
      },
    })
    if (!row) return null

    const memberCount = await this.getMemberCount(row.id)
    const discountPercent = row.coupon?.discountPercent ?? 0
    const effectiveRate =
      discountPercent > 0
        ? POOL.PLATFORM_FEE_RATE * (1 - discountPercent / 100)
        : POOL.PLATFORM_FEE_RATE
    const prizeTotal = Math.floor(row.entryFee * memberCount * (1 - effectiveRate))
    const hasLiveMatch = await this.hasLiveMatchForPool(
      row.competitionId,
      row.matchdayFrom,
      row.matchdayTo,
    )

    return {
      id: row.id,
      name: row.name,
      entryFee: row.entryFee,
      ownerId: row.ownerId,
      inviteCode: row.inviteCode,
      competitionId: row.competitionId,
      matchdayStart: row.matchdayFrom,
      matchdayEnd: row.matchdayTo,
      status: row.status,
      isOpen: row.isOpen,
      couponId: row.couponId,
      owner: { id: row.owner.id, name: row.owner.name ?? '' },
      competitionName: row.competition.name,
      coupon: row.coupon ? { discountPercent: row.coupon.discountPercent } : null,
      memberCount,
      prizeTotal,
      hasLiveMatch,
    }
  }

  async findByIdWithDetails(id: string): Promise<PoolWithDetails | null> {
    const row = await this.db.query.pool.findFirst({
      where: eq(pool.id, id),
      with: {
        owner: true,
        coupon: true,
        competition: true,
      },
    })
    if (!row) return null

    const memberCount = await this.getMemberCount(row.id)
    const discountPercent = row.coupon?.discountPercent ?? 0
    const effectiveRate =
      discountPercent > 0
        ? POOL.PLATFORM_FEE_RATE * (1 - discountPercent / 100)
        : POOL.PLATFORM_FEE_RATE
    const prizeTotal = Math.floor(row.entryFee * memberCount * (1 - effectiveRate))
    const hasLiveMatch = await this.hasLiveMatchForPool(
      row.competitionId,
      row.matchdayFrom,
      row.matchdayTo,
    )

    return {
      id: row.id,
      name: row.name,
      entryFee: row.entryFee,
      ownerId: row.ownerId,
      inviteCode: row.inviteCode,
      competitionId: row.competitionId,
      matchdayStart: row.matchdayFrom,
      matchdayEnd: row.matchdayTo,
      status: row.status,
      isOpen: row.isOpen,
      couponId: row.couponId,
      owner: { id: row.owner.id, name: row.owner.name ?? '' },
      competitionName: row.competition.name,
      coupon: row.coupon ? { discountPercent: row.coupon.discountPercent } : null,
      memberCount,
      prizeTotal,
      hasLiveMatch,
    }
  }

  private async hasLiveMatchForPool(
    competitionId: string,
    matchdayFrom: number | null,
    matchdayTo: number | null,
  ): Promise<boolean> {
    const [row] = await this.db
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

  async findAllActive(): Promise<ActivePoolInfo[]> {
    const rows = await this.db.query.pool.findMany({
      where: eq(pool.status, 'active'),
      with: { coupon: true },
    })
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      entryFee: r.entryFee,
      competitionId: r.competitionId,
      matchdayFrom: r.matchdayFrom,
      matchdayTo: r.matchdayTo,
      discountPercent: r.coupon?.discountPercent ?? 0,
    }))
  }

  async findActiveByCompetition(competitionId: string): Promise<Pool[]> {
    const rows = await this.db.query.pool.findMany({
      where: and(eq(pool.competitionId, competitionId), eq(pool.status, 'active')),
    })
    return rows.map(poolToDomain)
  }

  async save(entity: Pool): Promise<Pool> {
    const [row] = await this.db.insert(pool).values(poolToPersistence(entity)).returning()
    if (!row) throw new Error('Failed to insert pool')
    return poolToDomain(row)
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(pool).where(eq(pool.id, id))
  }

  async updateStatus(id: string, status: PoolStatus): Promise<void> {
    const update: Record<string, unknown> = { status: status.value, updatedAt: new Date() }
    if (status.value === 'closed' || status.value === 'cancelled') {
      update.isOpen = false
    }
    await this.db.update(pool).set(update).where(eq(pool.id, id))
  }

  async getMemberCount(poolId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(poolMember)
      .where(eq(poolMember.poolId, poolId))
    return result?.count ?? 0
  }

  async isMember(poolId: string, userId: string): Promise<boolean> {
    const existing = await this.db.query.poolMember.findFirst({
      where: and(eq(poolMember.poolId, poolId), eq(poolMember.userId, userId)),
    })
    return !!existing
  }

  async addMember(poolId: string, userId: string, paymentId: string): Promise<void> {
    await this.db.insert(poolMember).values({ poolId, userId, paymentId })
  }

  async removeMember(poolId: string, userId: string): Promise<void> {
    await this.db
      .delete(poolMember)
      .where(and(eq(poolMember.poolId, poolId), eq(poolMember.userId, userId)))
  }

  async getMembers(poolId: string): Promise<PoolMemberInfo[]> {
    const rows = await this.db
      .select({ userId: poolMember.userId, name: user.name })
      .from(poolMember)
      .innerJoin(user, eq(user.id, poolMember.userId))
      .where(eq(poolMember.poolId, poolId))
    return rows
  }

  async getMembersWithPhone(poolId: string): Promise<PoolMemberWithPhone[]> {
    const rows = await this.db
      .select({
        userId: poolMember.userId,
        name: user.name,
        phoneNumber: user.phoneNumber,
      })
      .from(poolMember)
      .innerJoin(user, eq(user.id, poolMember.userId))
      .where(eq(poolMember.poolId, poolId))
    return rows
  }

  async findUserPools(userId: string): Promise<PoolListItem[]> {
    const rows = await this.db
      .select({
        id: pool.id,
        name: pool.name,
        entryFee: pool.entryFee,
        status: pool.status,
        competitionName: competition.name,
        memberCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${poolMember} pm_inner
        WHERE pm_inner.pool_id = ${pool.id}
      )`,
        nextMatchAt: sql<Date | null>`(
        SELECT MIN(${match.matchDate})
        FROM ${match}
        WHERE ${match.competitionId} = ${pool.competitionId}
          AND (${pool.matchdayFrom} IS NULL OR ${match.matchday} >= ${pool.matchdayFrom})
          AND (${pool.matchdayTo} IS NULL OR ${match.matchday} <= ${pool.matchdayTo})
      )`,
        lastMatchAt: sql<Date | null>`(
        SELECT MAX(${match.matchDate})
        FROM ${match}
        WHERE ${match.competitionId} = ${pool.competitionId}
          AND (${pool.matchdayFrom} IS NULL OR ${match.matchday} >= ${pool.matchdayFrom})
          AND (${pool.matchdayTo} IS NULL OR ${match.matchday} <= ${pool.matchdayTo})
      )`,
        hasLiveMatch: sql<boolean>`EXISTS (
        SELECT 1 FROM ${match}
        WHERE ${match.competitionId} = ${pool.competitionId}
          AND ${match.status} = 'live'
          AND (${pool.matchdayFrom} IS NULL OR ${match.matchday} >= ${pool.matchdayFrom})
          AND (${pool.matchdayTo} IS NULL OR ${match.matchday} <= ${pool.matchdayTo})
      )`,
      })
      .from(poolMember)
      .innerJoin(pool, eq(pool.id, poolMember.poolId))
      .innerJoin(competition, eq(competition.id, pool.competitionId))
      .where(and(eq(poolMember.userId, userId), ne(pool.status, 'cancelled')))
      .orderBy(
        sql`CASE WHEN ${pool.status} = 'active' THEN 0 ELSE 1 END`,
        sql`CASE WHEN ${pool.status} = 'active' THEN (
        SELECT MIN(${match.matchDate})
        FROM ${match}
        WHERE ${match.competitionId} = ${pool.competitionId}
          AND (${pool.matchdayFrom} IS NULL OR ${match.matchday} >= ${pool.matchdayFrom})
          AND (${pool.matchdayTo} IS NULL OR ${match.matchday} <= ${pool.matchdayTo})
      ) END ASC NULLS LAST`,
        sql`CASE WHEN ${pool.status} = 'closed' THEN (
        SELECT MAX(${match.matchDate})
        FROM ${match}
        WHERE ${match.competitionId} = ${pool.competitionId}
          AND (${pool.matchdayFrom} IS NULL OR ${match.matchday} >= ${pool.matchdayFrom})
          AND (${pool.matchdayTo} IS NULL OR ${match.matchday} <= ${pool.matchdayTo})
      ) END DESC NULLS LAST`,
        desc(pool.createdAt),
      )

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      entryFee: r.entryFee,
      status: r.status,
      competitionName: r.competitionName,
      memberCount: r.memberCount ?? 0,
      userPosition: null,
      userPoints: 0,
      nextMatchAt: r.nextMatchAt,
      lastMatchAt: r.lastMatchAt,
      hasLiveMatch: r.hasLiveMatch ?? false,
    }))
  }
}
