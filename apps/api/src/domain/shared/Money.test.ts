import { describe, expect, it } from 'vitest'
import { Money } from './Money'

describe('Money', () => {
  describe('Money.of()', () => {
    it('creates Money from a valid non-negative integer', () => {
      const money = Money.of(5000)
      expect(money.centavos).toBe(5000)
    })

    it('creates Money with zero centavos', () => {
      const money = Money.of(0)
      expect(money.centavos).toBe(0)
    })

    it('rejects negative values', () => {
      expect(() => Money.of(-1)).toThrow('Centavos must be a non-negative integer')
    })

    it('rejects non-integer values', () => {
      expect(() => Money.of(10.5)).toThrow('Centavos must be a non-negative integer')
    })
  })

  describe('percentage()', () => {
    it('calculates percentage and floors the result', () => {
      const money = Money.of(5000)
      const result = money.percentage(5)
      expect(result.centavos).toBe(250)
    })

    it('floors fractional centavos', () => {
      const money = Money.of(1001)
      const result = money.percentage(10)
      expect(result.centavos).toBe(100)
    })

    it('returns zero for zero percentage', () => {
      const money = Money.of(5000)
      const result = money.percentage(0)
      expect(result.centavos).toBe(0)
    })
  })

  describe('subtract()', () => {
    it('subtracts one Money from another', () => {
      const a = Money.of(5000)
      const b = Money.of(2000)
      expect(a.subtract(b).centavos).toBe(3000)
    })

    it('returns zero when subtracting equal amounts', () => {
      const a = Money.of(1000)
      expect(a.subtract(a).centavos).toBe(0)
    })

    it('throws when result would be negative', () => {
      const a = Money.of(1000)
      const b = Money.of(2000)
      expect(() => a.subtract(b)).toThrow('Subtraction would result in negative Money')
    })
  })

  describe('splitEqual()', () => {
    it('splits evenly when divisible', () => {
      const money = Money.of(1000)
      expect(money.splitEqual(2).centavos).toBe(500)
    })

    it('floors the result when not evenly divisible', () => {
      const money = Money.of(1000)
      expect(money.splitEqual(3).centavos).toBe(333)
    })

    it('returns the full amount when splitting by 1', () => {
      const money = Money.of(5000)
      expect(money.splitEqual(1).centavos).toBe(5000)
    })
  })

  describe('equals()', () => {
    it('returns true for same centavos value', () => {
      expect(Money.of(500).equals(Money.of(500))).toBe(true)
    })

    it('returns false for different centavos values', () => {
      expect(Money.of(500).equals(Money.of(600))).toBe(false)
    })
  })
})
