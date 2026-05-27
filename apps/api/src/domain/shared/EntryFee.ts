import { Money } from './Money'

export class EntryFee {
  readonly value: Money

  private constructor(value: Money) {
    this.value = value
  }

  static of(centavos: number): EntryFee {
    if (centavos < 500 || centavos > 100000) {
      throw new Error('Entry fee must be between 500 and 100000 centavos')
    }
    return new EntryFee(Money.of(centavos))
  }

  // Reconstitute an EntryFee from persisted state without re-applying the
  // current creation-time invariant (R$5 minimum). Pools created before the
  // bound was tightened in #55 may legally hold values below the current
  // floor; refusing to load them would corrupt history.
  static hydrate(centavos: number): EntryFee {
    return new EntryFee(Money.of(centavos))
  }

  platformFee(rate: number): Money {
    return this.value.percentage(rate * 100)
  }

  effectiveFee(discountPercent: number): Money {
    return this.value.percentage(100 - discountPercent)
  }
}
