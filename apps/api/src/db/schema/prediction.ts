import { pgTable, text, uuid, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { pool } from './pool'
import { match } from './match'

export const prediction = pgTable(
  'prediction',
  {
    id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    poolId: uuid('pool_id')
      .notNull()
      .references(() => pool.id),
    matchId: uuid('match_id')
      .notNull()
      .references(() => match.id),
    homeScore: integer('home_score').notNull(),
    awayScore: integer('away_score').notNull(),
    points: integer('points'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('prediction_user_id_pool_id_match_id_idx').on(table.userId, table.poolId, table.matchId),
    index('prediction_pool_id_user_id_idx').on(table.poolId, table.userId),
    index('prediction_match_id_idx').on(table.matchId),
  ]
)
