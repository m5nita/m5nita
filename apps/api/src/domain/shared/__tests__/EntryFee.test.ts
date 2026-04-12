import { describe, expect, it } from 'vitest'
import { EntryFee } from '../EntryFee'

describe('EntryFee', () => {
  describe('EntryFee.of()', () => {
    it('creates EntryFee with 100 centavos (minimum)', () => {
      const fee = EntryFee.of(100)
      expect(fee.value.centavos).toBe(100)
    })

    it('creates EntryFee with 50000 centavos', () => {
      const fee = EntryFee.of(50000)
      expect(fee.value.centavos).toBe(50000)
    })

    it('creates EntryFee with 100000 centavos (maximum)', () => {
      const fee = EntryFee.of(100000)
      expect(fee.value.centavos).toBe(100000)
    })

    it('rejects value below 100', () => {
      expect(() => EntryFee.of(99)).toThrow()
    })

    it('rejects value above 100000', () => {
      expect(() => EntryFee.of(100001)).toThrow()
    })
  })

  describe('platformFee()', () => {
    it('calculates 5% platform fee on 5000 centavos', () => {
      const fee = EntryFee.of(5000)
      const platformFee = fee.platformFee(0.05)
      expect(platformFee.centavos).toBe(250)
    })
  })

  describe('effectiveFee()', () => {
    it('applies 50% discount to entry fee', () => {
      const fee = EntryFee.of(5000)
      const effective = fee.effectiveFee(50)
      expect(effective.centavos).toBe(2500)
    })
  })
})
