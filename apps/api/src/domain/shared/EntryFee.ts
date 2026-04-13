import { Money } from './Money'

export class EntryFee {
  readonly value: Money

  private constructor(value: Money) {
    this.value = value
  }

  static of(centavos: number): EntryFee {
    if (centavos < 100 || centavos > 100000) {
      throw new Error('Entry fee must be between 100 and 100000 centavos')
    }
    return new EntryFee(Money.of(centavos))
  }

  platformFee(rate: number): Money {
    return this.value.percentage(rate * 100)
  }

  effectiveFee(discountPercent: number): Money {
    return this.value.percentage(100 - discountPercent)
  }
}
