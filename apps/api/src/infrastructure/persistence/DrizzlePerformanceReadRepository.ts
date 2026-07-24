import { and, eq, ne, sql } from 'drizzle-orm'
import type { DbExecutor } from '../../db/client'
import { coupon } from '../../db/schema/coupon'
import { payment } from '../../db/schema/payment'
import { pool } from '../../db/schema/pool'
import { poolMember } from '../../db/schema/poolMember'
import { prizeWithdrawal } from '../../db/schema/prizeWithdrawal'
import type {
  PerformanceReadRepository,
  UserPoolFact,
} from '../../domain/performance/PerformanceReadRepository.port'

export class DrizzlePerformanceReadRepository implements PerformanceReadRepository {
  constructor(private readonly db: DbExecutor) {}

  // One user-scoped read of every non-cancelled pool the user joined, projecting
  // exactly the primitives the domain needs. memberCount is a correlated count;
  // the entry payment is joined via the membership's paymentId (0 for comp
  // members); settledAt ≈ the close timestamp for decided pools.
  async getUserPoolFacts(userId: string): Promise<UserPoolFact[]> {
    const rows = await this.db
      .select({
        poolId: pool.id,
        name: pool.name,
        status: pool.status,
        entryFeeCentavos: pool.entryFee,
        discountPercent: sql<number>`coalesce(${coupon.discountPercent}, 0)::int`,
        memberCount: sql<number>`(
          SELECT COUNT(*)::int FROM ${poolMember} pm2 WHERE pm2.pool_id = ${pool.id}
        )`,
        entryPaidCentavos: sql<number>`coalesce(${payment.amount}, 0)::int`,
        joinedAt: poolMember.joinedAt,
        settledAt: sql<Date | null>`CASE WHEN ${pool.status} = 'closed' THEN ${pool.updatedAt} ELSE NULL END`,
      })
      .from(poolMember)
      .innerJoin(pool, eq(pool.id, poolMember.poolId))
      .leftJoin(coupon, eq(coupon.id, pool.couponId))
      .leftJoin(
        payment,
        and(
          eq(payment.id, poolMember.paymentId),
          eq(payment.type, 'entry'),
          eq(payment.status, 'completed'),
        ),
      )
      .where(and(eq(poolMember.userId, userId), ne(pool.status, 'cancelled')))

    // The settledAt CASE expression bypasses Drizzle's column mapping, so the
    // driver returns raw timestamp strings — coerce to Date for the domain.
    return rows.map((r) => ({
      ...r,
      joinedAt: new Date(r.joinedAt),
      settledAt: r.settledAt ? new Date(r.settledAt) : null,
    }))
  }

  async getUserWithdrawnPoolIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ poolId: prizeWithdrawal.poolId })
      .from(prizeWithdrawal)
      .where(eq(prizeWithdrawal.userId, userId))
    return rows.map((r) => r.poolId)
  }
}
