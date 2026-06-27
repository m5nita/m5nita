import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { match } from './match'
import { pool } from './pool'

/**
 * Durable at-most-once marker for the "pontos conquistados" push. One row per
 * (user, pool, match); the unique index is the idempotent gate (record uses
 * ON CONFLICT DO NOTHING — a fresh insert means "send", a conflict means
 * "already notified"). Survives restarts and live-sync re-runs.
 */
export const matchPointsNotified = pgTable(
  'match_points_notified',
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
    matchId: uuid('match_id')
      .notNull()
      .references(() => match.id),
    notifiedAt: timestamp('notified_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('match_points_notified_user_pool_match_idx').on(
      table.userId,
      table.poolId,
      table.matchId,
    ),
  ],
)
