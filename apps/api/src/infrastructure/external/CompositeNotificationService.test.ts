import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/telegram', () => ({
  findChatIdByPhone: vi.fn(),
}))

vi.mock('../../lib/resend', () => ({
  sendPredictionReminderEmail: vi.fn(async () => {}),
  sendWinnerEmail: vi.fn(async () => {}),
}))

import { sendPredictionReminderEmail, sendWinnerEmail } from '../../lib/resend'
import { findChatIdByPhone } from '../../lib/telegram'
import { CompositeNotificationService } from './CompositeNotificationService'

const mockFindChatId = findChatIdByPhone as unknown as ReturnType<typeof vi.fn>
const mockReminderEmail = sendPredictionReminderEmail as unknown as ReturnType<typeof vi.fn>
const mockWinnerEmail = sendWinnerEmail as unknown as ReturnType<typeof vi.fn>

function makeBot() {
  return {
    api: {
      sendMessage: vi.fn(async () => ({})),
    },
  } as unknown as import('grammy').Bot
}

function telegramCalls(bot: import('grammy').Bot) {
  return (bot.api.sendMessage as unknown as { mock: { calls: unknown[][] } }).mock.calls
}

const matches = [{ homeTeam: 'Brasil', awayTeam: 'Argentina', minutesUntil: 30 }]

function reminder(
  over: Partial<Parameters<CompositeNotificationService['sendPredictionReminders']>[0][number]>,
) {
  return {
    userName: 'Ana',
    phoneNumber: null,
    email: null,
    poolName: 'Bolão',
    poolId: 'pool-1',
    matches,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CompositeNotificationService.sendPredictionReminders', () => {
  it('routes to Telegram (not email) when a chat resolves from the phone', async () => {
    mockFindChatId.mockResolvedValue(123)
    const bot = makeBot()
    const svc = new CompositeNotificationService(bot)

    await svc.sendPredictionReminders([
      reminder({ phoneNumber: '+5511999999999', email: 'ana@example.com' }),
    ])

    expect(telegramCalls(bot)).toHaveLength(1)
    expect(telegramCalls(bot)[0]?.[0]).toBe(123)
    expect(mockReminderEmail).not.toHaveBeenCalled()
  })

  it('falls back to email when the phone has no linked chat', async () => {
    mockFindChatId.mockResolvedValue(null)
    const bot = makeBot()
    const svc = new CompositeNotificationService(bot)

    await svc.sendPredictionReminders([
      reminder({ phoneNumber: '+5511888888888', email: 'ana@example.com' }),
    ])

    expect(mockReminderEmail).toHaveBeenCalledOnce()
    expect(mockReminderEmail.mock.calls[0]?.[0]).toMatchObject({ to: 'ana@example.com' })
    expect(telegramCalls(bot)).toHaveLength(0)
  })

  it('sends email when there is no phone at all', async () => {
    const bot = makeBot()
    const svc = new CompositeNotificationService(bot)

    await svc.sendPredictionReminders([reminder({ phoneNumber: null, email: 'fox@example.com' })])

    expect(mockFindChatId).not.toHaveBeenCalled()
    expect(mockReminderEmail).toHaveBeenCalledOnce()
  })

  it('skips a recipient with neither channel', async () => {
    const bot = makeBot()
    const svc = new CompositeNotificationService(bot)

    await svc.sendPredictionReminders([reminder({ phoneNumber: null, email: null })])

    expect(telegramCalls(bot)).toHaveLength(0)
    expect(mockReminderEmail).not.toHaveBeenCalled()
  })

  it('isolates a failing recipient and still delivers the rest', async () => {
    mockFindChatId.mockResolvedValueOnce(123)
    const bot = makeBot()
    ;(bot.api.sendMessage as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('telegram down'),
    )
    const svc = new CompositeNotificationService(bot)

    await svc.sendPredictionReminders([
      reminder({ phoneNumber: '+5511999999999', email: null }),
      reminder({ phoneNumber: null, email: 'second@example.com' }),
    ])

    expect(mockReminderEmail).toHaveBeenCalledOnce()
    expect(mockReminderEmail.mock.calls[0]?.[0]).toMatchObject({ to: 'second@example.com' })
  })
})

describe('CompositeNotificationService.notifyWinners', () => {
  it('routes each winner to its own channel (Telegram or email)', async () => {
    mockFindChatId.mockImplementation(async (phone: string) =>
      phone === '+5511111111111' ? 555 : null,
    )
    const bot = makeBot()
    const svc = new CompositeNotificationService(bot)

    await svc.notifyWinners(
      'Bolão Copa',
      [
        { name: 'Telegram Winner', phoneNumber: '+5511111111111', email: 'tg@example.com' },
        { name: 'Email Winner', phoneNumber: null, email: 'email@example.com' },
      ],
      10000,
    )

    expect(telegramCalls(bot)).toHaveLength(1)
    expect(telegramCalls(bot)[0]?.[0]).toBe(555)
    expect(mockWinnerEmail).toHaveBeenCalledOnce()
    expect(mockWinnerEmail.mock.calls[0]?.[0]).toMatchObject({ to: 'email@example.com' })
  })

  it('skips a winner with neither channel without throwing', async () => {
    const bot = makeBot()
    const svc = new CompositeNotificationService(bot)

    await expect(
      svc.notifyWinners('Bolão', [{ name: 'Ghost', phoneNumber: null, email: null }], 10000),
    ).resolves.toBeUndefined()

    expect(telegramCalls(bot)).toHaveLength(0)
    expect(mockWinnerEmail).not.toHaveBeenCalled()
  })
})

describe('CompositeNotificationService.notifyAdminWithdrawalRequest', () => {
  it('delegates to the Telegram transport (admin-only)', async () => {
    process.env.ADMIN_USER_IDS = '999'
    const bot = makeBot()
    const svc = new CompositeNotificationService(bot)

    await svc.notifyAdminWithdrawalRequest({
      userName: 'Ana',
      poolName: 'Bolão',
      poolCode: 'ABC123',
      withdrawalId: 'wd-1',
      amount: 5000,
      pixKeyType: 'cpf',
      pixKey: '12345678900',
    })

    expect(telegramCalls(bot)).toHaveLength(1)
    expect(telegramCalls(bot)[0]?.[0]).toBe(999)
    expect(mockWinnerEmail).not.toHaveBeenCalled()
  })
})
