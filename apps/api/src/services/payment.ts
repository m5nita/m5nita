import { eq, and } from 'drizzle-orm'
import { db } from '../db/client'
import { payment } from '../db/schema/payment'
import { poolMember } from '../db/schema/poolMember'
import { pool } from '../db/schema/pool'
import { stripe } from '../lib/stripe'
import { POOL } from '@manita/shared'

export async function createEntryPayment(
  userId: string,
  poolId: string,
  amount: number,
) {
  const platformFee = Math.floor(amount * POOL.PLATFORM_FEE_RATE)

  // Create Stripe PaymentIntent
  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: 'brl',
    payment_method_types: ['pix', 'card'],
    metadata: {
      userId,
      poolId,
      type: 'entry',
    },
  })

  // Create payment record
  const [paymentRecord] = await db.insert(payment).values({
    userId,
    poolId,
    amount,
    platformFee,
    stripePaymentIntentId: paymentIntent.id,
    status: 'pending',
    type: 'entry',
  }).returning()

  return {
    payment: paymentRecord!,
    clientSecret: paymentIntent.client_secret!,
  }
}

export async function handlePaymentSucceeded(stripePaymentIntentId: string) {
  // Find payment record
  const paymentRecord = await db.query.payment.findFirst({
    where: eq(payment.stripePaymentIntentId, stripePaymentIntentId),
  })

  if (!paymentRecord) {
    console.error(`Payment not found for intent: ${stripePaymentIntentId}`)
    return
  }

  // Idempotency: skip if already completed
  if (paymentRecord.status === 'completed') return

  // Update payment status
  await db
    .update(payment)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(eq(payment.id, paymentRecord.id))

  // Create pool member
  if (paymentRecord.type === 'entry') {
    // Check if already a member (idempotency)
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

  if (paymentRecord.stripePaymentIntentId) {
    await stripe.refunds.create({
      payment_intent: paymentRecord.stripePaymentIntentId,
    })
  }

  await db
    .update(payment)
    .set({ status: 'refunded', updatedAt: new Date() })
    .where(eq(payment.id, paymentId))

  // Remove pool member
  await db
    .delete(poolMember)
    .where(
      and(
        eq(poolMember.poolId, paymentRecord.poolId),
        eq(poolMember.userId, paymentRecord.userId),
      ),
    )
}
