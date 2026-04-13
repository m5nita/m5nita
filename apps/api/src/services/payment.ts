import { and, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { payment } from '../db/schema/payment'
import { pool } from '../db/schema/pool'
import { poolMember } from '../db/schema/poolMember'

export async function handleCheckoutCompleted(paymentId: string) {
  const paymentRecord = await db.query.payment.findFirst({
    where: eq(payment.id, paymentId),
  })

  if (!paymentRecord) {
    console.error(`Payment not found for id: ${paymentId}`)
    return
  }

  if (paymentRecord.status === 'completed') return

  await db
    .update(payment)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(eq(payment.id, paymentRecord.id))

  if (paymentRecord.type === 'entry') {
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

export async function handleCheckoutExpired(externalId: string) {
  await db
    .update(payment)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(eq(payment.externalPaymentId, externalId))
}
