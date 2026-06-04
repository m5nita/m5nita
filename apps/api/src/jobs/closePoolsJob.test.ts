import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockFindAllActive,
  mockGetMemberCount,
  mockGetMembersWithContact,
  mockUpdateStatus,
  mockHasUnfinishedFor,
  mockGetPoolRanking,
  mockNotifyWinners,
} = vi.hoisted(() => ({
  mockFindAllActive: vi.fn(),
  mockGetMemberCount: vi.fn(),
  mockGetMembersWithContact: vi.fn(),
  mockUpdateStatus: vi.fn(),
  mockHasUnfinishedFor: vi.fn(),
  mockGetPoolRanking: vi.fn(),
  mockNotifyWinners: vi.fn(),
}))

vi.mock('../container', () => ({
  getContainer: () => ({
    poolRepo: {
      findAllActive: mockFindAllActive,
      getMemberCount: mockGetMemberCount,
      getMembersWithContact: mockGetMembersWithContact,
      updateStatus: mockUpdateStatus,
    },
    matchRepo: {
      hasUnfinishedFor: mockHasUnfinishedFor,
    },
    rankingRepo: { getPoolRanking: mockGetPoolRanking },
    notificationService: { notifyWinners: mockNotifyWinners },
  }),
}))

import { checkAndClosePools } from './closePoolsJob'

const baseSinglePool = {
  id: 'pool-single',
  name: 'Single Match Pool',
  entryFee: 5000,
  competitionId: 'comp-1',
  matchdayFrom: null,
  matchdayTo: null,
  matchId: 'match-1',
  discountPercent: 0,
}

const baseRangePool = {
  id: 'pool-range',
  name: 'Range Pool',
  entryFee: 5000,
  competitionId: 'comp-1',
  matchdayFrom: 30,
  matchdayTo: 30,
  matchId: null,
  discountPercent: 0,
}

describe('checkAndClosePools — scope branching (FR-012)', () => {
  beforeEach(() => {
    mockGetMemberCount.mockResolvedValue(0)
    mockGetMembersWithContact.mockResolvedValue([])
    mockGetPoolRanking.mockResolvedValue([])
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('single-match: closes the pool when hasUnfinishedFor returns false', async () => {
    mockFindAllActive.mockResolvedValue([baseSinglePool])
    mockHasUnfinishedFor.mockResolvedValue(false)

    await checkAndClosePools()

    expect(mockHasUnfinishedFor).toHaveBeenCalledWith({
      kind: 'single-match',
      matchId: 'match-1',
    })
    expect(mockUpdateStatus).toHaveBeenCalledTimes(1)
    expect(mockUpdateStatus.mock.calls[0]?.[0]).toBe('pool-single')
  })

  it('single-match: keeps the pool open while the match still reports unfinished', async () => {
    mockFindAllActive.mockResolvedValue([baseSinglePool])
    mockHasUnfinishedFor.mockResolvedValue(true)

    await checkAndClosePools()

    expect(mockUpdateStatus).not.toHaveBeenCalled()
  })

  it('range pool: queries hasUnfinishedFor with the range shape', async () => {
    mockFindAllActive.mockResolvedValue([baseRangePool])
    mockHasUnfinishedFor.mockResolvedValue(false)

    await checkAndClosePools()

    expect(mockHasUnfinishedFor).toHaveBeenCalledWith({
      kind: 'range',
      competitionId: 'comp-1',
      matchdayFrom: 30,
      matchdayTo: 30,
    })
    expect(mockUpdateStatus).toHaveBeenCalledTimes(1)
  })
})

describe('checkAndClosePools — winner notification contacts', () => {
  beforeEach(() => {
    mockGetMemberCount.mockResolvedValue(2)
    mockHasUnfinishedFor.mockResolvedValue(false)
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('passes the verified email (and null phone) for a winner without phone', async () => {
    mockFindAllActive.mockResolvedValue([baseSinglePool])
    mockGetPoolRanking.mockResolvedValue([{ userId: 'winner-1', name: 'Maria', position: 1 }])
    mockGetMembersWithContact.mockResolvedValue([
      {
        userId: 'winner-1',
        name: 'Maria',
        phoneNumber: null,
        email: 'maria@example.com',
        emailVerified: true,
      },
    ])

    await checkAndClosePools()

    expect(mockNotifyWinners).toHaveBeenCalledTimes(1)
    const winners = mockNotifyWinners.mock.calls[0]?.[1]
    expect(winners).toEqual([
      expect.objectContaining({
        name: 'Maria',
        phoneNumber: null,
        email: 'maria@example.com',
      }),
    ])
  })

  it('nulls the email when the winner email is not verified', async () => {
    mockFindAllActive.mockResolvedValue([baseSinglePool])
    mockGetPoolRanking.mockResolvedValue([{ userId: 'winner-2', name: 'João', position: 1 }])
    mockGetMembersWithContact.mockResolvedValue([
      {
        userId: 'winner-2',
        name: 'João',
        phoneNumber: '+5511999999999',
        email: 'joao@example.com',
        emailVerified: false,
      },
    ])

    await checkAndClosePools()

    const winners = mockNotifyWinners.mock.calls[0]?.[1]
    expect(winners).toEqual([
      expect.objectContaining({
        name: 'João',
        phoneNumber: '+5511999999999',
        email: null,
      }),
    ])
  })
})
