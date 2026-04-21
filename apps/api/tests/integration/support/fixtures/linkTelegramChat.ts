import type postgres from 'postgres'

let chatIdSeq = 100_000_000

/**
 * Inserts a telegram_chat row so findChatIdByPhone(phone) resolves to a
 * known chat id. Integration tests for Telegram-delivering jobs need this
 * because the real helpers look up the chat from the database.
 */
export async function linkTelegramChat(
  sql: ReturnType<typeof postgres>,
  phoneNumber: string,
  chatId?: number,
): Promise<number> {
  const resolved = chatId ?? ++chatIdSeq
  await sql`
    INSERT INTO "telegram_chat" (phone_number, chat_id)
    VALUES (${phoneNumber}, ${resolved})
    ON CONFLICT (phone_number) DO UPDATE SET chat_id = EXCLUDED.chat_id
  `
  return resolved
}
