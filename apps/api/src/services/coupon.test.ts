import { COUPON, computeEffectiveFeeRate, computePlatformFee, POOL } from '@m5nita/shared'
import { describe, expect, it } from 'vitest'

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

describe('fee math (shared helper)', () => {
  it('no discount → full rate', () => {
    expect(computeEffectiveFeeRate(0)).toBe(POOL.PLATFORM_FEE_RATE)
  })

  it('50% discount → half rate', () => {
    expect(computeEffectiveFeeRate(50)).toBeCloseTo(0.025)
  })

  it('100% discount → zero rate', () => {
    expect(computeEffectiveFeeRate(100)).toBe(0)
  })

  it('platform fee with 50% discount floors correctly', () => {
    expect(computePlatformFee(5000, 50)).toBe(125)
  })

  it('platform fee with 100% discount is zero', () => {
    expect(computePlatformFee(5000, 100)).toBe(0)
  })
})
