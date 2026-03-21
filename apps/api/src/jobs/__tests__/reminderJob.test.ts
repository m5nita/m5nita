import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSendMessage, mockFindChatIdByPhone, mockSelect, mockSelectDistinctOn } = vi.hoisted(
  () => ({
    mockSendMessage: vi.fn(),
    mockFindChatIdByPhone: vi.fn(),
    mockSelect: vi.fn(),
    mockSelectDistinctOn: vi.fn(),
  }),
)

vi.mock('../../lib/telegram', () => ({
  bot: { api: { sendMessage: mockSendMessage } },
  findChatIdByPhone: mockFindChatIdByPhone,
}))

vi.mock('../../db/client', () => ({
  db: {
    select: mockSelect,
    selectDistinctOn: mockSelectDistinctOn,
  },
}))

vi.mock('../../db/schema/auth', () => ({
  user: { id: 'user.id', phoneNumber: 'user.phone_number' },
}))
vi.mock('../../db/schema/match', () => ({
  match: {
    id: 'match.id',
    homeTeam: 'match.home_team',
    awayTeam: 'match.away_team',
    matchDate: 'match.match_date',
    status: 'match.status',
  },
}))
vi.mock('../../db/schema/poolMember', () => ({
  poolMember: { userId: 'pool_member.user_id', poolId: 'pool_member.pool_id' },
}))
vi.mock('../../db/schema/prediction', () => ({
  prediction: {
    id: 'prediction.id',
    userId: 'prediction.user_id',
    poolId: 'prediction.pool_id',
    matchId: 'prediction.match_id',
  },
}))

function createChainableMock(result: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
  }
}

function createDistinctChainableMock(result: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  }
}

describe('sendPredictionReminders', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T14:00:00Z'))
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetModules()
  })

  it('noUpcomingMatches_sendsNoReminders', async () => {
    mockSelect.mockReturnValue(createChainableMock([]))

    const { sendPredictionReminders } = await import('../reminderJob')
    await sendPredictionReminders()

    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('userWithPrediction_skipsUser', async () => {
    mockSelect.mockReturnValue(
      createChainableMock([
        {
          id: 'match-1',
          homeTeam: 'Brasil',
          awayTeam: 'Argentina',
          matchDate: new Date('2026-06-15T14:45:00Z'),
        },
      ]),
    )
    mockSelectDistinctOn.mockReturnValue(createDistinctChainableMock([]))

    const { sendPredictionReminders } = await import('../reminderJob')
    await sendPredictionReminders()

    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('userWithoutPrediction_sendsReminder', async () => {
    mockSelect.mockReturnValue(
      createChainableMock([
        {
          id: 'match-1',
          homeTeam: 'Brasil',
          awayTeam: 'Argentina',
          matchDate: new Date('2026-06-15T14:45:00Z'),
        },
      ]),
    )
    mockSelectDistinctOn.mockReturnValue(
      createDistinctChainableMock([{ userId: 'user-1', phoneNumber: '+5511999999999' }]),
    )
    mockFindChatIdByPhone.mockResolvedValue(123456789)
    mockSendMessage.mockResolvedValue(undefined)

    const { sendPredictionReminders } = await import('../reminderJob')
    await sendPredictionReminders()

    expect(mockFindChatIdByPhone).toHaveBeenCalledWith('+5511999999999')
    expect(mockSendMessage).toHaveBeenCalledOnce()
    expect(mockSendMessage).toHaveBeenCalledWith(
      123456789,
      expect.stringContaining('Brasil x Argentina'),
      { parse_mode: 'Markdown' },
    )
  })

  it('userWithNoTelegramChat_skipsWithoutError', async () => {
    mockSelect.mockReturnValue(
      createChainableMock([
        {
          id: 'match-2',
          homeTeam: 'Franca',
          awayTeam: 'Alemanha',
          matchDate: new Date('2026-06-15T14:30:00Z'),
        },
      ]),
    )
    mockSelectDistinctOn.mockReturnValue(
      createDistinctChainableMock([{ userId: 'user-2', phoneNumber: '+5511888888888' }]),
    )
    mockFindChatIdByPhone.mockResolvedValue(null)

    const { sendPredictionReminders } = await import('../reminderJob')
    await sendPredictionReminders()

    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('duplicateReminder_skippedByDedupSet', async () => {
    const matchData = [
      {
        id: 'match-3',
        homeTeam: 'Espanha',
        awayTeam: 'Italia',
        matchDate: new Date('2026-06-15T14:50:00Z'),
      },
    ]
    const userData = [{ userId: 'user-3', phoneNumber: '+5511777777777' }]

    mockSelect.mockReturnValue(createChainableMock(matchData))
    mockSelectDistinctOn.mockReturnValue(createDistinctChainableMock(userData))
    mockFindChatIdByPhone.mockResolvedValue(111222333)
    mockSendMessage.mockResolvedValue(undefined)

    const { sendPredictionReminders } = await import('../reminderJob')

    await sendPredictionReminders()
    expect(mockSendMessage).toHaveBeenCalledOnce()

    // Reset call count but keep module state (sentReminders Set persists)
    mockSendMessage.mockClear()
    mockSelect.mockReturnValue(createChainableMock(matchData))
    mockSelectDistinctOn.mockReturnValue(createDistinctChainableMock(userData))

    await sendPredictionReminders()
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('telegramApiFailure_continuesProcessing', async () => {
    mockSelect.mockReturnValue(
      createChainableMock([
        {
          id: 'match-4',
          homeTeam: 'Portugal',
          awayTeam: 'Holanda',
          matchDate: new Date('2026-06-15T14:40:00Z'),
        },
      ]),
    )
    mockSelectDistinctOn.mockReturnValue(
      createDistinctChainableMock([
        { userId: 'user-4', phoneNumber: '+5511666666666' },
        { userId: 'user-5', phoneNumber: '+5511555555555' },
      ]),
    )
    mockFindChatIdByPhone.mockResolvedValueOnce(444555666).mockResolvedValueOnce(777888999)
    mockSendMessage.mockRejectedValueOnce(new Error('Telegram API error'))
    mockSendMessage.mockResolvedValueOnce(undefined)

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { sendPredictionReminders } = await import('../reminderJob')
    await sendPredictionReminders()

    expect(mockSendMessage).toHaveBeenCalledTimes(2)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Reminder] Failed to send'),
      expect.any(Error),
    )

    consoleSpy.mockRestore()
  })
})
