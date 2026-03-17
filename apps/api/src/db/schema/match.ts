import { pgTable, text, uuid, integer, timestamp, index } from 'drizzle-orm/pg-core'

export const match = pgTable(
  'match',
  {
    id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    externalId: integer('external_id').unique().notNull(),
    homeTeam: text('home_team').notNull(),
    awayTeam: text('away_team').notNull(),
    homeFlag: text('home_flag'),
    awayFlag: text('away_flag'),
    homeScore: integer('home_score'),
    awayScore: integer('away_score'),
    stage: text('stage').notNull(),
    group: text('match_group'),
    matchday: integer('matchday'),
    matchDate: timestamp('match_date').notNull(),
    status: text('status').default('scheduled').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('match_status_idx').on(table.status),
    index('match_match_date_idx').on(table.matchDate),
  ]
)
