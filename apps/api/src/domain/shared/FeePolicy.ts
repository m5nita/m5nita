import {
  computeEffectiveFeeRate,
  computeOriginalPlatformFee,
  computePlatformFee,
  POOL,
} from '@m5nita/shared'
import { Money } from './Money'

export class FeePolicy {
  readonly discountPercent: number

  private constructor(discountPercent: number) {
    this.discountPercent = discountPercent
  }

  static standard(): FeePolicy {
    return new FeePolicy(0)
  }

  static withDiscount(discountPercent: number): FeePolicy {
    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
      throw new Error('discountPercent must be between 0 and 100')
    }
    return new FeePolicy(discountPercent)
  }

  static from(discountPercent: number | null | undefined): FeePolicy {
    if (discountPercent == null || discountPercent === 0) return FeePolicy.standard()
    return FeePolicy.withDiscount(discountPercent)
  }

  baseRate(): number {
    return POOL.PLATFORM_FEE_RATE
  }

  effectiveRate(): number {
    return computeEffectiveFeeRate(this.discountPercent)
  }

  applyTo(amount: Money): Money {
    return Money.of(computePlatformFee(amount.centavos, this.discountPercent))
  }

  originalFeeOn(amount: Money): Money {
    return Money.of(computeOriginalPlatformFee(amount.centavos))
  }

  prizeShareOf(amount: Money): Money {
    return Money.of(Math.floor(amount.centavos * (1 - this.effectiveRate())))
  }
}
