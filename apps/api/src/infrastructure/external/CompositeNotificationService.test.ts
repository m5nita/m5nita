import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/telegram', () => ({
  findChatIdByPhone: vi.fn(),
}))

vi.mock('../../lib/resend', () => ({
  sendPredictionReminderEmail: vi.fn(async () => {}),
  sendWinnerEmail: vi.fn(async () => {}),
  sendWithdrawalPaidEmail: vi.fn(async () => {}),
}))

import { formatBrl } from '@m5nita/shared'
import type { MatchPointsData, NewPoolData } from '../../application/ports/NotificationService.port'
import type { NotificationOverrides } from '../../domain/notification/NotificationPreferences'
import type { NotificationPreferencesRepository } from '../../domain/notification/NotificationPreferencesRepository.port'
import { NotificationType } from '../../domain/notification/NotificationType'
import {
  sendPredictionReminderEmail,
  sendWinnerEmail,
  sendWithdrawalPaidEmail,
} from '../../lib/resend'
import { findChatIdByPhone } from '../../lib/telegram'
import type { MatchPointsNotifiedStore } from '../persistence/DrizzleMatchPointsNotifiedStore'
import { CompositeNotificationService } from './CompositeNotificationService'
import type { WebPushNotificationService } from './WebPushNotificationService'

const mockFindChatId = findChatIdByPhone as unknown as ReturnType<typeof vi.fn>
const mockReminderEmail = sendPredictionReminderEmail as unknown as ReturnType<typeof vi.fn>
const mockWinnerEmail = sendWinnerEmail as unknown as ReturnType<typeof vi.fn>
const mockWithdrawalPaidEmail = sendWithdrawalPaidEmail as unknown as ReturnType<typeof vi.fn>

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

// Mirrors the seeded catalog: everything on by default, pool_result locked.
const CATALOG = [
  { code: 'new_pool', optOutable: true, sortOrder: 1 },
  { code: 'prediction_reminder', optOutable: true, sortOrder: 2 },
  { code: 'match_points', optOutable: true, sortOrder: 3 },
  { code: 'pool_result', optOutable: false, sortOrder: 4 },
  { code: 'withdrawal_paid', optOutable: false, sortOrder: 5 },
].map((t) =>
  NotificationType.of({
    code: t.code,
    label: t.code,
    description: t.code,
    optOutable: t.optOutable,
    defaultEnabled: true,
    sortOrder: t.sortOrder,
  }),
)

function makePreferences(byUser: Record<string, NotificationOverrides> = {}) {
  return {
    listTypes: vi.fn(async () => CATALOG),
    findOverrides: vi.fn(async (userId: string) => byUser[userId] ?? {}),
    findOverridesForUsers: vi.fn(
      async (userIds: string[]) =>
        new Map(
          userIds.filter((id) => byUser[id]).map((id) => [id, byUser[id] as NotificationOverrides]),
        ),
    ),
    upsert: vi.fn(async () => {}),
  } satisfies NotificationPreferencesRepository
}

function makeService(over?: {
  webPush?: ReturnType<typeof makeWebPush>
  store?: ReturnType<typeof makeStore>
  overrides?: Record<string, NotificationOverrides>
}) {
  const bot = makeBot()
  const webPush = over?.webPush ?? makeWebPush()
  const store = over?.store ?? makeStore()
  const preferences = makePreferences(over?.overrides)
  return {
    bot,
    webPush,
    store,
    preferences,
    svc: new CompositeNotificationService(bot, webPush, store, preferences),
  }
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

describe('CompositeNotificationService — preference gate', () => {
  it('sends no reminder on any channel when the user turned reminders off', async () => {
    mockFindChatId.mockResolvedValue(123)
    const { svc, webPush, bot } = makeService({
      overrides: { 'user-1': { prediction_reminder: false } },
    })

    await svc.sendPredictionReminders([
      reminder({ phoneNumber: '+5511999999999', email: 'ana@example.com' }),
    ])

    expect(webPush.sendToUser).not.toHaveBeenCalled()
    expect(telegramCalls(bot)).toHaveLength(0)
    expect(mockReminderEmail).not.toHaveBeenCalled()
  })

  it('still reminds a user who only turned other types off', async () => {
    const { svc, webPush } = makeService({
      overrides: { 'user-1': { new_pool: false, match_points: false } },
    })
    webPush.sendToUser.mockResolvedValue(true)

    await svc.sendPredictionReminders([reminder({})])

    expect(webPush.sendToUser).toHaveBeenCalledOnce()
  })

  it('sends no match-points push when the user turned that type off, without consuming the dedupe', async () => {
    const { svc, webPush, store } = makeService({
      overrides: { 'user-1': { match_points: false } },
    })

    await svc.notifyMatchPoints([matchPoints()])

    expect(webPush.sendToUser).not.toHaveBeenCalled()
    expect(store.recordOnce).not.toHaveBeenCalled()
  })

  it('delivers the prize notification even with a stored disable for it', async () => {
    const { svc, webPush } = makeService({ overrides: { u1: { pool_result: false } } })
    webPush.sendToUser.mockResolvedValue(true)

    await svc.notifyWinners(
      'pool-1',
      'Bolão Copa',
      [{ userId: 'u1', name: 'Winner', phoneNumber: null, email: null }],
      10000,
    )

    expect(webPush.sendToUser).toHaveBeenCalledOnce()
  })
})

function newPool(over?: Partial<NewPoolData>): NewPoolData {
  return {
    poolId: 'pool-9',
    poolName: 'Bolão da firma',
    inviteCode: 'ABC123',
    competitionName: 'Brasileirão Série A',
    scopeLabel: 'Rodadas 5 a 8',
    entryFee: 5000,
    creatorFirstName: 'Igor',
    recipients: [{ userId: 'r1', phoneNumber: '+5511999999999' }],
    ...over,
  }
}

describe('CompositeNotificationService.notifyNewPool', () => {
  it('pushes to a subscribed recipient and never falls back to Telegram or email', async () => {
    const { svc, webPush, bot } = makeService()
    webPush.sendToUser.mockResolvedValue(true)

    await svc.notifyNewPool(newPool())

    expect(webPush.sendToUser).toHaveBeenCalledOnce()
    expect(webPush.sendToUser.mock.calls[0]?.[1]).toMatchObject({
      title: 'Novo bolão no m5nita',
      url: '/invite/ABC123',
      tag: 'new-pool-pool-9',
    })
    expect(mockFindChatId).not.toHaveBeenCalled()
    expect(telegramCalls(bot)).toHaveLength(0)
    expect(mockReminderEmail).not.toHaveBeenCalled()
    expect(mockWinnerEmail).not.toHaveBeenCalled()
  })

  it('names the pool, competition, scope and entry fee in the push body', async () => {
    const { svc, webPush } = makeService()
    webPush.sendToUser.mockResolvedValue(true)

    await svc.notifyNewPool(newPool())

    const body = (webPush.sendToUser.mock.calls[0]?.[1] as { body: string }).body
    expect(body).toContain('Igor')
    expect(body).toContain('Bolão da firma')
    expect(body).toContain('Brasileirão Série A')
    expect(body).toContain('Rodadas 5 a 8')
    expect(body).toContain('R$')
    expect(body).toContain('50,00')
  })

  it('falls through to Telegram when push does not handle the recipient', async () => {
    mockFindChatId.mockResolvedValue(777)
    const { svc, bot } = makeService()

    await svc.notifyNewPool(newPool())

    expect(telegramCalls(bot)).toHaveLength(1)
    expect(telegramCalls(bot)[0]?.[0]).toBe(777)
    expect(mockReminderEmail).not.toHaveBeenCalled()
    expect(mockWinnerEmail).not.toHaveBeenCalled()
  })

  it('skips a recipient with neither push nor a linked chat, sending no email', async () => {
    mockFindChatId.mockResolvedValue(null)
    const { svc, bot } = makeService()

    await svc.notifyNewPool(newPool({ recipients: [{ userId: 'r1', phoneNumber: null }] }))

    expect(mockFindChatId).not.toHaveBeenCalled()
    expect(telegramCalls(bot)).toHaveLength(0)
    expect(mockReminderEmail).not.toHaveBeenCalled()
    expect(mockWinnerEmail).not.toHaveBeenCalled()
  })

  it('skips a recipient who turned new-pool notices off and keeps the others', async () => {
    const { svc, webPush } = makeService({ overrides: { r1: { new_pool: false } } })
    webPush.sendToUser.mockResolvedValue(true)

    await svc.notifyNewPool(
      newPool({
        recipients: [
          { userId: 'r1', phoneNumber: null },
          { userId: 'r2', phoneNumber: null },
        ],
      }),
    )

    expect(webPush.sendToUser).toHaveBeenCalledOnce()
    expect(webPush.sendToUser.mock.calls[0]?.[0]).toBe('r2')
  })

  it('reads the audience preferences in a single batched call', async () => {
    const { svc, preferences } = makeService()

    await svc.notifyNewPool(
      newPool({
        recipients: [
          { userId: 'r1', phoneNumber: null },
          { userId: 'r2', phoneNumber: null },
          { userId: 'r3', phoneNumber: null },
        ],
      }),
    )

    expect(preferences.findOverridesForUsers).toHaveBeenCalledOnce()
    expect(preferences.findOverrides).not.toHaveBeenCalled()
  })

  it('isolates a failing recipient and still notifies the rest', async () => {
    const { svc, webPush } = makeService()
    webPush.sendToUser
      .mockRejectedValueOnce(new Error('push service down'))
      .mockResolvedValueOnce(true)

    await expect(
      svc.notifyNewPool(
        newPool({
          recipients: [
            { userId: 'r1', phoneNumber: null },
            { userId: 'r2', phoneNumber: null },
          ],
        }),
      ),
    ).resolves.toBeUndefined()

    expect(webPush.sendToUser).toHaveBeenCalledTimes(2)
  })

  it('does nothing at all for an empty audience', async () => {
    const { svc, webPush, preferences } = makeService()

    await svc.notifyNewPool(newPool({ recipients: [] }))

    expect(webPush.sendToUser).not.toHaveBeenCalled()
    expect(preferences.findOverridesForUsers).not.toHaveBeenCalled()
  })
})

describe('notifyWithdrawalPaid', () => {
  const DATA = {
    userId: 'user-1',
    userName: 'Igor',
    phoneNumber: '+5511999999999',
    email: 'igor@test.local',
    poolId: 'pool-1',
    poolName: 'Bolão Um',
    amount: 14000,
    pixKey: '*******8909',
  }

  it('delivers via push and stops there', async () => {
    const bot = makeBot()
    const webPush = makeWebPush()
    webPush.sendToUser.mockResolvedValue(true)
    const service = new CompositeNotificationService(bot, webPush, makeStore(), makePreferences())

    await service.notifyWithdrawalPaid(DATA)

    expect(webPush.sendToUser).toHaveBeenCalledWith('user-1', {
      title: 'Prêmio pago',
      body: `${formatBrl(14000)} do bolão Bolão Um foi enviado para sua chave PIX`,
      url: '/pools/pool-1',
      tag: 'paid-pool-1',
    })
    expect(telegramCalls(bot)).toHaveLength(0)
    expect(mockWithdrawalPaidEmail).not.toHaveBeenCalled()
  })

  it('falls back to Telegram when push does not deliver', async () => {
    const bot = makeBot()
    mockFindChatId.mockResolvedValue(4242)
    const service = new CompositeNotificationService(
      bot,
      makeWebPush(),
      makeStore(),
      makePreferences(),
    )

    await service.notifyWithdrawalPaid(DATA)

    const calls = telegramCalls(bot)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.[0]).toBe(4242)
    expect(String(calls[0]?.[1])).toContain(formatBrl(14000))
    expect(mockWithdrawalPaidEmail).not.toHaveBeenCalled()
  })

  it('falls back to email when there is no push and no chat', async () => {
    const bot = makeBot()
    mockFindChatId.mockResolvedValue(null)
    const service = new CompositeNotificationService(
      bot,
      makeWebPush(),
      makeStore(),
      makePreferences(),
    )

    await service.notifyWithdrawalPaid(DATA)

    expect(telegramCalls(bot)).toHaveLength(0)
    expect(mockWithdrawalPaidEmail).toHaveBeenCalledWith({
      to: 'igor@test.local',
      winnerName: 'Igor',
      poolName: 'Bolão Um',
      amount: 14000,
      pixKey: '*******8909',
    })
  })

  it('cannot be silenced — a stored opt-out on a locked type is ignored', async () => {
    const bot = makeBot()
    mockFindChatId.mockResolvedValue(4242)
    const service = new CompositeNotificationService(
      bot,
      makeWebPush(),
      makeStore(),
      makePreferences({ 'user-1': { withdrawal_paid: false } }),
    )

    await service.notifyWithdrawalPaid(DATA)

    expect(telegramCalls(bot)).toHaveLength(1)
  })

  it('sends only the masked key it was given', async () => {
    const bot = makeBot()
    mockFindChatId.mockResolvedValue(4242)
    const service = new CompositeNotificationService(
      bot,
      makeWebPush(),
      makeStore(),
      makePreferences(),
    )

    await service.notifyWithdrawalPaid(DATA)

    expect(String(telegramCalls(bot)[0]?.[1])).not.toContain('12345678909')
  })
})
