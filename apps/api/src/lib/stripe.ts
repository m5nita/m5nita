import Stripe from 'stripe'

const stripeSecretKey = process.env.STRIPE_SECRET_KEY

export const stripe =
  stripeSecretKey && stripeSecretKey !== 'sk_test_xxx' ? new Stripe(stripeSecretKey) : null
