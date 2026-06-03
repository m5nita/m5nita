import * as Sentry from '@sentry/node'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '../db/client'
import { payment } from '../db/schema/payment'
import { pool } from '../db/schema/pool'
import { poolMember } from '../db/schema/poolMember'
import { statsUnlock } from '../db/schema/statsUnlock'

export async function handleCheckoutCompleted(paymentId: string) {
  await db.transaction(async (tx) => {
    const claimed = await tx
      .update(payment)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(and(eq(payment.id, paymentId), ne(payment.status, 'completed')))
      .returning()

    const paymentRecord = claimed[0]
    if (!paymentRecord) {
      const existing = await tx.query.payment.findFirst({ where: eq(payment.id, paymentId) })
      if (!existing) {
        const msg = `[payment] record not found for id=${paymentId}`
        console.error(msg)
        Sentry.captureMessage(msg, 'error')
      } else {
        console.log(`[payment] ${paymentId} already completed, skipping`)
      }
      return
    }

    Sentry.addBreadcrumb({
      category: 'payment',
      message: 'handleCheckoutCompleted claimed',
      level: 'info',
      data: {
        paymentId: paymentRecord.id,
        poolId: paymentRecord.poolId,
        userId: paymentRecord.userId,
        type: paymentRecord.type,
      },
    })

    console.log(
      `[payment] ${paymentRecord.id} marked completed (pool=${paymentRecord.poolId}, type=${paymentRecord.type})`,
    )

    // Statistics unlock: grant the entitlement idempotently in the SAME tx as
    // the completion CAS (atomic — no window where the user paid but isn't
    // granted). 100% platform revenue: NEVER touches poolMember / pool
    // activation / prize. The per-user snapshot is (re)computed at match finish
    // (jobs/calcPoints) and on first read.
    if (paymentRecord.type === 'stats_unlock') {
      await tx
        .insert(statsUnlock)
        .values({
          userId: paymentRecord.userId,
          poolId: paymentRecord.poolId,
          paymentId: paymentRecord.id,
        })
        .onConflictDoNothing({
          target: [statsUnlock.userId, statsUnlock.poolId],
        })
      console.log(
        `[payment] stats unlocked (pool=${paymentRecord.poolId}, user=${paymentRecord.userId})`,
      )
      return
    }

    if (paymentRecord.type !== 'entry') return

    const poolData = await tx.query.pool.findFirst({
      where: eq(pool.id, paymentRecord.poolId),
    })
    if (poolData?.status === 'pending') {
      await tx
        .update(pool)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(pool.id, paymentRecord.poolId))
      console.log(`[payment] pool ${paymentRecord.poolId} activated`)
    }

    const inserted = await tx
      .insert(poolMember)
      .values({
        poolId: paymentRecord.poolId,
        userId: paymentRecord.userId,
        paymentId: paymentRecord.id,
      })
      .onConflictDoNothing({
        target: [poolMember.poolId, poolMember.userId],
      })
      .returning({ id: poolMember.id })

    if (inserted.length > 0) {
      console.log(
        `[payment] poolMember created (pool=${paymentRecord.poolId}, user=${paymentRecord.userId})`,
      )
    }
  })
}

export async function handleCheckoutExpired(externalId: string) {
  await db
    .update(payment)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(eq(payment.externalPaymentId, externalId))
  console.log(`[payment] externalId=${externalId} marked expired`)
}
