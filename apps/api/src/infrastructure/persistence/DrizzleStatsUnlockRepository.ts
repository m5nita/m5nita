import { and, eq } from 'drizzle-orm'
import type { DbExecutor } from '../../db/client'
import { statsUnlock } from '../../db/schema/statsUnlock'
import type { StatsUnlockRepository } from '../../domain/stats/StatsUnlockRepository.port'

export class DrizzleStatsUnlockRepository implements StatsUnlockRepository {
  constructor(private db: DbExecutor) {}

  async isUnlocked(userId: string, poolId: string): Promise<boolean> {
    const row = await this.db.query.statsUnlock.findFirst({
      where: and(eq(statsUnlock.userId, userId), eq(statsUnlock.poolId, poolId)),
      columns: { id: true },
    })
    return row !== undefined
  }

  async listUnlockedUsers(poolId: string): Promise<string[]> {
    const rows = await this.db
      .select({ userId: statsUnlock.userId })
      .from(statsUnlock)
      .where(eq(statsUnlock.poolId, poolId))
    return rows.map((r) => r.userId)
  }

  async grant(data: { userId: string; poolId: string; paymentId: string }): Promise<void> {
    await this.db
      .insert(statsUnlock)
      .values(data)
      .onConflictDoNothing({ target: [statsUnlock.userId, statsUnlock.poolId] })
  }
}
