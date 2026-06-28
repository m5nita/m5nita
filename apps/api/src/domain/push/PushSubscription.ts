/**
 * A single browser/device's authorization to receive Web Push for a user.
 * A delivery record with no business behavior (pragmatic-scope: not a value
 * object / aggregate), mirrored 1:1 by the `push_subscription` table.
 */
export type PushSubscription = {
  id: string
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  userAgent: string | null
  createdAt: Date
}
