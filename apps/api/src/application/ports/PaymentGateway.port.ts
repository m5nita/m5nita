import type { PaymentType } from '@m5nita/shared'

export interface CheckoutParams {
  userId: string
  poolId: string
  amount: number
  platformFee: number
  /** Payment purpose. Defaults to 'entry' when omitted (existing pool-entry flow). */
  type?: PaymentType
  /** Checkout line-item title shown to the payer. Defaults to the entry label. */
  description?: string
}

export interface CheckoutResult {
  payment: { id: string }
  checkoutUrl: string | null
}

export interface PaymentGateway {
  createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult>
  isConfigured(): boolean
}
