import { computePlatformFee } from '@m5nita/shared'
import { describe, expect, it } from 'vitest'

describe('computePlatformFee (shared)', () => {
  it('returns full fee with 0% discount', () => {
    expect(computePlatformFee(5000, 0)).toBe(250)
  })

  it('returns half fee with 50% discount', () => {
    expect(computePlatformFee(5000, 50)).toBe(125)
  })

  it('returns zero with 100% discount', () => {
    expect(computePlatformFee(5000, 100)).toBe(0)
  })

  it('floors fee with non-integer rate result', () => {
    expect(computePlatformFee(1000, 33)).toBe(Math.floor(1000 * 0.05 * (1 - 33 / 100)))
  })

  it('handles large entry fee', () => {
    expect(computePlatformFee(100000, 50)).toBe(2500)
  })
})
