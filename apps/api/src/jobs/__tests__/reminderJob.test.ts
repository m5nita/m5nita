import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockSendMessage,
  mockFindChatIdByPhone,
  mockSelect,
  mockSelectDistinctOn,
  mockFindAllActive,
  mockSendPredictionReminders,
} = vi.hoisted(() => ({
  mockSendMessage: vi.fn(),
  mockFindChatIdByPhone: vi.fn(),
  mockSelect: vi.fn(),
  mockSelectDistinctOn: vi.fn(),
  mockFindAllActive: vi.fn(),
  mockSendPredictionReminders: vi.fn(),
}))

vi.mock('../../lib/telegram', () => ({
  bot: { api: { sendMessage: mockSendMessage } },
  findChatIdByPhone: mockFindChatIdByPhone,
}))

vi.mock('../../db/client', () => ({
  db: {
    select: mockSelect,
    selectDistinctOn: mockSelectDistinctOn,
    query: {
      pool: { findMany: vi.fn() },
    },
  },
}))

vi.mock('../../container', () => ({
  getContainer: () => ({
    poolRepo: {
      findAllActive: mockFindAllActive,
    },
    notificationService: {
      sendPredictionReminders: mockSendPredictionReminders,
    },
  }),
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
    competitionId: 'match.competition_id',
    matchday: 'match.matchday',
  },
}))
vi.mock('../../db/schema/pool', () => ({
  pool: {
    id: 'pool.id',
    status: 'pool.status',
    competitionId: 'pool.competition_id',
    matchdayFrom: 'pool.matchday_from',
    matchdayTo: 'pool.matchday_to',
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
    mockSendPredictionReminders.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetModules()
  })

  it('noUpcomingMatches_sendsNoReminders', async () => {
    mockFindAllActive.mockResolvedValue([
      {
        id: 'pool-1',
        name: 'Test Pool',
        entryFee: 1000,
        competitionId: 'comp-1',
        matchdayFrom: null,
        matchdayTo: null,
        discountPercent: 0,
      },
    ])
    mockSelect.mockReturnValue(createChainableMock([]))

    const { sendPredictionReminders } = await import('../reminderJob')
    await sendPredictionReminders()

    expect(mockSendPredictionReminders).not.toHaveBeenCalled()
  })

  it('userWithPrediction_skipsUser', async () => {
    mockFindAllActive.mockResolvedValue([
      {
        id: 'pool-1',
        name: 'Test Pool',
        entryFee: 1000,
        competitionId: 'comp-1',
        matchdayFrom: null,
        matchdayTo: null,
        discountPercent: 0,
      },
    ])
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

    expect(mockSendPredictionReminders).not.toHaveBeenCalled()
  })

  it('userWithoutPrediction_sendsReminder', async () => {
    mockFindAllActive.mockResolvedValue([
      {
        id: 'pool-1',
        name: 'Test Pool',
        entryFee: 1000,
        competitionId: 'comp-1',
        matchdayFrom: null,
        matchdayTo: null,
        discountPercent: 0,
      },
    ])
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

    const { sendPredictionReminders } = await import('../reminderJob')
    await sendPredictionReminders()

    expect(mockFindChatIdByPhone).toHaveBeenCalledWith('+5511999999999')
    expect(mockSendPredictionReminders).toHaveBeenCalledOnce()
    expect(mockSendPredictionReminders).toHaveBeenCalledWith([
      expect.objectContaining({
        chatId: 123456789,
        poolName: 'Test Pool',
        poolId: 'pool-1',
        matches: [expect.objectContaining({ homeTeam: 'Brasil', awayTeam: 'Argentina' })],
      }),
    ])
  })

  it('userWithNoTelegramChat_skipsWithoutError', async () => {
    mockFindAllActive.mockResolvedValue([
      {
        id: 'pool-1',
        name: 'Test Pool',
        entryFee: 1000,
        competitionId: 'comp-1',
        matchdayFrom: null,
        matchdayTo: null,
        discountPercent: 0,
      },
    ])
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

    expect(mockSendPredictionReminders).not.toHaveBeenCalled()
  })

  it('duplicateReminder_skippedByDedupSet', async () => {
    mockFindAllActive.mockResolvedValue([
      {
        id: 'pool-1',
        name: 'Test Pool',
        entryFee: 1000,
        competitionId: 'comp-1',
        matchdayFrom: null,
        matchdayTo: null,
        discountPercent: 0,
      },
    ])
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

    const { sendPredictionReminders } = await import('../reminderJob')

    await sendPredictionReminders()
    expect(mockSendPredictionReminders).toHaveBeenCalledOnce()

    // Reset call count but keep module state (sentReminders Set persists)
    mockSendPredictionReminders.mockClear()
    mockSelect.mockReturnValue(createChainableMock(matchData))
    mockSelectDistinctOn.mockReturnValue(createDistinctChainableMock(userData))

    await sendPredictionReminders()
    expect(mockSendPredictionReminders).not.toHaveBeenCalled()
  })

  it('multipleUsers_sendsAllRemindersToNotificationService', async () => {
    mockFindAllActive.mockResolvedValue([
      {
        id: 'pool-1',
        name: 'Test Pool',
        entryFee: 1000,
        competitionId: 'comp-1',
        matchdayFrom: null,
        matchdayTo: null,
        discountPercent: 0,
      },
    ])
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

    const { sendPredictionReminders } = await import('../reminderJob')
    await sendPredictionReminders()

    expect(mockSendPredictionReminders).toHaveBeenCalledOnce()
    expect(mockSendPredictionReminders).toHaveBeenCalledWith([
      expect.objectContaining({ chatId: 444555666, poolId: 'pool-1' }),
      expect.objectContaining({ chatId: 777888999, poolId: 'pool-1' }),
    ])
  })
})
