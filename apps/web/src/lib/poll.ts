/**
 * Polling cadence helpers for live screens.
 *
 * Three phases:
 *  - 'live'     → fast 30–40s poll while a match is in progress (jittered so
 *                 cohorts that navigated together don't fire synchronized waves).
 *  - 'imminent' → slow 60–90s heartbeat while a match is about to start (or just
 *                 kicked off but the backend hasn't flagged it 'live' yet), so the
 *                 screen flips to live on its own without the user interacting.
 *  - 'idle'     → no interval polling; focus/reconnect refresh covers freshness.
 */

/** Start polling this long before a scheduled kickoff. */
export const IMMINENT_WINDOW_MS = 15 * 60_000
/** Keep polling this long after a scheduled kickoff that hasn't flipped to live. */
export const LATE_GRACE_MS = 20 * 60_000

export function livePollMs(): number {
  return 30_000 + Math.floor(Math.random() * 10_000)
}

export function imminentPollMs(): number {
  return 60_000 + Math.floor(Math.random() * 30_000)
}

/** Is `matchDate` close enough to `now` that we should heartbeat for the kickoff? */
export function isImminentKickoff(matchDate: string, now: number): boolean {
  const t = Date.parse(matchDate)
  if (Number.isNaN(t)) return false
  return t <= now + IMMINENT_WINDOW_MS && t >= now - LATE_GRACE_MS
}

export function pollPhase(input: {
  hasLive: boolean
  hasImminent: boolean
}): 'live' | 'imminent' | 'idle' {
  if (input.hasLive) return 'live'
  if (input.hasImminent) return 'imminent'
  return 'idle'
}

export function pollMsForPhase(phase: 'live' | 'imminent' | 'idle'): number | false {
  if (phase === 'live') return livePollMs()
  if (phase === 'imminent') return imminentPollMs()
  return false
}

/** refetchInterval value for a query whose data is a list of matches. */
export function matchesPollMs(
  matches: ReadonlyArray<{ status: string; matchDate: string }> | undefined,
  now: number = Date.now(),
): number | false {
  const list = matches ?? []
  const hasLive = list.some((m) => m.status === 'live')
  const hasImminent = list.some(
    (m) => m.status === 'scheduled' && isImminentKickoff(m.matchDate, now),
  )
  return pollMsForPhase(pollPhase({ hasLive, hasImminent }))
}

/** refetchInterval value for a query whose data is a list of pools. */
export function poolsPollMs(
  pools: ReadonlyArray<{ hasLiveMatch: boolean; nextMatchAt: string | null }> | undefined,
  now: number = Date.now(),
): number | false {
  const list = pools ?? []
  const hasLive = list.some((p) => p.hasLiveMatch)
  const hasImminent = list.some(
    (p) => p.nextMatchAt !== null && isImminentKickoff(p.nextMatchAt, now),
  )
  return pollMsForPhase(pollPhase({ hasLive, hasImminent }))
}
