import type { Bot } from 'grammy'
import type {
  AdminMatchNeedsWinnerNotification,
  AdminWithdrawalRequestNotification,
  MatchPointsData,
  NotificationService,
  ReminderData,
  WinnerInfo,
} from '../../application/ports/NotificationService.port'
import { sendPredictionReminderEmail, sendWinnerEmail } from '../../lib/resend'
import { findChatIdByPhone } from '../../lib/telegram'
import type { MatchPointsNotifiedStore } from '../persistence/DrizzleMatchPointsNotifiedStore'
import { TelegramNotificationService } from './TelegramNotificationService'
import type { PushPayload, WebPushNotificationService } from './WebPushNotificationService'

// Push-first copy builders (emoji-free pt-BR). Deep-link URLs are relative; the
// service worker resolves them against the web origin on notificationclick.
function reminderPushPayload(reminder: ReminderData): PushPayload {
  const first = reminder.matches[0]
  const body =
    reminder.matches.length === 1 && first
      ? `Falta seu palpite para ${first.homeTeam} x ${first.awayTeam}`
      : `Você tem ${reminder.matches.length} palpites pendentes`
  return {
    title: reminder.poolName,
    body,
    url: `/pools/${reminder.poolId}/predictions`,
    tag: `reminder-${reminder.poolId}`,
  }
}

function winnerPushPayload(poolId: string, poolName: string): PushPayload {
  return {
    title: 'Você venceu',
    body: `Você ficou em primeiro no bolão ${poolName}`,
    url: `/pools/${poolId}`,
    tag: `winner-${poolId}`,
  }
}

function matchPointsPushPayload(item: MatchPointsData): PushPayload {
  const unit = item.points === 1 ? 'ponto' : 'pontos'
  const scoreline =
    item.homeScore != null && item.awayScore != null
      ? `${item.homeTeam} ${item.homeScore} x ${item.awayScore} ${item.awayTeam}`
      : `${item.homeTeam} x ${item.awayTeam}`
  return {
    title: item.poolName,
    body: `Você fez ${item.points} ${unit} em ${scoreline} — agora na ${item.position}ª posição`,
    url: `/pools/${item.poolId}`,
    tag: `points-${item.poolId}-${item.matchId}`,
  }
}

/**
 * Routes each user-facing notification to exactly ONE channel per user per
 * event, in order Web Push (all the user's devices) → Telegram → email — never
 * duplicating across channels. "Pontos conquistados" is push-only. Admin/OTP
 * notifications stay Telegram-only.
 */
export class CompositeNotificationService implements NotificationService {
  private telegram: TelegramNotificationService

  constructor(
    bot: Bot,
    private readonly webPush: WebPushNotificationService,
    private readonly matchPointsStore: MatchPointsNotifiedStore,
  ) {
    this.telegram = new TelegramNotificationService(bot)
  }

  // Shared channel-resolution seam: try Web Push first (all devices). Returns
  // true when push handled the user, so callers skip Telegram/email.
  private tryPush(userId: string, payload: PushPayload): Promise<boolean> {
    return this.webPush.sendToUser(userId, payload)
  }

  async notifyWinners(
    poolId: string,
    poolName: string,
    winners: WinnerInfo[],
    prizeShare: number,
  ): Promise<void> {
    for (const winner of winners) {
      await this.deliverWinner(poolId, poolName, winner, prizeShare)
    }
  }

  private async deliverWinner(
    poolId: string,
    poolName: string,
    winner: WinnerInfo,
    prizeShare: number,
  ): Promise<void> {
    try {
      if (await this.tryPush(winner.userId, winnerPushPayload(poolId, poolName))) return
      const chatId = winner.phoneNumber ? await findChatIdByPhone(winner.phoneNumber) : null
      if (chatId) {
        await this.telegram.sendWinnerMessage(chatId, {
          poolName,
          winnerName: winner.name,
          prizeShare,
        })
        return
      }
      if (winner.email) {
        await sendWinnerEmail({ to: winner.email, winnerName: winner.name, poolName, prizeShare })
      }
    } catch (error) {
      console.error(`[Notify] Failed to notify winner ${winner.name}:`, error)
    }
  }

  notifyAdminWithdrawalRequest(params: AdminWithdrawalRequestNotification): Promise<void> {
    return this.telegram.notifyAdminWithdrawalRequest(params)
  }

  notifyAdminMatchNeedsWinner(params: AdminMatchNeedsWinnerNotification): Promise<void> {
    return this.telegram.notifyAdminMatchNeedsWinner(params)
  }

  async sendPredictionReminders(reminders: ReminderData[]): Promise<void> {
    for (const reminder of reminders) {
      await this.deliverReminder(reminder)
    }
  }

  private async deliverReminder(reminder: ReminderData): Promise<void> {
    try {
      if (await this.tryPush(reminder.userId, reminderPushPayload(reminder))) return
      const chatId = reminder.phoneNumber ? await findChatIdByPhone(reminder.phoneNumber) : null
      if (chatId) {
        await this.telegram.sendReminderMessage(chatId, {
          poolName: reminder.poolName,
          poolId: reminder.poolId,
          matches: reminder.matches,
        })
        return
      }
      if (reminder.email) {
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

  async notifyMatchPoints(items: MatchPointsData[]): Promise<void> {
    for (const item of items) {
      await this.deliverMatchPoints(item)
    }
  }

  // Push-only (FR-016) and at-most-once per (user, pool, match) (FR-017): record
  // first; only a fresh record sends. No Telegram/email fallback.
  private async deliverMatchPoints(item: MatchPointsData): Promise<void> {
    try {
      const isNew = await this.matchPointsStore.recordOnce(item.userId, item.poolId, item.matchId)
      if (!isNew) return
      await this.tryPush(item.userId, matchPointsPushPayload(item))
    } catch (error) {
      console.error(`[Notify] Failed match-points push for pool ${item.poolId}:`, error)
    }
  }
}
