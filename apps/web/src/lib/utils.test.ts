import { describe, expect, it } from 'vitest'
import { calculateDiscountedFee, calculatePlatformFee } from './utils'

describe('calculateDiscountedFee', () => {
  it('returns_fullFee_when0percentDiscount', () => {
    const fee = calculateDiscountedFee(5000, 0)
    expect(fee).toBe(calculatePlatformFee(5000))
  })

  it('returns_halfFee_when50percentDiscount', () => {
    const fee = calculateDiscountedFee(5000, 50)
    expect(fee).toBe(125)
  })

  it('returns_zero_when100percentDiscount', () => {
    const fee = calculateDiscountedFee(5000, 100)
    expect(fee).toBe(0)
  })

  it('roundsDown_withMathFloor', () => {
    const fee = calculateDiscountedFee(1000, 33)
    expect(fee).toBe(Math.floor(1000 * 0.05 * (1 - 33 / 100)))
  })

  it('handles_largeEntryFee', () => {
    const fee = calculateDiscountedFee(100000, 50)
    expect(fee).toBe(2500)
  })
})
