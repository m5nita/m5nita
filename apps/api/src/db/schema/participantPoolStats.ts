import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { pool } from './pool'

/**
 * Per-participant snapshot of finished-match aggregates for a pool. Recomputed
 * when a match finishes, but ONLY for users who have a `stats_unlock` (a small,
 * bounded set). Holds RAW counts only — the domain (`ParticipantPoolStats`)
 * derives percentages, efficiency, deltas and trend. `points_max_total` is NOT
 * stored: the domain computes it as finished_count * scoringPolicy.maxPoints().
 */
export const participantPoolStats = pgTable(
  'participant_pool_stats',
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
    finishedCount: integer('finished_count').notNull().default(0),
    exactCount: integer('exact_count').notNull().default(0),
    resultCount: integer('result_count').notNull().default(0),
    pointsTotal: integer('points_total').notNull().default(0),
    homeCorrect: integer('home_correct').notNull().default(0),
    homeTotal: integer('home_total').notNull().default(0),
    awayCorrect: integer('away_correct').notNull().default(0),
    awayTotal: integer('away_total').notNull().default(0),
    lowGoalsCorrect: integer('low_goals_correct').notNull().default(0),
    lowGoalsTotal: integer('low_goals_total').notNull().default(0),
    highGoalsCorrect: integer('high_goals_correct').notNull().default(0),
    highGoalsTotal: integer('high_goals_total').notNull().default(0),
    lastPosition: integer('last_position'),
    prevPosition: integer('prev_position'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('participant_pool_stats_pool_id_user_id_idx').on(table.poolId, table.userId),
  ],
)
