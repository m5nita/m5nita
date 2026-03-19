import { POOL } from '@m5nita/shared'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { payment } from '../db/schema/payment'
import { pool } from '../db/schema/pool'
import { poolMember } from '../db/schema/poolMember'
import { isStripeConfigured, stripe } from '../lib/stripe'

export async function createEntryPayment(userId: string, poolId: string, amount: number) {
  const platformFee = Math.floor(amount * POOL.PLATFORM_FEE_RATE)

  let stripePaymentIntentId: string | null = null
  let checkoutUrl: string | null = null

  if (isStripeConfigured() && stripe) {
    const successUrl = `${process.env.ALLOWED_ORIGIN || 'http://localhost:5173'}/pools/payment-success?session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${process.env.ALLOWED_ORIGIN || 'http://localhost:5173'}/`

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: { name: 'Entrada no Bolão' },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      metadata: { userId, poolId, type: 'entry' },
      success_url: successUrl,
      cancel_url: cancelUrl,
    })

    stripePaymentIntentId = session.id
    checkoutUrl = session.url
  } else {
    stripePaymentIntentId = `mock_pi_${crypto.randomUUID()}`
    checkoutUrl = null
    console.log(`[DEV] Mock payment: ${amount / 100} BRL for pool ${poolId}`)
  }

  const [paymentRecord] = await db
    .insert(payment)
    .values({
      userId,
      poolId,
      amount,
      platformFee,
      stripePaymentIntentId,
      status: isStripeConfigured() ? 'pending' : 'completed',
      type: 'entry',
    })
    .returning()

  // In mock mode, auto-activate pool and create member
  if (!isStripeConfigured()) {
    await db
      .update(pool)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(pool.id, poolId))

    const existing = await db.query.poolMember.findFirst({
      where: and(eq(poolMember.poolId, poolId), eq(poolMember.userId, userId)),
    })
    if (!existing && paymentRecord) {
      await db.insert(poolMember).values({
        poolId,
        userId,
        paymentId: paymentRecord.id,
      })
    }
  }

  return {
    payment: paymentRecord as NonNullable<typeof paymentRecord>,
    checkoutUrl,
  }
}

export async function handleCheckoutCompleted(sessionId: string) {
  const paymentRecord = await db.query.payment.findFirst({
    where: eq(payment.stripePaymentIntentId, sessionId),
  })

  if (!paymentRecord) {
    console.error(`Payment not found for session: ${sessionId}`)
    return
  }

  if (paymentRecord.status === 'completed') return

  await db
    .update(payment)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(eq(payment.id, paymentRecord.id))

  if (paymentRecord.type === 'entry') {
    // Activate pool if still pending (owner's first payment)
    const poolData = await db.query.pool.findFirst({
      where: eq(pool.id, paymentRecord.poolId),
    })
    if (poolData?.status === 'pending') {
      await db
        .update(pool)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(pool.id, paymentRecord.poolId))
    }

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

export async function handleCheckoutExpired(sessionId: string) {
  await db
    .update(payment)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(eq(payment.stripePaymentIntentId, sessionId))
}

export async function createRefund(paymentId: string) {
  const paymentRecord = await db.query.payment.findFirst({
    where: eq(payment.id, paymentId),
  })

  if (!paymentRecord || paymentRecord.status !== 'completed') {
    throw new Error('Payment not found or not completed')
  }

  if (isStripeConfigured() && stripe && paymentRecord.stripePaymentIntentId) {
    // Retrieve the checkout session to get the payment intent
    const session = await stripe.checkout.sessions.retrieve(paymentRecord.stripePaymentIntentId)
    if (session.payment_intent) {
      await stripe.refunds.create({
        payment_intent: session.payment_intent as string,
      })
    }
  }

  await db
    .update(payment)
    .set({ status: 'refunded', updatedAt: new Date() })
    .where(eq(payment.id, paymentId))

  await db
    .delete(poolMember)
    .where(
      and(eq(poolMember.poolId, paymentRecord.poolId), eq(poolMember.userId, paymentRecord.userId)),
    )
}
