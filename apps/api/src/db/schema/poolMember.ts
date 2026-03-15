import { pgTable, text, uuid, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { pool } from './pool'
import { payment } from './payment'

export const poolMember = pgTable(
  'pool_member',
  {
    id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    poolId: uuid('pool_id')
      .notNull()
      .references(() => pool.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payment.id),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('pool_member_pool_id_user_id_idx').on(table.poolId, table.userId),
    index('pool_member_user_id_idx').on(table.userId),
  ]
)
