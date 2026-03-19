import { webhookCallback } from 'grammy'
import { Hono } from 'hono'
import { bot } from '../lib/telegram'

export const telegramRoutes = new Hono()

telegramRoutes.post(
  '/telegram/webhook',
  webhookCallback(bot, 'hono', {
    secretToken: process.env.TELEGRAM_WEBHOOK_SECRET,
  }),
)
