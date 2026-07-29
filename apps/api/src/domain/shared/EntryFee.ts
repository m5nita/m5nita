import { POOL } from '@m5nita/shared'
import { Money } from './Money'

export class EntryFee {
  readonly value: Money

  private constructor(value: Money) {
    this.value = value
  }

  // Creation-time factory: enforces the current entry-fee bounds
  // (POOL.MIN_ENTRY_FEE..MAX_ENTRY_FEE, the single source shared with the
  // schema and the front). Use only when accepting a NEW entry fee from user
  // input. For values that originate from the database (mapper or read-model
  // projection), use `hydrate` instead — pools created under an earlier bound
  // legally hold values outside the current floor.
  static of(centavos: number): EntryFee {
    if (centavos < POOL.MIN_ENTRY_FEE || centavos > POOL.MAX_ENTRY_FEE) {
      throw new Error(
        `Entry fee must be between ${POOL.MIN_ENTRY_FEE} and ${POOL.MAX_ENTRY_FEE} centavos`,
      )
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
