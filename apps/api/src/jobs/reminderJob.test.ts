import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSelect, mockSelectDistinctOn, mockFindAllActive, mockSendPredictionReminders } =
  vi.hoisted(() => ({
    mockSelect: vi.fn(),
    mockSelectDistinctOn: vi.fn(),
    mockFindAllActive: vi.fn(),
    mockSendPredictionReminders: vi.fn(),
  }))

vi.mock('../db/client', () => ({
  db: {
    select: mockSelect,
    selectDistinctOn: mockSelectDistinctOn,
    query: {
      pool: { findMany: vi.fn() },
    },
  },
}))

vi.mock('../container', () => ({
  getContainer: () => ({
    poolRepo: {
      findAllActive: mockFindAllActive,
    },
    notificationService: {
      sendPredictionReminders: mockSendPredictionReminders,
    },
    clock: {
      now: () => new Date(),
    },
  }),
}))

vi.mock('../db/schema/auth', () => ({
  user: {
    id: 'user.id',
    name: 'user.name',
    phoneNumber: 'user.phone_number',
    email: 'user.email',
    emailVerified: 'user.email_verified',
  },
}))
vi.mock('../db/schema/match', () => ({
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
vi.mock('../db/schema/pool', () => ({
  pool: {
    id: 'pool.id',
    status: 'pool.status',
    competitionId: 'pool.competition_id',
    matchdayFrom: 'pool.matchday_from',
    matchdayTo: 'pool.matchday_to',
  },
}))
vi.mock('../db/schema/poolMember', () => ({
  poolMember: { userId: 'pool_member.user_id', poolId: 'pool_member.pool_id' },
}))
vi.mock('../db/schema/prediction', () => ({
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

const testPool = {
  id: 'pool-1',
  name: 'Test Pool',
  entryFee: 1000,
  competitionId: 'comp-1',
  matchdayFrom: null,
  matchdayTo: null,
  discountPercent: 0,
}

const upcomingMatch = {
  id: 'match-1',
  homeTeam: 'Brasil',
  awayTeam: 'Argentina',
  matchDate: new Date('2026-06-15T14:45:00Z'),
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
    mockFindAllActive.mockResolvedValue([testPool])
    mockSelect.mockReturnValue(createChainableMock([]))

    const { sendPredictionReminders } = await import('./reminderJob')
    await sendPredictionReminders()

    expect(mockSendPredictionReminders).not.toHaveBeenCalled()
  })

  it('userWithPrediction_skipsUser', async () => {
    mockFindAllActive.mockResolvedValue([testPool])
    mockSelect.mockReturnValue(createChainableMock([upcomingMatch]))
    mockSelectDistinctOn.mockReturnValue(createDistinctChainableMock([]))

    const { sendPredictionReminders } = await import('./reminderJob')
    await sendPredictionReminders()

    expect(mockSendPredictionReminders).not.toHaveBeenCalled()
  })

  it('userWithoutPrediction_sendsReminderWithContact', async () => {
    mockFindAllActive.mockResolvedValue([testPool])
    mockSelect.mockReturnValue(createChainableMock([upcomingMatch]))
    mockSelectDistinctOn.mockReturnValue(
      createDistinctChainableMock([
        {
          userId: 'user-1',
          name: 'Ana',
          phoneNumber: '+5511999999999',
          email: null,
          emailVerified: false,
        },
      ]),
    )

    const { sendPredictionReminders } = await import('./reminderJob')
    await sendPredictionReminders()

    expect(mockSendPredictionReminders).toHaveBeenCalledOnce()
    expect(mockSendPredictionReminders).toHaveBeenCalledWith([
      expect.objectContaining({
        userName: 'Ana',
        phoneNumber: '+5511999999999',
        email: null,
        poolName: 'Test Pool',
        poolId: 'pool-1',
        matches: [expect.objectContaining({ homeTeam: 'Brasil', awayTeam: 'Argentina' })],
      }),
    ])
  })

  it('verifiedEmailNoPhone_sendsEmailContact', async () => {
    mockFindAllActive.mockResolvedValue([testPool])
    mockSelect.mockReturnValue(createChainableMock([upcomingMatch]))
    mockSelectDistinctOn.mockReturnValue(
      createDistinctChainableMock([
        {
          userId: 'user-2',
          name: 'Bia',
          phoneNumber: null,
          email: 'bia@example.com',
          emailVerified: true,
        },
      ]),
    )

    const { sendPredictionReminders } = await import('./reminderJob')
    await sendPredictionReminders()

    expect(mockSendPredictionReminders).toHaveBeenCalledWith([
      expect.objectContaining({
        phoneNumber: null,
        email: 'bia@example.com',
        poolId: 'pool-1',
      }),
    ])
  })

  it('unverifiedEmail_carriesNullEmail', async () => {
    mockFindAllActive.mockResolvedValue([testPool])
    mockSelect.mockReturnValue(createChainableMock([upcomingMatch]))
    mockSelectDistinctOn.mockReturnValue(
      createDistinctChainableMock([
        {
          userId: 'user-2b',
          name: 'Caio',
          phoneNumber: '+5511777770000',
          email: 'caio@example.com',
          emailVerified: false,
        },
      ]),
    )

    const { sendPredictionReminders } = await import('./reminderJob')
    await sendPredictionReminders()

    expect(mockSendPredictionReminders).toHaveBeenCalledWith([
      expect.objectContaining({ phoneNumber: '+5511777770000', email: null }),
    ])
  })

  it('duplicateReminder_skippedByDedupSet', async () => {
    mockFindAllActive.mockResolvedValue([testPool])
    const matchData = [
      {
        id: 'match-3',
        homeTeam: 'Espanha',
        awayTeam: 'Italia',
        matchDate: new Date('2026-06-15T14:50:00Z'),
      },
    ]
    const userData = [
      {
        userId: 'user-3',
        name: 'Dora',
        phoneNumber: '+5511777777777',
        email: null,
        emailVerified: false,
      },
    ]

    mockSelect.mockReturnValue(createChainableMock(matchData))
    mockSelectDistinctOn.mockReturnValue(createDistinctChainableMock(userData))

    const { sendPredictionReminders } = await import('./reminderJob')

    await sendPredictionReminders()
    expect(mockSendPredictionReminders).toHaveBeenCalledOnce()

    // Reset call count but keep module state (sentReminders Set persists)
    mockSendPredictionReminders.mockClear()
    mockSelect.mockReturnValue(createChainableMock(matchData))
    mockSelectDistinctOn.mockReturnValue(createDistinctChainableMock(userData))

    await sendPredictionReminders()
    expect(mockSendPredictionReminders).not.toHaveBeenCalled()
  })

  it('differentMatch_samePool_sendsNewReminder', async () => {
    mockFindAllActive.mockResolvedValue([testPool])
    const userData = [
      {
        userId: 'user-9',
        name: 'Gus',
        phoneNumber: '+5511955554444',
        email: null,
        emailVerified: false,
      },
    ]

    // First matchday's match enters the window — reminder goes out.
    mockSelect.mockReturnValue(
      createChainableMock([
        {
          id: 'match-A',
          homeTeam: 'A',
          awayTeam: 'B',
          matchDate: new Date('2026-06-15T14:50:00Z'),
        },
      ]),
    )
    mockSelectDistinctOn.mockReturnValue(createDistinctChainableMock(userData))

    const { sendPredictionReminders } = await import('./reminderJob')
    await sendPredictionReminders()
    expect(mockSendPredictionReminders).toHaveBeenCalledOnce()

    // A DIFFERENT match in the SAME pool later enters the window. The user must
    // still be reminded — the old userId:poolId dedup key suppressed every match
    // after the first for the whole process lifetime.
    mockSendPredictionReminders.mockClear()
    mockSelect.mockReturnValue(
      createChainableMock([
        {
          id: 'match-B',
          homeTeam: 'C',
          awayTeam: 'D',
          matchDate: new Date('2026-06-15T14:55:00Z'),
        },
      ]),
    )
    mockSelectDistinctOn.mockReturnValue(createDistinctChainableMock(userData))

    await sendPredictionReminders()
    expect(mockSendPredictionReminders).toHaveBeenCalledOnce()
  })

  it('multipleUsers_sendsAllRemindersToNotificationService', async () => {
    mockFindAllActive.mockResolvedValue([testPool])
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
        {
          userId: 'user-4',
          name: 'Eva',
          phoneNumber: '+5511666666666',
          email: null,
          emailVerified: false,
        },
        {
          userId: 'user-5',
          name: 'Fox',
          phoneNumber: null,
          email: 'fox@example.com',
          emailVerified: true,
        },
      ]),
    )

    const { sendPredictionReminders } = await import('./reminderJob')
    await sendPredictionReminders()

    expect(mockSendPredictionReminders).toHaveBeenCalledOnce()
    expect(mockSendPredictionReminders).toHaveBeenCalledWith([
      expect.objectContaining({ phoneNumber: '+5511666666666', email: null, poolId: 'pool-1' }),
      expect.objectContaining({ phoneNumber: null, email: 'fox@example.com', poolId: 'pool-1' }),
    ])
  })
})
