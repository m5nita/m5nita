import { Money } from '../shared/Money'

export class PrizeCalculation {
  private constructor() {}

  static calculatePrizeTotal(
    entryFeeCentavos: number,
    memberCount: number,
    effectiveFeeRate: number,
  ): Money {
    return Money.of(Math.floor(entryFeeCentavos * memberCount * (1 - effectiveFeeRate)))
  }

  static calculateWinnerShare(prizeTotal: Money, winnerCount: number): Money {
    return prizeTotal.splitEqual(winnerCount)
  }
}
