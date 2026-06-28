import type { PushSubscription } from './PushSubscription'

/** Fields needed to store a device subscription (id/createdAt are DB-assigned). */
export type NewPushSubscription = {
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  userAgent: string | null
}

export interface PushSubscriptionRepository {
  /** Idempotent insert keyed by `endpoint` (re-enable refreshes owner + keys). */
  upsert(input: NewPushSubscription): Promise<void>
  /** All active device subscriptions for a user (routing fan-out). */
  findByUserId(userId: string): Promise<PushSubscription[]>
  /** Remove one device on opt-out (scoped to the owning user). */
  deleteByEndpoint(userId: string, endpoint: string): Promise<void>
  /** Bulk-remove dead endpoints reported by the push service (404/410). */
  deleteByEndpoints(endpoints: string[]): Promise<void>
}
