/**
 * Tiny in-process TTL cache with single-flight de-duplication.
 *
 * Built for the ranking hot path: during a live round many viewers poll the
 * same pool's ranking every 30s. Without this, each request re-runs the
 * ~63k-row aggregate. With it, concurrent callers for the same key share one
 * in-flight computation, and the resolved value is reused until the TTL lapses
 * (set just under the poll interval). Per-process only — fine on a single box.
 *
 * Failures are never cached: a rejected computation propagates to the current
 * waiters and the next call retries.
 */
export function createTtlCache<K, V>(ttlMs: number, now: () => number = Date.now) {
  type Entry = { value: V; expiresAt: number }
  const fresh = new Map<K, Entry>()
  const inFlight = new Map<K, Promise<V>>()

  return {
    async getOrCompute(key: K, compute: () => Promise<V>): Promise<V> {
      const cached = fresh.get(key)
      if (cached && cached.expiresAt > now()) return cached.value

      const pending = inFlight.get(key)
      if (pending) return pending

      const promise = compute()
        .then((value) => {
          fresh.set(key, { value, expiresAt: now() + ttlMs })
          return value
        })
        .finally(() => {
          inFlight.delete(key)
        })

      inFlight.set(key, promise)
      return promise
    },

    // Drop a key so the next getOrCompute recomputes — used to bust a pool's
    // standings the instant a match finishes and its points are written.
    invalidate(key: K): void {
      fresh.delete(key)
      inFlight.delete(key)
    },
  }
}
