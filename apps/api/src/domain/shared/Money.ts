export class Money {
  readonly centavos: number

  private constructor(centavos: number) {
    this.centavos = centavos
  }

  static of(centavos: number): Money {
    if (!Number.isInteger(centavos) || centavos < 0) {
      throw new Error('Centavos must be a non-negative integer')
    }
    return new Money(centavos)
  }

  percentage(rate: number): Money {
    return new Money(Math.floor((this.centavos * rate) / 100))
  }

  subtract(other: Money): Money {
    if (this.centavos < other.centavos) {
      throw new Error('Subtraction would result in negative Money')
    }
    return new Money(this.centavos - other.centavos)
  }

  splitEqual(parts: number): Money {
    return new Money(Math.floor(this.centavos / parts))
  }

  equals(other: Money): boolean {
    return this.centavos === other.centavos
  }
}
