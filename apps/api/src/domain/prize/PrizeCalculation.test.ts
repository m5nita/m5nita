import { describe, expect, it } from 'vitest'
import { EntryFee } from '../shared/EntryFee'
import { FeePolicy } from '../shared/FeePolicy'
import { Money } from '../shared/Money'
import { PrizeCalculation } from './PrizeCalculation'

describe('PrizeCalculation', () => {
  it('calculates prize total with standard policy (5% fee)', () => {
    const total = PrizeCalculation.calculatePrizeTotal(EntryFee.of(5000), 10, FeePolicy.standard())
    expect(total.centavos).toBe(47500)
  })

  it('calculates prize total with 100% discount (no fee)', () => {
    const total = PrizeCalculation.calculatePrizeTotal(
      EntryFee.of(5000),
      10,
      FeePolicy.withDiscount(100),
    )
    expect(total.centavos).toBe(50000)
  })

  it('calculates prize total with partial discount', () => {
    // 5000 * 10 * (1 - 0.05 * 0.5) = 50000 * 0.975 = 48750
    const total = PrizeCalculation.calculatePrizeTotal(
      EntryFee.of(5000),
      10,
      FeePolicy.withDiscount(50),
    )
    expect(total.centavos).toBe(48750)
  })

  it('returns zero for zero members', () => {
    const total = PrizeCalculation.calculatePrizeTotal(EntryFee.of(5000), 0, FeePolicy.standard())
    expect(total.centavos).toBe(0)
  })

  it('rejects negative memberCount', () => {
    expect(() =>
      PrizeCalculation.calculatePrizeTotal(EntryFee.of(5000), -1, FeePolicy.standard()),
    ).toThrow()
  })

  it('calculates winner share split 2 ways', () => {
    const prizeTotal = Money.of(47500)
    const share = PrizeCalculation.calculateWinnerShare(prizeTotal, 2)
    expect(share.centavos).toBe(23750)
  })

  it('calculates winner share split 3 ways with floor', () => {
    const prizeTotal = Money.of(10000)
    const share = PrizeCalculation.calculateWinnerShare(prizeTotal, 3)
    expect(share.centavos).toBe(3333)
  })
})
