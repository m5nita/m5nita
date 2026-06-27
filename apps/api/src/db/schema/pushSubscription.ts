import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'

/**
 * One row per browser/device that has enabled Web Push for a user. A user may
 * have many (multi-device). De-duped by `endpoint` (the natural device key);
 * the unique index is the idempotent upsert target. Removed on opt-out or when
 * the push service reports the endpoint as gone (404/410).
 */
export const pushSubscription = pgTable(
  'push_subscription',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('push_subscription_endpoint_idx').on(table.endpoint),
    index('push_subscription_user_id_idx').on(table.userId),
  ],
)
