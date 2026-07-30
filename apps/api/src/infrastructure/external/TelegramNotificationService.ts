import { formatBrl } from '@m5nita/shared'
import type { Bot } from 'grammy'
import type {
  AdminMatchNeedsWinnerNotification,
  AdminWithdrawalRequestNotification,
  ReminderMatch,
} from '../../application/ports/NotificationService.port'
import { MATCH_FINALIZE_CALLBACK_PREFIX, WITHDRAWAL_PAY_CALLBACK_PREFIX } from './telegramCallbacks'

const APP_URL = process.env.APP_URL || ''

function escapeMarkdown(text: string): string {
  return text.replace(/([_*`[\]])/g, '\\$1')
}

// Telegram transport: sends already-routed messages to a resolved chat. Channel
// selection (Telegram vs email) lives in CompositeNotificationService.
export class TelegramNotificationService {
  constructor(private bot: Bot) {}

  async sendWinnerMessage(
    chatId: number,
    params: { poolName: string; winnerName: string | null; prizeShare: number },
  ): Promise<void> {
    const linkLine = APP_URL
      ? `\n\nAcesse para solicitar a retirada:\n${APP_URL}`
      : `\n\nAcesse o app para solicitar a retirada do seu prêmio.`

    if (!APP_URL) {
      console.warn('[Telegram] APP_URL not set — winner message will not include link')
    }

    const message =
      `🏆 *Parabéns, ${escapeMarkdown(params.winnerName || 'Campeão')}!*\n\n` +
      `Você venceu o bolão *${escapeMarkdown(params.poolName)}*!\n` +
      `Seu prêmio: *${formatBrl(params.prizeShare)}*` +
      linkLine

    await this.bot.api.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
    })
  }

  async sendWithdrawalPaidMessage(
    chatId: number,
    params: { poolName: string; amount: number; pixKey: string },
  ): Promise<void> {
    const linkLine = APP_URL ? `\n\n${APP_URL}` : ''

    const message =
      `💸 *Prêmio pago!*\n\n` +
      `${formatBrl(params.amount)} do bolão *${escapeMarkdown(params.poolName)}* ` +
      `foi enviado para a sua chave PIX \`${escapeMarkdown(params.pixKey)}\`.` +
      linkLine

    await this.bot.api.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
    })
  }

  async sendNewPoolMessage(
    chatId: number,
    params: {
      poolName: string
      inviteCode: string
      competitionName: string
      scopeLabel: string
      entryFee: number
      creatorFirstName: string
    },
  ): Promise<void> {
    const linkLine = APP_URL
      ? `\n👉 [Entrar no bolão](${APP_URL}/invite/${params.inviteCode})`
      : '\nAcesse o app para entrar no bolão.'

    const message =
      `🆕 *Novo bolão no m5nita*\n\n` +
      `${escapeMarkdown(params.creatorFirstName)} criou *${escapeMarkdown(params.poolName)}*\n` +
      `${escapeMarkdown(params.competitionName)} · ${escapeMarkdown(params.scopeLabel)}\n` +
      `Entrada: *${formatBrl(params.entryFee)}*\n` +
      linkLine

    await this.bot.api.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
    })
  }

  async sendReminderMessage(
    chatId: number,
    params: { poolName: string; poolId: string; matches: ReminderMatch[] },
  ): Promise<void> {
    const matchLines = params.matches
      .map(
        (m) =>
          `⚽ *${escapeMarkdown(m.homeTeam)} x ${escapeMarkdown(m.awayTeam)}* — em ${m.minutesUntil} min`,
      )
      .join('\n')

    const linkLine = APP_URL
      ? `\n👉 [Fazer palpites](${APP_URL}/pools/${params.poolId}/predictions)`
      : '\nAcesse o app para fazer seus palpites.'

    const message =
      `🎯 *${escapeMarkdown(params.poolName)}*\n\n` +
      `Você ainda não fez palpite para:\n\n` +
      `${matchLines}\n` +
      linkLine

    await this.bot.api.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
    })
  }

  async notifyAdminWithdrawalRequest(params: AdminWithdrawalRequestNotification): Promise<void> {
    const adminIds = (process.env.ADMIN_USER_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
    if (adminIds.length === 0) return

    const formattedAmount = formatBrl(params.amount)

    const message =
      `💸 *Solicitação de retirada*\n\n` +
      `Jogador: *${escapeMarkdown(params.userName)}*\n` +
      `Bolão: *${escapeMarkdown(params.poolName)}*\n` +
      `Código: \`${escapeMarkdown(params.poolCode)}\`\n` +
      `Valor: *${formattedAmount}*\n` +
      `Chave PIX (${escapeMarkdown(params.pixKeyType)}): \`${escapeMarkdown(params.pixKey)}\``

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: '📋 Copiar código', copy_text: { text: params.poolCode } },
          { text: '📋 Copiar chave PIX', copy_text: { text: params.pixKey } },
        ],
        [
          {
            text: '✅ Marcar como pago',
            callback_data: `${WITHDRAWAL_PAY_CALLBACK_PREFIX}${params.withdrawalId}`,
          },
        ],
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

  async notifyAdminMatchNeedsWinner(params: AdminMatchNeedsWinnerNotification): Promise<void> {
    const adminIds = (process.env.ADMIN_USER_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
    if (adminIds.length === 0) return

    const pens =
      params.penaltyHomeScore != null && params.penaltyAwayScore != null
        ? ` (pênaltis ${params.penaltyHomeScore}-${params.penaltyAwayScore})`
        : ''
    const message =
      `⚠️ *Partida sem vencedor*\n\n` +
      `*${escapeMarkdown(params.homeTeam)}* ${params.homeScore ?? 0} x ${params.awayScore ?? 0} *${escapeMarkdown(params.awayTeam)}*${pens}\n` +
      `Etapa: ${escapeMarkdown(params.stage)}\n\n` +
      `Defina o vencedor para finalizar e pontuar:`

    const prefix = MATCH_FINALIZE_CALLBACK_PREFIX
    const replyMarkup = {
      inline_keyboard: [
        [
          { text: `🏠 ${params.homeTeam}`, callback_data: `${prefix}${params.matchId}:home` },
          { text: `✈️ ${params.awayTeam}`, callback_data: `${prefix}${params.matchId}:away` },
        ],
        [{ text: '🤝 Empate', callback_data: `${prefix}${params.matchId}:draw` }],
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
}
