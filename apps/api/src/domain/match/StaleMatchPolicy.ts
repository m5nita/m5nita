/**
 * After 12 hours since kickoff, a match that the external feed still reports
 * as IN_PLAY/PAUSED is treated as finished by the domain. Encapsulates the
 * temporal business decision that used to live in `services/matchUtils.ts`.
 */
const MAX_LIVE_DURATION_MS = 12 * 60 * 60 * 1000

export const StaleMatchPolicy = {
  maxLiveDurationMs: MAX_LIVE_DURATION_MS,

  isStaleSinceKickoff(kickoffAt: Date, now: Date): boolean {
    return now.getTime() - kickoffAt.getTime() > MAX_LIVE_DURATION_MS
  },
}
