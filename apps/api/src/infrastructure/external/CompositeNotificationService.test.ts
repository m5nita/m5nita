import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/telegram', () => ({
  findChatIdByPhone: vi.fn(),
}))

vi.mock('../../lib/resend', () => ({
  sendPredictionReminderEmail: vi.fn(async () => {}),
  sendWinnerEmail: vi.fn(async () => {}),
}))

import type { MatchPointsData } from '../../application/ports/NotificationService.port'
import { sendPredictionReminderEmail, sendWinnerEmail } from '../../lib/resend'
import { findChatIdByPhone } from '../../lib/telegram'
import type { MatchPointsNotifiedStore } from '../persistence/DrizzleMatchPointsNotifiedStore'
import { CompositeNotificationService } from './CompositeNotificationService'
import type { WebPushNotificationService } from './WebPushNotificationService'

const mockFindChatId = findChatIdByPhone as unknown as ReturnType<typeof vi.fn>
const mockReminderEmail = sendPredictionReminderEmail as unknown as ReturnType<typeof vi.fn>
const mockWinnerEmail = sendWinnerEmail as unknown as ReturnType<typeof vi.fn>

function makeBot() {
  return {
    api: { sendMessage: vi.fn(async () => ({})) },
  } as unknown as import('grammy').Bot
}

function telegramCalls(bot: import('grammy').Bot) {
  return (bot.api.sendMessage as unknown as { mock: { calls: unknown[][] } }).mock.calls
}

function makeWebPush() {
  return { sendToUser: vi.fn(async () => false) } as unknown as WebPushNotificationService & {
    sendToUser: ReturnType<typeof vi.fn>
  }
}

function makeStore() {
  return { recordOnce: vi.fn(async () => true) } as unknown as MatchPointsNotifiedStore & {
    recordOnce: ReturnType<typeof vi.fn>
  }
}

function makeService(over?: {
  webPush?: ReturnType<typeof makeWebPush>
  store?: ReturnType<typeof makeStore>
}) {
  const bot = makeBot()
  const webPush = over?.webPush ?? makeWebPush()
  const store = over?.store ?? makeStore()
  return { bot, webPush, store, svc: new CompositeNotificationService(bot, webPush, store) }
}

const matches = [{ homeTeam: 'Brasil', awayTeam: 'Argentina', minutesUntil: 30 }]

function reminder(
  over: Partial<Parameters<CompositeNotificationService['sendPredictionReminders']>[0][number]>,
) {
  return {
    userId: 'user-1',
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
  it('routes to Web Push (and not Telegram/email) when the user has a subscription', async () => {
    const { svc, webPush, bot } = makeService()
    webPush.sendToUser.mockResolvedValue(true)

    await svc.sendPredictionReminders([
      reminder({ phoneNumber: '+5511999999999', email: 'ana@example.com' }),
    ])

    expect(webPush.sendToUser).toHaveBeenCalledOnce()
    expect(mockFindChatId).not.toHaveBeenCalled()
    expect(telegramCalls(bot)).toHaveLength(0)
    expect(mockReminderEmail).not.toHaveBeenCalled()
  })

  it('falls through to Telegram when push does not handle the user', async () => {
    mockFindChatId.mockResolvedValue(123)
    const { svc, bot } = makeService()

    await svc.sendPredictionReminders([
      reminder({ phoneNumber: '+5511999999999', email: 'ana@example.com' }),
    ])

    expect(telegramCalls(bot)).toHaveLength(1)
    expect(telegramCalls(bot)[0]?.[0]).toBe(123)
    expect(mockReminderEmail).not.toHaveBeenCalled()
  })

  it('falls back to email when there is no push and no linked chat', async () => {
    mockFindChatId.mockResolvedValue(null)
    const { svc, bot } = makeService()

    await svc.sendPredictionReminders([
      reminder({ phoneNumber: '+5511888888888', email: 'ana@example.com' }),
    ])

    expect(mockReminderEmail).toHaveBeenCalledOnce()
    expect(mockReminderEmail.mock.calls[0]?.[0]).toMatchObject({ to: 'ana@example.com' })
    expect(telegramCalls(bot)).toHaveLength(0)
  })

  it('skips a recipient with no channel at all', async () => {
    const { svc, bot } = makeService()

    await svc.sendPredictionReminders([reminder({ phoneNumber: null, email: null })])

    expect(telegramCalls(bot)).toHaveLength(0)
    expect(mockReminderEmail).not.toHaveBeenCalled()
  })

  it('isolates a failing recipient and still delivers the rest', async () => {
    mockFindChatId.mockResolvedValueOnce(123)
    const { svc, bot } = makeService()
    ;(bot.api.sendMessage as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('telegram down'),
    )

    await svc.sendPredictionReminders([
      reminder({ phoneNumber: '+5511999999999', email: null }),
      reminder({ phoneNumber: null, email: 'second@example.com' }),
    ])

    expect(mockReminderEmail).toHaveBeenCalledOnce()
    expect(mockReminderEmail.mock.calls[0]?.[0]).toMatchObject({ to: 'second@example.com' })
  })
})

describe('CompositeNotificationService.notifyWinners', () => {
  it('sends Web Push to a subscribed winner and not Telegram/email', async () => {
    const { svc, webPush, bot } = makeService()
    webPush.sendToUser.mockResolvedValue(true)

    await svc.notifyWinners(
      'pool-1',
      'Bolão Copa',
      [{ userId: 'u1', name: 'Winner', phoneNumber: '+5511111111111', email: 'w@example.com' }],
      10000,
    )

    expect(webPush.sendToUser).toHaveBeenCalledOnce()
    expect(telegramCalls(bot)).toHaveLength(0)
    expect(mockWinnerEmail).not.toHaveBeenCalled()
  })

  it('routes each winner without push to Telegram or email', async () => {
    mockFindChatId.mockImplementation(async (phone: string) =>
      phone === '+5511111111111' ? 555 : null,
    )
    const { svc, bot } = makeService()

    await svc.notifyWinners(
      'pool-1',
      'Bolão Copa',
      [
        { userId: 'u1', name: 'Telegram Winner', phoneNumber: '+5511111111111', email: 'tg@x.com' },
        { userId: 'u2', name: 'Email Winner', phoneNumber: null, email: 'email@example.com' },
      ],
      10000,
    )

    expect(telegramCalls(bot)).toHaveLength(1)
    expect(telegramCalls(bot)[0]?.[0]).toBe(555)
    expect(mockWinnerEmail).toHaveBeenCalledOnce()
    expect(mockWinnerEmail.mock.calls[0]?.[0]).toMatchObject({ to: 'email@example.com' })
  })

  it('skips a winner with neither channel without throwing', async () => {
    const { svc, bot } = makeService()

    await expect(
      svc.notifyWinners(
        'pool-1',
        'Bolão',
        [{ userId: 'u1', name: 'Ghost', phoneNumber: null, email: null }],
        10000,
      ),
    ).resolves.toBeUndefined()

    expect(telegramCalls(bot)).toHaveLength(0)
    expect(mockWinnerEmail).not.toHaveBeenCalled()
  })
})

function matchPoints(over?: Partial<MatchPointsData>): MatchPointsData {
  return {
    userId: 'user-1',
    poolId: 'pool-1',
    poolName: 'Bolão',
    matchId: 'match-1',
    homeTeam: 'Brasil',
    awayTeam: 'Argentina',
    homeScore: 2,
    awayScore: 1,
    points: 5,
    position: 2,
    ...over,
  }
}

describe('CompositeNotificationService.notifyMatchPoints', () => {
  it('records dedupe then pushes (push-only) when newly recorded', async () => {
    const { svc, webPush, store, bot } = makeService()
    store.recordOnce.mockResolvedValue(true)

    await svc.notifyMatchPoints([matchPoints()])

    expect(store.recordOnce).toHaveBeenCalledWith('user-1', 'pool-1', 'match-1')
    expect(webPush.sendToUser).toHaveBeenCalledOnce()
    expect(telegramCalls(bot)).toHaveLength(0)
    expect(mockFindChatId).not.toHaveBeenCalled()
    expect(mockReminderEmail).not.toHaveBeenCalled()
    expect(mockWinnerEmail).not.toHaveBeenCalled()
  })

  it('does not push again when already recorded (at-most-once)', async () => {
    const { svc, webPush, store } = makeService()
    store.recordOnce.mockResolvedValue(false)

    await svc.notifyMatchPoints([matchPoints()])

    expect(webPush.sendToUser).not.toHaveBeenCalled()
  })

  it('never falls back to Telegram/email when the user has no subscription', async () => {
    const { svc, webPush, store, bot } = makeService()
    store.recordOnce.mockResolvedValue(true)
    webPush.sendToUser.mockResolvedValue(false)

    await svc.notifyMatchPoints([matchPoints({ userId: 'no-sub' })])

    expect(webPush.sendToUser).toHaveBeenCalledOnce()
    expect(telegramCalls(bot)).toHaveLength(0)
    expect(mockReminderEmail).not.toHaveBeenCalled()
    expect(mockWinnerEmail).not.toHaveBeenCalled()
  })
})

describe('CompositeNotificationService.notifyAdminWithdrawalRequest', () => {
  it('delegates to the Telegram transport (admin-only)', async () => {
    process.env.ADMIN_USER_IDS = '999'
    const { svc, bot } = makeService()

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
