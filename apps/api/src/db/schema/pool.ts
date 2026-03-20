import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { coupon } from './coupon'

export const pool = pgTable(
  'pool',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    entryFee: integer('entry_fee').notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id),
    inviteCode: text('invite_code').unique().notNull(),
    couponId: uuid('coupon_id').references(() => coupon.id),
    isOpen: boolean('is_open').default(true).notNull(),
    status: text('status').default('active').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('pool_owner_id_idx').on(table.ownerId),
    index('pool_coupon_id_idx').on(table.couponId),
  ],
)
