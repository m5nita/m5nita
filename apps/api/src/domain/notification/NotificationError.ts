/**
 * Domain errors for notification preferences. Routes map `code` → HTTP status
 * (UNKNOWN_TYPE → 404, TYPE_LOCKED → 409). Mirrors `StatsError` / `PoolError`.
 */
export class NotificationError extends Error {
  constructor(
    public code: 'UNKNOWN_TYPE' | 'TYPE_LOCKED',
    message: string,
  ) {
    super(message)
    this.name = 'NotificationError'
  }
}
