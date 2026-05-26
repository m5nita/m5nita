import { POOL } from '../constants/index'

/**
 * Pure fee math shared by the API domain (`FeePolicy` wraps these with VO
 * semantics) and the web client (preview before pool creation, when no
 * pool exists yet to query from the API).
 *
 * The single canonical home of these formulas — the architecture guardrail
 * `scripts/check-domain-leaks.mjs` will reject any other implementation.
 */

export function computeEffectiveFeeRate(discountPercent: number): number {
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new Error('discountPercent must be between 0 and 100')
  }
  return POOL.PLATFORM_FEE_RATE * (1 - discountPercent / 100)
}

export function computePlatformFee(amountCentavos: number, discountPercent = 0): number {
  return Math.floor(amountCentavos * computeEffectiveFeeRate(discountPercent))
}

export function computeOriginalPlatformFee(amountCentavos: number): number {
  return Math.floor(amountCentavos * POOL.PLATFORM_FEE_RATE)
}

export function computePrizeTotal(
  entryFeeCentavos: number,
  memberCount: number,
  discountPercent = 0,
): number {
  if (!Number.isInteger(memberCount) || memberCount < 0) {
    throw new Error('memberCount must be a non-negative integer')
  }
  return Math.floor(entryFeeCentavos * memberCount * (1 - computeEffectiveFeeRate(discountPercent)))
}
