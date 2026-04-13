export interface CheckoutParams {
  userId: string
  poolId: string
  amount: number
  platformFee: number
}

export interface CheckoutResult {
  payment: { id: string }
  checkoutUrl: string | null
}

export interface PaymentGateway {
  createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult>
  isConfigured(): boolean
}
