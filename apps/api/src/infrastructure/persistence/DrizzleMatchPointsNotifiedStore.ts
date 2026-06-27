import type { DbExecutor } from '../../db/client'
import { matchPointsNotified } from '../../db/schema/matchPointsNotified'

/**
 * Durable at-most-once gate for the "pontos conquistados" push. Lives in the
 * infrastructure layer because it is a delivery-idempotency concern behind the
 * notification port, not a domain rule.
 */
export interface MatchPointsNotifiedStore {
  /** Returns true if this (user, pool, match) was newly recorded (⇒ send). */
  recordOnce(userId: string, poolId: string, matchId: string): Promise<boolean>
}

export class DrizzleMatchPointsNotifiedStore implements MatchPointsNotifiedStore {
  constructor(private readonly db: DbExecutor) {}

  async recordOnce(userId: string, poolId: string, matchId: string): Promise<boolean> {
    const inserted = await this.db
      .insert(matchPointsNotified)
      .values({ userId, poolId, matchId })
      .onConflictDoNothing({
        target: [
          matchPointsNotified.userId,
          matchPointsNotified.poolId,
          matchPointsNotified.matchId,
        ],
      })
      .returning({ id: matchPointsNotified.id })
    return inserted.length > 0
  }
}
