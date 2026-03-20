import { bigint, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const coupon = pgTable(
  'coupon',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    code: text('code').unique().notNull(),
    discountPercent: integer('discount_percent').notNull(),
    status: text('status').default('active').notNull(),
    maxUses: integer('max_uses'),
    useCount: integer('use_count').default(0).notNull(),
    expiresAt: timestamp('expires_at'),
    createdByTelegramId: bigint('created_by_telegram_id', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('coupon_code_idx').on(table.code)],
)
