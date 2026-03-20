import { webhookCallback } from 'grammy'
import { Hono } from 'hono'
import { bot, findChatIdByPhone } from '../lib/telegram'

export const telegramRoutes = new Hono()

telegramRoutes.post('/telegram/check-phone', async (c) => {
  if (process.env.NODE_ENV !== 'production') {
    return c.json({ connected: true })
  }
  const { phoneNumber } = await c.req.json<{ phoneNumber: string }>()
  const chatId = await findChatIdByPhone(phoneNumber)
  return c.json({ connected: chatId !== null })
})

if (process.env.NODE_ENV === 'production') {
  telegramRoutes.post(
    '/telegram/webhook',
    webhookCallback(bot, 'hono', {
      secretToken: process.env.TELEGRAM_WEBHOOK_SECRET,
    }),
  )
}
