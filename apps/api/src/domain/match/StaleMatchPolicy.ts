/**
 * After 12 hours since kickoff, a match that the external feed still reports
 * as IN_PLAY/PAUSED is treated as finished by the domain. Encapsulates the
 * temporal business decision that used to live in `services/matchUtils.ts`.
 */
const MAX_LIVE_DURATION_MS = 12 * 60 * 60 * 1000

// A match held as live for lack of a winner is worth alerting an admin about once
// it is this far past kickoff — long enough to clear a normal 90'+extra-time+
// penalties finish (~2.5h) so the provider's winner almost always lands first.
const HELD_WINNER_ALERT_GRACE_MS = 3 * 60 * 60 * 1000

export const StaleMatchPolicy = {
  maxLiveDurationMs: MAX_LIVE_DURATION_MS,
  heldWinnerAlertGraceMs: HELD_WINNER_ALERT_GRACE_MS,

  isStaleSinceKickoff(kickoffAt: Date, now: Date): boolean {
    return now.getTime() - kickoffAt.getTime() > MAX_LIVE_DURATION_MS
  },

  /** True once a winnerless held match has been past kickoff long enough to alert. */
  isPastHeldWinnerAlertGrace(kickoffAt: Date, now: Date): boolean {
    return now.getTime() - kickoffAt.getTime() > HELD_WINNER_ALERT_GRACE_MS
  },
}
