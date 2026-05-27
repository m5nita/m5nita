import { Money } from './Money'

export class EntryFee {
  readonly value: Money

  private constructor(value: Money) {
    this.value = value
  }

  // Creation-time factory: enforces the current R$5–R$1000 business floor.
  // Use only when accepting a NEW entry fee from user input. For values that
  // originate from the database (mapper or read-model projection), use
  // `hydrate` instead — pools created before the bound was tightened in #55
  // legally hold values below the current floor.
  static of(centavos: number): EntryFee {
    if (centavos < 500 || centavos > 100000) {
      throw new Error('Entry fee must be between 500 and 100000 centavos')
    }
    return new EntryFee(Money.of(centavos))
  }

  // Reconstitute an EntryFee from persisted state without re-applying the
  // current creation-time invariant. The aggregate must be able to represent
  // its own history; tightening a rule retroactively can't reject data that
  // is already in the system.
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
