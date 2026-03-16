import { eq, and } from 'drizzle-orm'
import { db } from '../db/client'
import { payment } from '../db/schema/payment'
import { poolMember } from '../db/schema/poolMember'
import { stripe, isStripeConfigured } from '../lib/stripe'
import { POOL } from '@manita/shared'

export async function createEntryPayment(
  userId: string,
  poolId: string,
  amount: number,
) {
  const platformFee = Math.floor(amount * POOL.PLATFORM_FEE_RATE)

  let stripePaymentIntentId: string | null = null
  let clientSecret: string | null = null

  if (isStripeConfigured() && stripe) {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'brl',
      payment_method_types: ['pix', 'card'],
      metadata: { userId, poolId, type: 'entry' },
    })
    stripePaymentIntentId = paymentIntent.id
    clientSecret = paymentIntent.client_secret!
  } else {
    // Mock mode: auto-complete payment
    stripePaymentIntentId = `mock_pi_${crypto.randomUUID()}`
    clientSecret = `mock_secret_${crypto.randomUUID()}`
    console.log(`[DEV] Mock payment: ${amount / 100} BRL for pool ${poolId}`)
  }

  const [paymentRecord] = await db.insert(payment).values({
    userId,
    poolId,
    amount,
    platformFee,
    stripePaymentIntentId,
    status: isStripeConfigured() ? 'pending' : 'completed',
    type: 'entry',
  }).returning()

  // In mock mode, auto-create pool member
  if (!isStripeConfigured()) {
    const existing = await db.query.poolMember.findFirst({
      where: and(eq(poolMember.poolId, poolId), eq(poolMember.userId, userId)),
    })
    if (!existing) {
      await db.insert(poolMember).values({
        poolId,
        userId,
        paymentId: paymentRecord!.id,
      })
    }
  }

  return {
    payment: paymentRecord!,
    clientSecret,
  }
}

export async function handlePaymentSucceeded(stripePaymentIntentId: string) {
  const paymentRecord = await db.query.payment.findFirst({
    where: eq(payment.stripePaymentIntentId, stripePaymentIntentId),
  })

  if (!paymentRecord) {
    console.error(`Payment not found for intent: ${stripePaymentIntentId}`)
    return
  }

  if (paymentRecord.status === 'completed') return

  await db
    .update(payment)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(eq(payment.id, paymentRecord.id))

  if (paymentRecord.type === 'entry') {
    const existing = await db.query.poolMember.findFirst({
      where: and(
        eq(poolMember.poolId, paymentRecord.poolId),
        eq(poolMember.userId, paymentRecord.userId),
      ),
    })

    if (!existing) {
      await db.insert(poolMember).values({
        poolId: paymentRecord.poolId,
        userId: paymentRecord.userId,
        paymentId: paymentRecord.id,
      })
    }
  }
}

export async function handlePaymentFailed(stripePaymentIntentId: string) {
  await db
    .update(payment)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(eq(payment.stripePaymentIntentId, stripePaymentIntentId))
}

export async function createRefund(paymentId: string) {
  const paymentRecord = await db.query.payment.findFirst({
    where: eq(payment.id, paymentId),
  })

  if (!paymentRecord || paymentRecord.status !== 'completed') {
    throw new Error('Payment not found or not completed')
  }

  if (isStripeConfigured() && stripe && paymentRecord.stripePaymentIntentId) {
    await stripe.refunds.create({
      payment_intent: paymentRecord.stripePaymentIntentId,
    })
  }

  await db
    .update(payment)
    .set({ status: 'refunded', updatedAt: new Date() })
    .where(eq(payment.id, paymentId))

  await db
    .delete(poolMember)
    .where(
      and(
        eq(poolMember.poolId, paymentRecord.poolId),
        eq(poolMember.userId, paymentRecord.userId),
      ),
    )
}
