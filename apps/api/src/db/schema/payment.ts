import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { pool } from './pool'

export const payment = pgTable(
  'payment',
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
    amount: integer('amount').notNull(),
    platformFee: integer('platform_fee').notNull(),
    externalPaymentId: text('external_payment_id').unique(),
    status: text('status').default('pending').notNull(),
    type: text('type').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('payment_user_id_pool_id_idx').on(table.userId, table.poolId)],
)
