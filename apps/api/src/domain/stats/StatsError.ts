/**
 * Domain errors for the statistics feature. Routes map `code` → HTTP status
 * (NOT_FOUND/NOT_MEMBER/SCOPE_UNSUPPORTED → 404, ALREADY_UNLOCKED → 409).
 * Mirrors `PoolError`.
 */
export class StatsError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'NOT_MEMBER' | 'ALREADY_UNLOCKED' | 'SCOPE_UNSUPPORTED',
    message: string,
  ) {
    super(message)
    this.name = 'StatsError'
  }
}
