import { formatBrl } from '@m5nita/shared'
import type { Bot } from 'grammy'
import type {
  AdminMatchNeedsWinnerNotification,
  AdminWithdrawalRequestNotification,
  MatchPointsData,
  NewPoolData,
  NewPoolRecipient,
  NotificationService,
  ReminderData,
  WinnerInfo,
  WithdrawalPaidData,
} from '../../application/ports/NotificationService.port'
import { NotificationPreferences } from '../../domain/notification/NotificationPreferences'
import type { NotificationPreferencesRepository } from '../../domain/notification/NotificationPreferencesRepository.port'
import type { NotificationTypeCode } from '../../domain/notification/NotificationType'
import {
  sendPredictionReminderEmail,
  sendWinnerEmail,
  sendWithdrawalPaidEmail,
} from '../../lib/resend'
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

function newPoolPushPayload(data: NewPoolData): PushPayload {
  const details = `${data.competitionName} · ${data.scopeLabel} · entrada ${formatBrl(data.entryFee)}`
  return {
    title: 'Novo bolão no m5nita',
    body: `${data.creatorFirstName} criou "${data.poolName}" — ${details}`,
    url: `/invite/${data.inviteCode}`,
    tag: `new-pool-${data.poolId}`,
  }
}

function withdrawalPaidPushPayload(data: WithdrawalPaidData): PushPayload {
  return {
    title: 'Prêmio pago',
    body: `${formatBrl(data.amount)} do bolão ${data.poolName} foi enviado para sua chave PIX`,
    url: `/pools/${data.poolId}`,
    tag: `paid-${data.poolId}`,
  }
}

/**
 * Routes each user-facing notification to exactly ONE channel per user per
 * event, in order Web Push (all the user's devices) → Telegram → email — never
 * duplicating across channels. "Pontos conquistados" is push-only, and the
 * "novo bolão" announcement is push → Telegram with no email fallback.
 * Admin/OTP notifications stay Telegram-only.
 *
 * This is also the single place a notification preference is checked: because
 * every user-facing notification passes through here to reach a channel, the
 * jobs that produce them (reminders, points, pool closing) never need to know
 * preferences exist.
 */
export class CompositeNotificationService implements NotificationService {
  private telegram: TelegramNotificationService

  constructor(
    bot: Bot,
    private readonly webPush: WebPushNotificationService,
    private readonly matchPointsStore: MatchPointsNotifiedStore,
    private readonly preferences: NotificationPreferencesRepository,
  ) {
    this.telegram = new TelegramNotificationService(bot)
  }

  // Shared channel-resolution seam: try Web Push first (all devices). Returns
  // true when push handled the user, so callers skip Telegram/email.
  private tryPush(userId: string, payload: PushPayload): Promise<boolean> {
    return this.webPush.sendToUser(userId, payload)
  }

  // The preference gate. Applied uniformly, including to types that cannot be
  // turned off — the value object guarantees those always resolve to allowed, so
  // locking or unlocking a type needs no change here.
  private async allows(userId: string, code: NotificationTypeCode): Promise<boolean> {
    const [types, overrides] = await Promise.all([
      this.preferences.listTypes(),
      this.preferences.findOverrides(userId),
    ])
    return NotificationPreferences.of(types, overrides).allows(code)
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
      if (!(await this.allows(winner.userId, 'pool_result'))) return
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
      if (!(await this.allows(reminder.userId, 'prediction_reminder'))) return
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
      if (!(await this.allows(item.userId, 'match_points'))) return
      const isNew = await this.matchPointsStore.recordOnce(item.userId, item.poolId, item.matchId)
      if (!isNew) return
      await this.tryPush(item.userId, matchPointsPushPayload(item))
    } catch (error) {
      console.error(`[Notify] Failed match-points push for pool ${item.poolId}:`, error)
    }
  }

  // Push → Telegram, never email, one channel per person. Preferences for the
  // whole audience are read in a single query (the catalog is cached), so the
  // cost of an announcement does not grow with the number of recipients.
  async notifyNewPool(data: NewPoolData): Promise<void> {
    if (data.recipients.length === 0) return
    const [types, overridesByUser] = await Promise.all([
      this.preferences.listTypes(),
      this.preferences.findOverridesForUsers(data.recipients.map((r) => r.userId)),
    ])

    for (const recipient of data.recipients) {
      const prefs = NotificationPreferences.of(types, overridesByUser.get(recipient.userId) ?? {})
      if (!prefs.allows('new_pool')) continue
      await this.deliverNewPool(data, recipient)
    }
  }

  private async deliverNewPool(data: NewPoolData, recipient: NewPoolRecipient): Promise<void> {
    try {
      if (await this.tryPush(recipient.userId, newPoolPushPayload(data))) return
      const chatId = recipient.phoneNumber ? await findChatIdByPhone(recipient.phoneNumber) : null
      if (!chatId) return
      await this.telegram.sendNewPoolMessage(chatId, data)
    } catch (error) {
      // One unreachable recipient must never abort the rest of the announcement.
      console.error(`[Notify] Failed new-pool notice to ${recipient.userId}:`, error)
    }
  }

  // Push → Telegram → e-mail, um canal por pessoa. O tipo é travado no catálogo
  // (opt_outable = false): aviso de dinheiro não pode ser silenciado.
  async notifyWithdrawalPaid(data: WithdrawalPaidData): Promise<void> {
    try {
      if (!(await this.allows(data.userId, 'withdrawal_paid'))) return
      if (await this.tryPush(data.userId, withdrawalPaidPushPayload(data))) return
      const chatId = data.phoneNumber ? await findChatIdByPhone(data.phoneNumber) : null
      if (chatId) {
        await this.telegram.sendWithdrawalPaidMessage(chatId, {
          poolName: data.poolName,
          amount: data.amount,
          pixKey: data.pixKey,
        })
        return
      }
      if (data.email) {
        await sendWithdrawalPaidEmail({
          to: data.email,
          winnerName: data.userName,
          poolName: data.poolName,
          amount: data.amount,
          pixKey: data.pixKey,
        })
      }
    } catch (error) {
      console.error(`[Notify] Failed withdrawal-paid notice for pool ${data.poolId}:`, error)
    }
  }
}
