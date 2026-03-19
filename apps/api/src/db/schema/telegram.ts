import { bigint, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const telegramChat = pgTable(
  'telegram_chat',
  {
    phoneNumber: text('phone_number').primaryKey(),
    chatId: bigint('chat_id', { mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [index('telegram_chat_chat_id_idx').on(table.chatId)],
)
