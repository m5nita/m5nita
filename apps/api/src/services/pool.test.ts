import { POOL } from '@m5nita/shared'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../db/client', () => ({
  db: {
    query: { poolMember: { findFirst: vi.fn(async () => null) } },
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(() => []) })) })),
    })),
  },
}))

const mockFindByIdWithDetails = vi.fn()
const mockFindByInviteCode = vi.fn()
vi.mock('../container', () => ({
  getContainer: () => ({
    poolRepo: {
      findByIdWithDetails: mockFindByIdWithDetails,
      findByInviteCode: mockFindByInviteCode,
    },
  }),
}))

const { getPoolById, getPoolByInviteCode } = await import('./pool')

function repoFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'pool-1',
    name: '18ª Rodada',
    entryFee: 800,
    ownerId: 'owner-1',
    inviteCode: 'ABCD1234',
    competitionId: 'comp-1',
    matchdayFrom: 18,
    matchdayTo: 18,
    matchId: null,
    status: 'active',
    isOpen: true,
    couponId: null,
    owner: { id: 'owner-1', name: 'João Paulo' },
    competitionName: 'Brasileirão',
    coupon: null,
    memberCount: 4,
    prizeTotal: 3040,
    hasLiveMatch: false,
    ...overrides,
  }
}

describe('getPoolById HTTP contract', () => {
  it('exposes matchdayFrom/matchdayTo (front filters predictions by these fields)', async () => {
    mockFindByIdWithDetails.mockResolvedValueOnce(repoFixture())
    const result = await getPoolById('pool-1', 'user-1')
    expect(result).not.toBeNull()
    // Regression guard: every layer (DB, port, PoolDetail contract, front filter)
    // names these matchdayFrom/To. A previous rename to matchdayStart/End in the
    // repo type silently dropped them from the response and broke the predictions
    // page (all matchdays rendered).
    expect(result?.matchdayFrom).toBe(18)
    expect(result?.matchdayTo).toBe(18)
  })

  it('returns null matchdayFrom/To for single-match pools (no range)', async () => {
    mockFindByIdWithDetails.mockResolvedValueOnce(
      repoFixture({ matchdayFrom: null, matchdayTo: null, matchId: 'match-1' }),
    )
    const result = await getPoolById('pool-1', 'user-1')
    expect(result?.matchdayFrom).toBeNull()
    expect(result?.matchdayTo).toBeNull()
    expect(result?.matchId).toBe('match-1')
  })
})

describe('getPoolByInviteCode HTTP contract', () => {
  it('exposes matchdayFrom/matchdayTo (invite landing reads these to display "Rodadas X a Y")', async () => {
    mockFindByInviteCode.mockResolvedValueOnce(repoFixture())
    const result = await getPoolByInviteCode('ABCD1234')
    expect(result).not.toBeNull()
    expect(result?.matchdayFrom).toBe(18)
    expect(result?.matchdayTo).toBe(18)
  })
})

// Unit tests for pool business logic (pure functions)
describe('Pool validation rules', () => {
  it('validates_minNameLength_3chars', () => {
    expect('AB'.length >= POOL.MIN_NAME_LENGTH).toBe(false)
    expect('ABC'.length >= POOL.MIN_NAME_LENGTH).toBe(true)
  })

  it('validates_maxNameLength_50chars', () => {
    expect('A'.repeat(50).length <= POOL.MAX_NAME_LENGTH).toBe(true)
    expect('A'.repeat(51).length <= POOL.MAX_NAME_LENGTH).toBe(false)
  })

  it('validates_minEntryFee_500centavos', () => {
    expect(499 >= POOL.MIN_ENTRY_FEE).toBe(false)
    expect(500 >= POOL.MIN_ENTRY_FEE).toBe(true)
  })

  it('validates_maxEntryFee_100000centavos', () => {
    expect(100000 <= POOL.MAX_ENTRY_FEE).toBe(true)
    expect(100001 <= POOL.MAX_ENTRY_FEE).toBe(false)
  })

  it('calculates_platformFee_5percent', () => {
    const fee = Math.floor(5000 * POOL.PLATFORM_FEE_RATE)
    expect(fee).toBe(250)
  })

  it('calculates_platformFee_roundsDown', () => {
    const fee = Math.floor(1000 * POOL.PLATFORM_FEE_RATE)
    expect(fee).toBe(50)
  })

  it('generates_inviteCode_correctLength', () => {
    expect(POOL.INVITE_CODE_LENGTH).toBe(8)
  })

  it('quickSelectValues_withinRange', () => {
    for (const value of POOL.QUICK_SELECT_VALUES) {
      expect(value).toBeGreaterThanOrEqual(POOL.MIN_ENTRY_FEE)
      expect(value).toBeLessThanOrEqual(POOL.MAX_ENTRY_FEE)
    }
  })
})
