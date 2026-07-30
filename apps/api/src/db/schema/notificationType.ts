import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core'

/**
 * Catalog of every notification the product can send. Seeded by migration, read
 * on every notification (and cached in process, since it changes almost never).
 *
 * It is a table rather than a TypeScript constant so that introducing a new
 * toggle costs one INSERT: no column, no migration, and no front-end change —
 * the settings screen renders whatever rows exist.
 *
 * `optOutable = false` marks a notification the user may not silence (the prize
 * one). The invariant itself lives in the NotificationType value object, not
 * here, so a stale "disabled" row can never suppress it.
 */
export const notificationType = pgTable('notification_type', {
  code: text('code').primaryKey(),
  label: text('label').notNull(),
  description: text('description').notNull(),
  optOutable: boolean('opt_outable').notNull().default(true),
  defaultEnabled: boolean('default_enabled').notNull().default(true),
  sortOrder: integer('sort_order').notNull(),
})
