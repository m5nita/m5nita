import { describe, expect, it } from 'vitest'
import { FeePolicy } from './FeePolicy'
import { Money } from './Money'

describe('FeePolicy', () => {
  it('standard() applies 5% platform fee', () => {
    const policy = FeePolicy.standard()
    expect(policy.effectiveRate()).toBeCloseTo(0.05, 10)
    expect(policy.applyTo(Money.of(10000)).centavos).toBe(500)
  })

  it('withDiscount(50) cuts the fee in half', () => {
    const policy = FeePolicy.withDiscount(50)
    expect(policy.effectiveRate()).toBeCloseTo(0.025, 10)
    expect(policy.applyTo(Money.of(10000)).centavos).toBe(250)
  })

  it('withDiscount(100) zeroes the fee', () => {
    const policy = FeePolicy.withDiscount(100)
    expect(policy.effectiveRate()).toBe(0)
    expect(policy.applyTo(Money.of(10000)).centavos).toBe(0)
  })

  it('from(null) returns standard policy', () => {
    expect(FeePolicy.from(null).discountPercent).toBe(0)
    expect(FeePolicy.from(undefined).discountPercent).toBe(0)
    expect(FeePolicy.from(0).discountPercent).toBe(0)
  })

  it('from(25) returns discounted policy', () => {
    expect(FeePolicy.from(25).discountPercent).toBe(25)
  })

  it('rejects discount out of range', () => {
    expect(() => FeePolicy.withDiscount(-1)).toThrow()
    expect(() => FeePolicy.withDiscount(101)).toThrow()
    expect(() => FeePolicy.withDiscount(Number.NaN)).toThrow()
  })

  it('originalFeeOn() ignores discount', () => {
    const policy = FeePolicy.withDiscount(50)
    expect(policy.originalFeeOn(Money.of(10000)).centavos).toBe(500)
  })

  it('prizeShareOf() returns 1 - effectiveRate portion (matches legacy formula)', () => {
    const policy = FeePolicy.withDiscount(50)
    // entryFee 5000, 10 members, 50% discount → effectiveRate 0.025
    // prizeTotal = floor(5000 * 10 * (1 - 0.025)) = 48750
    expect(policy.prizeShareOf(Money.of(50000)).centavos).toBe(48750)
  })
})
