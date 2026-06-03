import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { payment } from './payment'
import { pool } from './pool'

/**
 * Entitlement: a participant has unlocked statistics for a pool. One-time per
 * (user, pool); the unique index is the idempotent gate (grant uses
 * ON CONFLICT DO NOTHING). References the completed `stats_unlock` payment.
 * Granting NEVER touches poolMember/pool activation/prize.
 */
export const statsUnlock = pgTable(
  'stats_unlock',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    poolId: uuid('pool_id')
      .notNull()
      .references(() => pool.id),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payment.id),
    unlockedAt: timestamp('unlocked_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('stats_unlock_user_id_pool_id_idx').on(table.userId, table.poolId)],
)
