import { Money } from './Money'

/**
 * A signed monetary position (net profit/loss). Unlike `Money` — which is
 * non-negative by design — a Balance may be negative, so it models a "saldo"
 * (lucro when positive, prejuízo when negative). Integer centavos only.
 */
export class Balance {
  readonly centavos: number

  private constructor(centavos: number) {
    this.centavos = centavos
  }

  static of(centavos: number): Balance {
    if (!Number.isInteger(centavos)) {
      throw new Error('Balance centavos must be an integer')
    }
    return new Balance(centavos)
  }

  isPositive(): boolean {
    return this.centavos > 0
  }

  isNegative(): boolean {
    return this.centavos < 0
  }

  isZero(): boolean {
    return this.centavos === 0
  }

  /** Magnitude as `Money` (always non-negative). */
  abs(): Money {
    return Money.of(Math.abs(this.centavos))
  }
}
