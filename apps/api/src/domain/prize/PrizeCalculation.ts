import type { EntryFee } from '../shared/EntryFee'
import type { FeePolicy } from '../shared/FeePolicy'
import { Money } from '../shared/Money'

export class PrizeCalculation {
  private constructor() {}

  static calculatePrizeTotal(entryFee: EntryFee, memberCount: number, feePolicy: FeePolicy): Money {
    if (!Number.isInteger(memberCount) || memberCount < 0) {
      throw new Error('memberCount must be a non-negative integer')
    }
    const pot = Money.of(entryFee.value.centavos * memberCount)
    return feePolicy.prizeShareOf(pot)
  }

  static calculateWinnerShare(prizeTotal: Money, winnerCount: number): Money {
    return prizeTotal.splitEqual(winnerCount)
  }
}
