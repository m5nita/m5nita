import type { Bot } from 'grammy'
import type {
  NotificationService,
  ReminderData,
  WinnerInfo,
} from '../../application/ports/NotificationService.port'
import { findChatIdByPhone } from '../../lib/telegram'

const APP_URL = process.env.APP_URL || ''

export class TelegramNotificationService implements NotificationService {
  constructor(private bot: Bot) {}

  async notifyWinners(poolName: string, winners: WinnerInfo[], prizeShare: number): Promise<void> {
    const formattedPrize = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(prizeShare / 100)

    for (const winner of winners) {
      if (!winner.phoneNumber) continue

      try {
        const chatId = await findChatIdByPhone(winner.phoneNumber)
        if (!chatId) continue

        const message =
          `🏆 *Parabéns, ${winner.name || 'Campeão'}!*\n\n` +
          `Você venceu o bolão *${poolName}*!\n` +
          `Seu prêmio: *${formattedPrize}*\n\n` +
          `Acesse o app para solicitar a retirada do seu prêmio.`

        await this.bot.api.sendMessage(chatId, message, {
          parse_mode: 'Markdown',
        })
      } catch (error) {
        console.error(`[Telegram] Failed to notify winner ${winner.name}:`, error)
      }
    }
  }

  async notifyAdminWithdrawalRequest(params: {
    userName: string
    poolName: string
    poolCode: string
    withdrawalId: string
    amount: number
    pixKeyType: string
    pixKey: string
  }): Promise<void> {
    const adminIds = (process.env.ADMIN_USER_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
    if (adminIds.length === 0) return

    const formattedAmount = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(params.amount / 100)

    const message =
      `💸 *Solicitação de retirada*\n\n` +
      `Jogador: *${params.userName}*\n` +
      `Bolão: *${params.poolName}*\n` +
      `Código: \`${params.poolCode}\`\n` +
      `Valor: *${formattedAmount}*\n` +
      `Chave PIX (${params.pixKeyType}): \`${params.pixKey}\``

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: '📋 Copiar código', copy_text: { text: params.poolCode } },
          { text: '📋 Copiar chave PIX', copy_text: { text: params.pixKey } },
        ],
        [{ text: '✅ Marcar como pago', callback_data: `wd:pay:${params.withdrawalId}` }],
      ],
    }

    for (const adminId of adminIds) {
      try {
        await this.bot.api.sendMessage(Number(adminId), message, {
          parse_mode: 'Markdown',
          reply_markup: replyMarkup,
        })
      } catch (error) {
        console.error(`[Telegram] Failed to notify admin ${adminId}:`, error)
      }
    }
  }

  async sendPredictionReminders(reminders: ReminderData[]): Promise<void> {
    for (const reminder of reminders) {
      const matchLines = reminder.matches
        .map((m) => `⚽ *${m.homeTeam} x ${m.awayTeam}* — em ${m.minutesUntil} min`)
        .join('\n')

      const linkLine = APP_URL
        ? `\n👉 [Fazer palpites](${APP_URL}/pools/${reminder.poolId}/predictions)`
        : '\nAcesse o app para fazer seus palpites.'

      const message =
        `🎯 *${reminder.poolName}*\n\n` +
        `Você ainda não fez palpite para:\n\n` +
        `${matchLines}\n` +
        linkLine

      try {
        await this.bot.api.sendMessage(reminder.chatId, message, {
          parse_mode: 'Markdown',
        })
      } catch (error) {
        console.error(`[Telegram] Failed to send reminder to chatId ${reminder.chatId}:`, error)
      }
    }
  }
}
