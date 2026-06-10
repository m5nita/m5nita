import { formatBrl, STATS } from '@m5nita/shared'
import { Money } from '../shared/Money'

/**
 * Price (centavos, BRL) to unlock a pool's statistics. A one-off symbolic
 * amount that is 100% platform revenue — it MUST NOT delegate to FeePolicy /
 * PrizeCalculation and never composes any prize pot. The configurable value is
 * resolved at the composition root (env STATS_UNLOCK_PRICE_CENTAVOS) and
 * injected via `of`; `default` falls back to the shared constant.
 */
export class StatsUnlockPrice {
  private readonly money: Money

  private constructor(money: Money) {
    this.money = money
  }

  static of(centavos: number): StatsUnlockPrice {
    return new StatsUnlockPrice(Money.of(centavos))
  }

  static default(): StatsUnlockPrice {
    return StatsUnlockPrice.of(STATS.UNLOCK_PRICE_CENTAVOS_DEFAULT)
  }

  get centavos(): number {
    return this.money.centavos
  }

  /** Pre-formatted BRL string for the API to hand to the front (FR-005). */
  formatted(): string {
    return formatBrl(this.centavos)
  }
}
