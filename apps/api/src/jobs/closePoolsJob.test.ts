import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockFindAllActive,
  mockGetMemberCount,
  mockGetMembersWithPhone,
  mockUpdateStatus,
  mockMatchFindById,
  mockHasUnfinishedMatches,
  mockGetPoolRanking,
  mockNotifyWinners,
} = vi.hoisted(() => ({
  mockFindAllActive: vi.fn(),
  mockGetMemberCount: vi.fn(),
  mockGetMembersWithPhone: vi.fn(),
  mockUpdateStatus: vi.fn(),
  mockMatchFindById: vi.fn(),
  mockHasUnfinishedMatches: vi.fn(),
  mockGetPoolRanking: vi.fn(),
  mockNotifyWinners: vi.fn(),
}))

vi.mock('../container', () => ({
  getContainer: () => ({
    poolRepo: {
      findAllActive: mockFindAllActive,
      getMemberCount: mockGetMemberCount,
      getMembersWithPhone: mockGetMembersWithPhone,
      updateStatus: mockUpdateStatus,
    },
    matchRepo: {
      findById: mockMatchFindById,
      hasUnfinishedMatches: mockHasUnfinishedMatches,
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
    mockGetMembersWithPhone.mockResolvedValue([])
    mockGetPoolRanking.mockResolvedValue([])
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('single-match: closes the pool when the chosen match is finished (does not consult hasUnfinishedMatches)', async () => {
    mockFindAllActive.mockResolvedValue([baseSinglePool])
    mockMatchFindById.mockResolvedValue({ id: 'match-1', status: 'finished' })

    await checkAndClosePools()

    expect(mockMatchFindById).toHaveBeenCalledWith('match-1')
    expect(mockHasUnfinishedMatches).not.toHaveBeenCalled()
    expect(mockUpdateStatus).toHaveBeenCalledTimes(1)
    expect(mockUpdateStatus.mock.calls[0]?.[0]).toBe('pool-single')
  })

  it('single-match: keeps the pool open while the chosen match is still scheduled', async () => {
    mockFindAllActive.mockResolvedValue([baseSinglePool])
    mockMatchFindById.mockResolvedValue({ id: 'match-1', status: 'scheduled' })

    await checkAndClosePools()

    expect(mockUpdateStatus).not.toHaveBeenCalled()
  })

  it('range pool: still routes through hasUnfinishedMatches (unchanged behavior)', async () => {
    mockFindAllActive.mockResolvedValue([baseRangePool])
    mockHasUnfinishedMatches.mockResolvedValue(false)

    await checkAndClosePools()

    expect(mockHasUnfinishedMatches).toHaveBeenCalledWith('comp-1', 30, 30)
    expect(mockMatchFindById).not.toHaveBeenCalled()
    expect(mockUpdateStatus).toHaveBeenCalledTimes(1)
  })
})
