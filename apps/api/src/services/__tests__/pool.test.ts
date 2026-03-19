import { POOL } from '@m5nita/shared'
import { describe, expect, it } from 'vitest'

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
