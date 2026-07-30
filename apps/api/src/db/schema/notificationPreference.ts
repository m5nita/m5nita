import { boolean, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { notificationType } from './notificationType'

/**
 * Stores only what a user changed. No row means "use the catalog default", which
 * is why the 58 existing users needed no backfill and why flipping a default is
 * a single catalog edit.
 *
 * The composite primary key (user_id, type_code) is both the upsert conflict
 * target and the index the two read paths need: one user (PK prefix) and a whole
 * broadcast (`user_id = any(...)`). No secondary index is warranted.
 */
export const notificationPreference = pgTable(
  'notification_preference',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    typeCode: text('type_code')
      .notNull()
      .references(() => notificationType.code),
    enabled: boolean('enabled').notNull(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'notification_preference_pkey',
      columns: [table.userId, table.typeCode],
    }),
  ],
)
