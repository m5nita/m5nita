import type { Bot } from 'grammy'
import type {
  AdminWithdrawalRequestNotification,
  NotificationService,
  ReminderData,
  WinnerInfo,
} from '../../application/ports/NotificationService.port'
import { sendPredictionReminderEmail, sendWinnerEmail } from '../../lib/resend'
import { findChatIdByPhone } from '../../lib/telegram'
import { TelegramNotificationService } from './TelegramNotificationService'

// Routes each user-facing notification to exactly one channel: Telegram when a chat
// resolves from the phone number, otherwise a verified email, otherwise nothing.
// Admin/OTP notifications stay Telegram-only.
export class CompositeNotificationService implements NotificationService {
  private telegram: TelegramNotificationService

  constructor(bot: Bot) {
    this.telegram = new TelegramNotificationService(bot)
  }

  async notifyWinners(poolName: string, winners: WinnerInfo[], prizeShare: number): Promise<void> {
    for (const winner of winners) {
      try {
        const chatId = winner.phoneNumber ? await findChatIdByPhone(winner.phoneNumber) : null
        if (chatId) {
          await this.telegram.sendWinnerMessage(chatId, {
            poolName,
            winnerName: winner.name,
            prizeShare,
          })
        } else if (winner.email) {
          await sendWinnerEmail({
            to: winner.email,
            winnerName: winner.name,
            poolName,
            prizeShare,
          })
        }
      } catch (error) {
        console.error(`[Notify] Failed to notify winner ${winner.name}:`, error)
      }
    }
  }

  notifyAdminWithdrawalRequest(params: AdminWithdrawalRequestNotification): Promise<void> {
    return this.telegram.notifyAdminWithdrawalRequest(params)
  }

  async sendPredictionReminders(reminders: ReminderData[]): Promise<void> {
    for (const reminder of reminders) {
      try {
        const chatId = reminder.phoneNumber ? await findChatIdByPhone(reminder.phoneNumber) : null
        if (chatId) {
          await this.telegram.sendReminderMessage(chatId, {
            poolName: reminder.poolName,
            poolId: reminder.poolId,
            matches: reminder.matches,
          })
        } else if (reminder.email) {
          await sendPredictionReminderEmail({
            to: reminder.email,
            userName: reminder.userName,
            poolName: reminder.poolName,
            poolId: reminder.poolId,
            matches: reminder.matches,
          })
        }
      } catch (error) {
        console.error(`[Notify] Failed to send reminder for pool ${reminder.poolId}:`, error)
      }
    }
  }
}
