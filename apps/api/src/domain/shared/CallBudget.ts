/**
 * Rolling-window per-minute call budget. Caps the number of external calls
 * "started" in any 60s window to `maxPerMinute`. Pure and deterministic given an
 * injected `now`, so the live-sync scheduler can enforce the football-data rate
 * limit (20/min now, 10/min after the World Cup) and degrade gracefully when more
 * competitions are live than the budget allows.
 */
const WINDOW_MS = 60_000

export class CallBudget {
  private readonly starts: number[] = []

  constructor(
    private readonly maxPerMinute: number,
    private readonly now: () => number = Date.now,
  ) {}

  private prune(t: number): void {
    const cutoff = t - WINDOW_MS
    while (this.starts.length > 0 && (this.starts[0] as number) <= cutoff) {
      this.starts.shift()
    }
  }

  available(): number {
    const t = this.now()
    this.prune(t)
    return Math.max(0, this.maxPerMinute - this.starts.length)
  }

  /** Grant min(n, available) calls, recording them at `now`. Returns the granted count. */
  take(n: number): number {
    if (n <= 0) return 0
    const granted = Math.min(n, this.available())
    const t = this.now()
    for (let i = 0; i < granted; i++) this.starts.push(t)
    return granted
  }
}
