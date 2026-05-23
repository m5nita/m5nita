import { describe, expect, it } from 'vitest'
import { EntryFee } from '../shared/EntryFee'
import { InviteCode } from '../shared/InviteCode'
import { PoolScope } from '../shared/PoolScope'
import { PoolStatus } from '../shared/PoolStatus'
import { Pool } from './Pool'
import { PoolError } from './PoolError'

function createPool(
  overrides: Partial<{
    id: string
    name: string
    entryFee: EntryFee
    ownerId: string
    inviteCode: InviteCode
    competitionId: string
    scope: PoolScope
    status: PoolStatus
    isOpen: boolean
    couponId: string | null
  }> = {},
): Pool {
  return new Pool(
    overrides.id ?? 'pool-1',
    overrides.name ?? 'Test Pool',
    overrides.entryFee ?? EntryFee.of(5000),
    overrides.ownerId ?? 'owner-1',
    overrides.inviteCode ?? InviteCode.from('ABCD1234'),
    overrides.competitionId ?? 'comp-1',
    overrides.scope ?? PoolScope.wholeCompetition(),
    overrides.status ?? PoolStatus.Active,
    overrides.isOpen ?? true,
    overrides.couponId ?? null,
  )
}

describe('Pool', () => {
  it('activate() changes status to Active', () => {
    const pool = createPool({ status: PoolStatus.Pending })
    pool.activate()
    expect(pool.status).toBe(PoolStatus.Active)
  })

  it('close() on active pool succeeds', () => {
    const pool = createPool({ status: PoolStatus.Active, isOpen: true })
    pool.close()
    expect(pool.status).toBe(PoolStatus.Closed)
    expect(pool.isOpen).toBe(false)
  })

  it('close() on pending pool throws PoolError', () => {
    const pool = createPool({ status: PoolStatus.Pending })
    expect(() => pool.close()).toThrow(PoolError)
    expect(() => pool.close()).toThrow('Pool cannot be closed')
  })

  it('canJoin() returns true when active and open', () => {
    const pool = createPool({ status: PoolStatus.Active, isOpen: true })
    expect(pool.canJoin()).toBe(true)
  })

  it('canJoin() returns false when active but not open', () => {
    const pool = createPool({ status: PoolStatus.Active, isOpen: false })
    expect(pool.canJoin()).toBe(false)
  })

  it('canJoin() returns false when closed', () => {
    const pool = createPool({ status: PoolStatus.Closed, isOpen: false })
    expect(pool.canJoin()).toBe(false)
  })

  it('canAcceptPredictions() returns true when active', () => {
    const pool = createPool({ status: PoolStatus.Active })
    expect(pool.canAcceptPredictions()).toBe(true)
  })

  it('canAcceptPredictions() returns false when closed', () => {
    const pool = createPool({ status: PoolStatus.Closed })
    expect(pool.canAcceptPredictions()).toBe(false)
  })

  it('isOwnedBy() returns true for correct user', () => {
    const pool = createPool({ ownerId: 'owner-1' })
    expect(pool.isOwnedBy('owner-1')).toBe(true)
  })

  it('isOwnedBy() returns false for wrong user', () => {
    const pool = createPool({ ownerId: 'owner-1' })
    expect(pool.isOwnedBy('other-user')).toBe(false)
  })

  it('calculatePrize() computes correctly', () => {
    const pool = createPool({ entryFee: EntryFee.of(5000) })
    const prize = pool.calculatePrize(10, 0.05)
    expect(prize.centavos).toBe(47500)
  })

  it('calculatePlatformFee() computes correctly', () => {
    const pool = createPool({ entryFee: EntryFee.of(5000) })
    const fee = pool.calculatePlatformFee(5)
    expect(fee.centavos).toBe(250)
  })

  it('scope is set at construction and exposed via a readonly field', () => {
    const matchId = '11111111-1111-4111-8111-111111111111'
    const single = createPool({ scope: PoolScope.singleMatch(matchId) })
    expect(single.scope.kind).toBe('single-match')
    expect(single.scope.matchId).toBe(matchId)

    const whole = createPool({ scope: PoolScope.wholeCompetition() })
    expect(whole.scope.kind).toBe('whole-competition')
    // `Pool.scope` is declared `readonly` (compile-time guard). Combined with
    // the lack of a setter method, this is how FR-014's immutability is
    // expressed; runtime reassignment is not blocked by the language.
  })
})
