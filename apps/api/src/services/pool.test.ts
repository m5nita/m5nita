import { POOL } from '@m5nita/shared'
import { describe, expect, it, vi } from 'vitest'

const { findFirstSpy } = vi.hoisted(() => ({
  findFirstSpy: vi.fn(async () => null as unknown),
}))

vi.mock('../db/client', () => ({
  db: {
    query: { poolMember: { findFirst: findFirstSpy } },
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(() => []) })) })),
    })),
  },
}))

const mockFindByIdWithDetails = vi.fn()
const mockFindByInviteCode = vi.fn()
const mockIsUnlocked = vi.fn(async (_userId: string, _poolId: string) => false)
vi.mock('../container', () => ({
  getContainer: () => ({
    poolRepo: {
      findByIdWithDetails: mockFindByIdWithDetails,
      findByInviteCode: mockFindByInviteCode,
    },
    statsUnlockRepo: { isUnlocked: mockIsUnlocked },
  }),
}))

const { getPoolById, getPoolByInviteCode } = await import('./pool')

// pool.match_id is a uuid column — fixtures must look like real rows.
const MATCH_UUID = '11111111-1111-4111-8111-111111111111'

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
      repoFixture({ matchdayFrom: null, matchdayTo: null, matchId: MATCH_UUID }),
    )
    const result = await getPoolById('pool-1', 'user-1')
    expect(result?.matchdayFrom).toBeNull()
    expect(result?.matchdayTo).toBeNull()
    expect(result?.matchId).toBe(MATCH_UUID)
  })

  it('hides the inviteCode from non-members (prevents self-joining a private pool)', async () => {
    findFirstSpy.mockResolvedValueOnce(null) // not a member
    mockFindByIdWithDetails.mockResolvedValueOnce(repoFixture())
    const result = await getPoolById('pool-1', 'outsider')
    expect(result?.isMember).toBe(false)
    expect(result?.inviteCode).toBe('')
  })

  it('returns the inviteCode to members (so they can share)', async () => {
    findFirstSpy.mockResolvedValueOnce({ poolId: 'pool-1', userId: 'user-1' })
    mockFindByIdWithDetails.mockResolvedValueOnce(repoFixture())
    const result = await getPoolById('pool-1', 'user-1')
    expect(result?.isMember).toBe(true)
    expect(result?.inviteCode).toBe('ABCD1234')
  })
})

describe('getPoolById — statsAvailable', () => {
  it('is true for a whole-competition pool', async () => {
    mockFindByIdWithDetails.mockResolvedValueOnce(
      repoFixture({ matchdayFrom: null, matchdayTo: null, matchId: null }),
    )
    const result = await getPoolById('pool-1', 'user-1')
    expect(result?.statsAvailable).toBe(true)
  })

  it('is false for a matchday-range pool the viewer has not unlocked', async () => {
    mockIsUnlocked.mockResolvedValueOnce(false)
    mockFindByIdWithDetails.mockResolvedValueOnce(repoFixture({ matchdayFrom: 5, matchdayTo: 8 }))
    const result = await getPoolById('pool-1', 'user-1')
    expect(result?.statsAvailable).toBe(false)
  })

  it('stays true for a matchday-range pool the viewer already paid to unlock', async () => {
    mockIsUnlocked.mockResolvedValueOnce(true)
    mockFindByIdWithDetails.mockResolvedValueOnce(repoFixture({ matchdayFrom: 5, matchdayTo: 8 }))
    const result = await getPoolById('pool-1', 'user-1')
    expect(result?.statsAvailable).toBe(true)
  })

  it('is false for a single-match pool', async () => {
    mockIsUnlocked.mockResolvedValueOnce(false)
    mockFindByIdWithDetails.mockResolvedValueOnce(
      repoFixture({ matchdayFrom: null, matchdayTo: null, matchId: MATCH_UUID }),
    )
    const result = await getPoolById('pool-1', 'user-1')
    expect(result?.statsAvailable).toBe(false)
  })

  it('asks the entitlement for (userId, poolId) in that order', async () => {
    mockFindByIdWithDetails.mockResolvedValueOnce(repoFixture())
    await getPoolById('pool-1', 'user-1')
    expect(mockIsUnlocked).toHaveBeenCalledWith('user-1', 'pool-1')
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

  it('returns a closed single-match pool (isOpen=false) instead of null so the invite route can answer POOL_CLOSED, not 404', async () => {
    // A single-match pool flips to status='closed' (isOpen=false) once its match
    // finishes. Opening the invite must show "Bolão fechado", not "Convite inválido".
    mockFindByInviteCode.mockResolvedValueOnce(
      repoFixture({
        status: 'closed',
        isOpen: false,
        matchId: MATCH_UUID,
        matchdayFrom: null,
        matchdayTo: null,
      }),
    )
    const result = await getPoolByInviteCode('ABCD1234')
    expect(result).not.toBeNull()
    expect(result?.isOpen).toBe(false)
  })

  it('returns null only when the invite code matches no pool at all', async () => {
    mockFindByInviteCode.mockResolvedValueOnce(null)
    const result = await getPoolByInviteCode('UNKNOWN1')
    expect(result).toBeNull()
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

  it('validates_minEntryFee_100centavos', () => {
    expect(99 >= POOL.MIN_ENTRY_FEE).toBe(false)
    expect(100 >= POOL.MIN_ENTRY_FEE).toBe(true)
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
