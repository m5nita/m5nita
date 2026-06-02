import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { pool } from './pool'

/**
 * Denormalized per-member standings (finished-match totals). Recomputed when a
 * match finishes, so the ranking read scans ~N(member) precomputed rows instead
 * of re-aggregating every prediction in the pool on each request. Live points
 * are never stored here — they are derived fresh on the screen path.
 */
export const poolStanding = pgTable(
  'pool_standing',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    poolId: uuid('pool_id')
      .notNull()
      .references(() => pool.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    pointsTotal: integer('points_total').notNull().default(0),
    exactMatches: integer('exact_matches').notNull().default(0),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('pool_standing_pool_id_user_id_idx').on(table.poolId, table.userId)],
)
