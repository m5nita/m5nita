import { describe, expect, it } from 'vitest'
import { Money } from '../../shared/Money'
import { PrizeCalculation } from '../PrizeCalculation'

describe('PrizeCalculation', () => {
  it('calculates prize total with 5% fee rate', () => {
    const total = PrizeCalculation.calculatePrizeTotal(5000, 10, 0.05)
    expect(total.centavos).toBe(47500)
  })

  it('calculates prize total with 0% fee rate (full discount)', () => {
    const total = PrizeCalculation.calculatePrizeTotal(5000, 10, 0)
    expect(total.centavos).toBe(50000)
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
