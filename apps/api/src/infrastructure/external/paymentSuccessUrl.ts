import type { PaymentType } from '@m5nita/shared'

/**
 * Builds the front `/pools/payment-success` return URL with the context the
 * success screen needs to send the payer to the right place after paying:
 * the pool's predictions tab for a pool entry, or its stats tab for a
 * `stats_unlock`. `paymentId` is included only for gateways the success screen
 * polls to confirm (InfinitePay); MercadoPago/Stripe confirm via webhook and
 * omit it (the screen then shows a confirmed state without polling).
 */
export function paymentSuccessUrl(
  origin: string,
  ctx: { poolId: string; type: PaymentType; paymentId?: string },
): string {
  const query = new URLSearchParams()
  if (ctx.paymentId) query.set('payment_id', ctx.paymentId)
  query.set('pool_id', ctx.poolId)
  query.set('type', ctx.type)
  return `${origin}/pools/payment-success?${query.toString()}`
}
