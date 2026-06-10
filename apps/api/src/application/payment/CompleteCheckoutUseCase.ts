import * as Sentry from '@sentry/node'
import { PoolStatus } from '../../domain/shared/PoolStatus'
import type { UnitOfWork } from '../ports/UnitOfWork.port'

type Input = {
  paymentId: string
}

/**
 * Payment-completion path: turns a confirmed checkout into its entitlements.
 * Everything runs inside one unit of work — the CAS claim, the type dispatch
 * (entry → pool activation + membership; stats_unlock → entitlement grant) and
 * every insert are atomic: a duplicate webhook short-circuits on the CAS, and a
 * failure in any step rolls back all of them (no "paid but not a member"
 * window, no double credit).
 */
export class CompleteCheckoutUseCase {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  async execute(input: Input): Promise<void> {
    const { paymentId } = input
    await this.unitOfWork.run(async ({ payments, pools, statsUnlocks }) => {
      const claimed = await payments.claimCompletion(paymentId)

      if (!claimed) {
        if (await payments.exists(paymentId)) {
          console.log(`[payment] ${paymentId} already completed, skipping`)
        } else {
          const msg = `[payment] record not found for id=${paymentId}`
          console.error(msg)
          Sentry.captureMessage(msg, 'error')
        }
        return
      }

      Sentry.addBreadcrumb({
        category: 'payment',
        message: 'handleCheckoutCompleted claimed',
        level: 'info',
        data: {
          paymentId: claimed.id,
          poolId: claimed.poolId,
          userId: claimed.userId,
          type: claimed.type,
        },
      })

      console.log(
        `[payment] ${claimed.id} marked completed (pool=${claimed.poolId}, type=${claimed.type})`,
      )

      if (claimed.type === 'stats_unlock') {
        await statsUnlocks.grant({
          userId: claimed.userId,
          poolId: claimed.poolId,
          paymentId: claimed.id,
        })
        console.log(`[payment] stats unlocked (pool=${claimed.poolId}, user=${claimed.userId})`)
        return
      }

      if (claimed.type !== 'entry') return

      const pool = await pools.findById(claimed.poolId)
      if (pool && pool.status === PoolStatus.Pending) {
        pool.activate()
        await pools.updateStatus(pool.id, pool.status)
        console.log(`[payment] pool ${claimed.poolId} activated`)
      }

      const created = await pools.addMember(claimed.poolId, claimed.userId, claimed.id)
      if (created) {
        console.log(`[payment] poolMember created (pool=${claimed.poolId}, user=${claimed.userId})`)
      }
    })
  }
}
