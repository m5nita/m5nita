/**
 * Interval for live (30s) polling, with 0–10s jitter so cohorts that navigated
 * together don't fire synchronized waves at the API — the heavy reads are now
 * cached/cheap, but jitter still smooths the per-second request spikes.
 */
export function livePollMs(): number {
  return 30_000 + Math.floor(Math.random() * 10_000)
}
