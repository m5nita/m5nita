import { COUPON, POOL } from '@m5nita/shared'
import { describe, expect, it } from 'vitest'

function getEffectiveFeeRate(discountPercent: number): number {
  return POOL.PLATFORM_FEE_RATE * (1 - discountPercent / 100)
}

describe('Coupon validation rules', () => {
  it('validates_minCodeLength_2chars', () => {
    expect('A'.length >= COUPON.MIN_CODE_LENGTH).toBe(false)
    expect('AB'.length >= COUPON.MIN_CODE_LENGTH).toBe(true)
  })

  it('validates_maxCodeLength_20chars', () => {
    expect('A'.repeat(20).length <= COUPON.MAX_CODE_LENGTH).toBe(true)
    expect('A'.repeat(21).length <= COUPON.MAX_CODE_LENGTH).toBe(false)
  })

  it('validates_codeRegex_alphanumericOnly', () => {
    expect(COUPON.CODE_REGEX.test('COPA2026')).toBe(true)
    expect(COUPON.CODE_REGEX.test('ABC123')).toBe(true)
    expect(COUPON.CODE_REGEX.test('abc')).toBe(false)
    expect(COUPON.CODE_REGEX.test('COPA 2026')).toBe(false)
    expect(COUPON.CODE_REGEX.test('COPA-2026')).toBe(false)
    expect(COUPON.CODE_REGEX.test('')).toBe(false)
  })

  it('validates_discountRange_1to100', () => {
    expect(0 >= COUPON.MIN_DISCOUNT).toBe(false)
    expect(1 >= COUPON.MIN_DISCOUNT).toBe(true)
    expect(100 <= COUPON.MAX_DISCOUNT).toBe(true)
    expect(101 <= COUPON.MAX_DISCOUNT).toBe(false)
  })
})

describe('getEffectiveFeeRate', () => {
  it('calculates_noDiscount_fullRate', () => {
    const rate = getEffectiveFeeRate(0)
    expect(rate).toBe(POOL.PLATFORM_FEE_RATE)
  })

  it('calculates_50percentDiscount_halfRate', () => {
    const rate = getEffectiveFeeRate(50)
    expect(rate).toBeCloseTo(0.025)
  })

  it('calculates_100percentDiscount_zeroRate', () => {
    const rate = getEffectiveFeeRate(100)
    expect(rate).toBe(0)
  })

  it('calculates_platformFee_withDiscount_50percent', () => {
    const rate = getEffectiveFeeRate(50)
    const fee = Math.floor(5000 * rate)
    expect(fee).toBe(125)
  })

  it('calculates_platformFee_withDiscount_100percent', () => {
    const rate = getEffectiveFeeRate(100)
    const fee = Math.floor(5000 * rate)
    expect(fee).toBe(0)
  })

  it('calculates_platformFee_roundsDown_withDiscount', () => {
    const rate = getEffectiveFeeRate(33)
    const fee = Math.floor(1000 * rate)
    expect(fee).toBe(Math.floor(1000 * 0.05 * (1 - 33 / 100)))
  })
})
