import { describe, expect, it } from 'vitest'
import { Balance } from './Balance'

describe('Balance', () => {
  it('accepts a positive balance (lucro)', () => {
    const b = Balance.of(35700)
    expect(b.centavos).toBe(35700)
    expect(b.isPositive()).toBe(true)
    expect(b.isNegative()).toBe(false)
    expect(b.isZero()).toBe(false)
  })

  it('accepts a negative balance (prejuízo)', () => {
    const b = Balance.of(-8500)
    expect(b.centavos).toBe(-8500)
    expect(b.isNegative()).toBe(true)
    expect(b.isPositive()).toBe(false)
  })

  it('treats zero as neither profit nor loss', () => {
    const b = Balance.of(0)
    expect(b.isZero()).toBe(true)
    expect(b.isPositive()).toBe(false)
    expect(b.isNegative()).toBe(false)
  })

  it('returns the absolute value as non-negative Money', () => {
    expect(Balance.of(-8500).abs().centavos).toBe(8500)
    expect(Balance.of(8500).abs().centavos).toBe(8500)
  })

  it('rejects a non-integer amount', () => {
    expect(() => Balance.of(12.5)).toThrow()
  })
})
