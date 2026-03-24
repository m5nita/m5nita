import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { payment } from './payment'
import { pool } from './pool'

export const prizeWithdrawal = pgTable(
  'prize_withdrawal',
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
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payment.id),
    amount: integer('amount').notNull(),
    pixKeyType: text('pix_key_type').notNull(),
    pixKey: text('pix_key').notNull(),
    status: text('status').default('pending').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('prize_withdrawal_pool_user_idx').on(table.poolId, table.userId),
    index('prize_withdrawal_pool_id_idx').on(table.poolId),
  ],
)
