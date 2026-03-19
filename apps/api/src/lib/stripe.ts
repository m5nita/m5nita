import Stripe from 'stripe'

const stripeSecretKey = process.env.STRIPE_SECRET_KEY

if (!stripeSecretKey || stripeSecretKey === 'sk_test_xxx') {
  console.warn(
    '[Stripe] No valid STRIPE_SECRET_KEY configured. Payment features will use mock mode.',
  )
}

export const stripe =
  stripeSecretKey && stripeSecretKey !== 'sk_test_xxx' ? new Stripe(stripeSecretKey) : null

export function isStripeConfigured(): boolean {
  return stripe !== null
}
