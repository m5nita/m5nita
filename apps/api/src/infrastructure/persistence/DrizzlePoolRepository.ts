import { and, desc, eq, isNull, ne, or, sql } from 'drizzle-orm'
import type { DbExecutor } from '../../db/client'
import { user } from '../../db/schema/auth'
import { competition } from '../../db/schema/competition'
import { match } from '../../db/schema/match'
import { pool } from '../../db/schema/pool'
import { poolMember } from '../../db/schema/poolMember'
import type { Pool } from '../../domain/pool/Pool'
import type {
  ActivePoolInfo,
  MatchScopeInput,
  PoolForMatch,
  PoolListItem,
  PoolListStatusFilter,
  PoolMemberInfo,
  PoolMemberWithContact,
  PoolRepository,
  PoolWithDetails,
} from '../../domain/pool/PoolRepository.port'
import { FeePolicy } from '../../domain/shared/FeePolicy'
import type { PoolStatus } from '../../domain/shared/PoolStatus'
import { type PoolRow, poolToDomain, poolToPersistence } from './mappers/PoolMapper'

type PoolRowWithRelations = PoolRow & {
  owner: { id: string; name: string | null }
  competition: { name: string }
  coupon: { discountPercent: number } | null
}

export class DrizzlePoolRepository implements PoolRepository {
  constructor(private readonly db: DbExecutor) {}

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
      with: { owner: true, coupon: true, competition: true },
    })
    if (!row) return null
    return this.buildPoolWithDetails(row)
  }

  async findByIdWithDetails(id: string): Promise<PoolWithDetails | null> {
    const row = await this.db.query.pool.findFirst({
      where: eq(pool.id, id),
      with: { owner: true, coupon: true, competition: true },
    })
    if (!row) return null
    return this.buildPoolWithDetails(row)
  }

  private async buildPoolWithDetails(row: PoolRowWithRelations): Promise<PoolWithDetails> {
    const [memberCount, hasLiveMatch] = await Promise.all([
      this.getMemberCount(row.id),
      this.hasLiveMatchForPool(row.competitionId, row.matchdayFrom, row.matchdayTo, row.matchId),
    ])
    const poolEntity = poolToDomain(row)
    const feePolicy = FeePolicy.from(row.coupon?.discountPercent ?? null)
    const prizeTotal = poolEntity.prize(memberCount, feePolicy).centavos

    return {
      id: row.id,
      name: row.name,
      entryFee: row.entryFee,
      ownerId: row.ownerId,
      inviteCode: row.inviteCode,
      competitionId: row.competitionId,
      matchdayFrom: row.matchdayFrom,
      matchdayTo: row.matchdayTo,
      matchId: row.matchId,
      status: row.status,
      isOpen: row.isOpen,
      notifyOnCreate: row.notifyOnCreate,
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
    matchId: string | null,
  ): Promise<boolean> {
    // Single-match scope: only the chosen match counts as "live for this pool".
    if (matchId !== null) {
      const [row] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(match)
        .where(and(eq(match.id, matchId), eq(match.status, 'live')))
      return (row?.count ?? 0) > 0
    }
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
      matchId: r.matchId,
      discountPercent: r.coupon?.discountPercent ?? 0,
    }))
  }

  async findActivePoolsForMatch(m: MatchScopeInput): Promise<PoolForMatch[]> {
    // A match belongs to a single-match pool (match_id = m.id) OR a range/whole-
    // competition pool in the same competition whose matchday window contains it.
    // A match with a null matchday only fits a whole-competition pool (both bounds null).
    const inRange =
      m.matchday != null
        ? and(
            sql`(${pool.matchdayFrom} IS NULL OR ${pool.matchdayFrom} <= ${m.matchday})`,
            sql`(${pool.matchdayTo} IS NULL OR ${pool.matchdayTo} >= ${m.matchday})`,
          )
        : and(isNull(pool.matchdayFrom), isNull(pool.matchdayTo))

    return this.db
      .select({ id: pool.id, name: pool.name })
      .from(pool)
      .where(
        and(
          eq(pool.status, 'active'),
          or(
            eq(pool.matchId, m.id),
            and(isNull(pool.matchId), eq(pool.competitionId, m.competitionId), inRange),
          ),
        ),
      )
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

  async addMember(poolId: string, userId: string, paymentId: string): Promise<boolean> {
    const inserted = await this.db
      .insert(poolMember)
      .values({ poolId, userId, paymentId })
      .onConflictDoNothing({ target: [poolMember.poolId, poolMember.userId] })
      .returning({ id: poolMember.id })
    return inserted.length > 0
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

  async getMembersWithContact(poolId: string): Promise<PoolMemberWithContact[]> {
    const rows = await this.db
      .select({
        userId: poolMember.userId,
        name: user.name,
        phoneNumber: user.phoneNumber,
        email: user.email,
        emailVerified: user.emailVerified,
      })
      .from(poolMember)
      .innerJoin(user, eq(user.id, poolMember.userId))
      .where(eq(poolMember.poolId, poolId))
    return rows
  }

  async findUserPools(userId: string, status?: PoolListStatusFilter): Promise<PoolListItem[]> {
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
        WHERE (
          (${pool.matchId} IS NOT NULL AND ${match.id} = ${pool.matchId})
          OR (
            ${pool.matchId} IS NULL
            AND ${match.competitionId} = ${pool.competitionId}
            AND (${pool.matchdayFrom} IS NULL OR ${match.matchday} >= ${pool.matchdayFrom})
            AND (${pool.matchdayTo} IS NULL OR ${match.matchday} <= ${pool.matchdayTo})
          )
        )
      )`,
        lastMatchAt: sql<Date | null>`(
        SELECT MAX(${match.matchDate})
        FROM ${match}
        WHERE (
          (${pool.matchId} IS NOT NULL AND ${match.id} = ${pool.matchId})
          OR (
            ${pool.matchId} IS NULL
            AND ${match.competitionId} = ${pool.competitionId}
            AND (${pool.matchdayFrom} IS NULL OR ${match.matchday} >= ${pool.matchdayFrom})
            AND (${pool.matchdayTo} IS NULL OR ${match.matchday} <= ${pool.matchdayTo})
          )
        )
      )`,
        hasLiveMatch: sql<boolean>`EXISTS (
        SELECT 1 FROM ${match}
        WHERE ${match.status} = 'live'
          AND (
            (${pool.matchId} IS NOT NULL AND ${match.id} = ${pool.matchId})
            OR (
              ${pool.matchId} IS NULL
              AND ${match.competitionId} = ${pool.competitionId}
              AND (${pool.matchdayFrom} IS NULL OR ${match.matchday} >= ${pool.matchdayFrom})
              AND (${pool.matchdayTo} IS NULL OR ${match.matchday} <= ${pool.matchdayTo})
            )
          )
      )`,
      })
      .from(poolMember)
      .innerJoin(pool, eq(pool.id, poolMember.poolId))
      .innerJoin(competition, eq(competition.id, pool.competitionId))
      .where(
        and(
          eq(poolMember.userId, userId),
          // No status arg → all non-cancelled (used by the prize path). A status
          // filter narrows to just active or just closed (dashboard sections).
          status ? eq(pool.status, status) : ne(pool.status, 'cancelled'),
        ),
      )
      .orderBy(
        sql`CASE WHEN ${pool.status} = 'active' THEN 0 ELSE 1 END`,
        sql`CASE WHEN ${pool.status} = 'active' THEN (
        SELECT MIN(${match.matchDate})
        FROM ${match}
        WHERE (
          (${pool.matchId} IS NOT NULL AND ${match.id} = ${pool.matchId})
          OR (
            ${pool.matchId} IS NULL
            AND ${match.competitionId} = ${pool.competitionId}
            AND (${pool.matchdayFrom} IS NULL OR ${match.matchday} >= ${pool.matchdayFrom})
            AND (${pool.matchdayTo} IS NULL OR ${match.matchday} <= ${pool.matchdayTo})
          )
        )
      ) END ASC NULLS LAST`,
        sql`CASE WHEN ${pool.status} = 'closed' THEN (
        SELECT MAX(${match.matchDate})
        FROM ${match}
        WHERE (
          (${pool.matchId} IS NOT NULL AND ${match.id} = ${pool.matchId})
          OR (
            ${pool.matchId} IS NULL
            AND ${match.competitionId} = ${pool.competitionId}
            AND (${pool.matchdayFrom} IS NULL OR ${match.matchday} >= ${pool.matchdayFrom})
            AND (${pool.matchdayTo} IS NULL OR ${match.matchday} <= ${pool.matchdayTo})
          )
        )
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
      nextMatchAt: r.nextMatchAt,
      lastMatchAt: r.lastMatchAt,
      hasLiveMatch: r.hasLiveMatch ?? false,
    }))
  }
}
