import * as Sentry from '@sentry/node'
import { PoolStatus } from '../../domain/shared/PoolStatus'
import type { UnitOfWork } from '../ports/UnitOfWork.port'

type Input = {
  paymentId: string
}

/**
 * Side effect to run once a pool has actually gone live, outside the
 * transaction. A narrow callback rather than a service dependency so this use
 * case stays ignorant of notifications.
 */
export type PoolActivatedHook = (poolId: string) => Promise<void>

/**
 * Payment-completion path: turns a confirmed checkout into its entitlements.
 * Everything runs inside one unit of work — the CAS claim, the type dispatch
 * (entry → pool activation + membership; stats_unlock → entitlement grant) and
 * every insert are atomic: a duplicate webhook short-circuits on the CAS, and a
 * failure in any step rolls back all of them (no "paid but not a member"
 * window, no double credit).
 */
export class CompleteCheckoutUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly onPoolActivated?: PoolActivatedHook,
  ) {}

  async execute(input: Input): Promise<void> {
    const activatedPoolId = await this.claimAndApply(input.paymentId)
    if (activatedPoolId) await this.runActivatedHook(activatedPoolId)
  }

  /**
   * Runs after the transaction commits — a pool that rolled back must never
   * trigger side effects — and swallows its own failures: a lost announcement is
   * acceptable, a payment that reports failure because a notification broke is
   * not.
   */
  private async runActivatedHook(poolId: string): Promise<void> {
    if (!this.onPoolActivated) return
    try {
      await this.onPoolActivated(poolId)
    } catch (error) {
      console.error(`[payment] pool-activated hook failed for pool ${poolId}:`, error)
      Sentry.captureException(error)
    }
  }

  /** Returns the id of the pool this call activated, or null when it activated none. */
  private async claimAndApply(paymentId: string): Promise<string | null> {
    return this.unitOfWork.run(async ({ payments, pools, statsUnlocks }) => {
      const claimed = await payments.claimCompletion(paymentId)

      if (!claimed) {
        if (await payments.exists(paymentId)) {
          console.log(`[payment] ${paymentId} already completed, skipping`)
        } else {
          const msg = `[payment] record not found for id=${paymentId}`
          console.error(msg)
          Sentry.captureMessage(msg, 'error')
        }
        return null
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
        return null
      }

      if (claimed.type !== 'entry') return null

      const pool = await pools.findById(claimed.poolId)
      let activatedPoolId: string | null = null
      if (pool && pool.status === PoolStatus.Pending) {
        pool.activate()
        await pools.updateStatus(pool.id, pool.status)
        activatedPoolId = pool.id
        console.log(`[payment] pool ${claimed.poolId} activated`)
      }

      const created = await pools.addMember(claimed.poolId, claimed.userId, claimed.id)
      if (created) {
        console.log(`[payment] poolMember created (pool=${claimed.poolId}, user=${claimed.userId})`)
      }

      return activatedPoolId
    })
  }
}
