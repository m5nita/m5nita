import { POOL } from '@m5nita/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { db as dbClient } from '../../db/client'
import { pool } from '../../db/schema/pool'
import { poolMember } from '../../db/schema/poolMember'
import type { Pool } from '../../domain/pool/Pool'
import type {
  PoolListItem,
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
    }
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

  async updateStatus(id: string, status: PoolStatus): Promise<void> {
    await this.db
      .update(pool)
      .set({ status: status.value, updatedAt: new Date() })
      .where(eq(pool.id, id))
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

  async findUserPools(userId: string): Promise<PoolListItem[]> {
    const members = await this.db.query.poolMember.findMany({
      where: eq(poolMember.userId, userId),
      with: {
        pool: {
          with: {
            competition: true,
          },
        },
      },
    })

    const visiblePools = members.filter((m) => m.pool.status !== 'cancelled')

    const counts = await Promise.all(visiblePools.map((m) => this.getMemberCount(m.pool.id)))

    return visiblePools.map((m, i) => ({
      id: m.pool.id,
      name: m.pool.name,
      entryFee: m.pool.entryFee,
      status: m.pool.status,
      competitionName: m.pool.competition.name,
      memberCount: counts[i] ?? 0,
      userPosition: null,
      userPoints: 0,
    }))
  }
}
