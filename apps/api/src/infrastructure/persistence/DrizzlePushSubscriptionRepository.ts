import { and, eq, inArray } from 'drizzle-orm'
import type { DbExecutor } from '../../db/client'
import { pushSubscription } from '../../db/schema/pushSubscription'
import type { PushSubscription } from '../../domain/push/PushSubscription'
import type {
  NewPushSubscription,
  PushSubscriptionRepository,
} from '../../domain/push/PushSubscriptionRepository.port'

export class DrizzlePushSubscriptionRepository implements PushSubscriptionRepository {
  constructor(private readonly db: DbExecutor) {}

  async upsert(input: NewPushSubscription): Promise<void> {
    await this.db
      .insert(pushSubscription)
      .values(input)
      .onConflictDoUpdate({
        target: pushSubscription.endpoint,
        set: {
          userId: input.userId,
          p256dh: input.p256dh,
          auth: input.auth,
          userAgent: input.userAgent,
        },
      })
  }

  findByUserId(userId: string): Promise<PushSubscription[]> {
    return this.db.query.pushSubscription.findMany({
      where: eq(pushSubscription.userId, userId),
    })
  }

  async deleteByEndpoint(userId: string, endpoint: string): Promise<void> {
    await this.db
      .delete(pushSubscription)
      .where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint)))
  }

  async deleteByEndpoints(endpoints: string[]): Promise<void> {
    if (endpoints.length === 0) return
    await this.db.delete(pushSubscription).where(inArray(pushSubscription.endpoint, endpoints))
  }
}
