import { boolean, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

export const competition = pgTable(
  'competition',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    season: text('season').notNull(),
    type: text('type').notNull(),
    status: text('status').default('active').notNull(),
    featured: boolean('featured').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    unique('competition_external_id_season_idx').on(table.externalId, table.season),
    index('competition_external_id_idx').on(table.externalId),
    index('competition_status_idx').on(table.status),
  ],
)
