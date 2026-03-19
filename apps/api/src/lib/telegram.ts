import { eq } from 'drizzle-orm'
import { Bot } from 'grammy'
import { db } from '../db/client'
import { telegramChat } from '../db/schema/telegram'

export const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || '')

bot.command('start', async (ctx) => {
  await ctx.reply('Bem-vindo ao M5nita! Compartilhe seu número para receber códigos de login.', {
    reply_markup: {
      keyboard: [[{ text: 'Compartilhar telefone', request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  })
})

bot.on('message:contact', async (ctx) => {
  const contact = ctx.message.contact
  const chatId = ctx.from.id
  const phone = contact.phone_number.startsWith('+')
    ? contact.phone_number
    : `+${contact.phone_number}`

  await db
    .insert(telegramChat)
    .values({
      phoneNumber: phone,
      chatId: BigInt(chatId),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: telegramChat.phoneNumber,
      set: {
        chatId: BigInt(chatId),
        updatedAt: new Date(),
      },
    })

  await ctx.reply('Pronto! Agora você pode fazer login no M5nita.', {
    reply_markup: { remove_keyboard: true },
  })
})

export async function sendOtpViaTelegram(chatId: bigint, code: string): Promise<void> {
  try {
    await bot.api.sendMessage(Number(chatId), `Seu código M5nita: ${code}`)
  } catch (error) {
    console.error('[Telegram] Failed to send OTP:', error)
    throw new Error('Falha ao enviar código. Tente novamente.')
  }
}

export async function findChatIdByPhone(phone: string): Promise<bigint | null> {
  const result = await db
    .select({ chatId: telegramChat.chatId })
    .from(telegramChat)
    .where(eq(telegramChat.phoneNumber, phone))
    .limit(1)

  return result[0]?.chatId ?? null
}
