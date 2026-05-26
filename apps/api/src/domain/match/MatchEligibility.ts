import type { Clock } from '../shared/Clock'
import type { Match } from './Match'

export type SingleMatchPoolEligibility =
  | { ok: true; match: Match }
  | { ok: false; reason: 'not-found' | 'wrong-competition' | 'already-started' }

/**
 * Encapsulates the rules a match must satisfy to become the target of a
 * single-match pool. Used by `CreatePoolUseCase` so the use case doesn't
 * hand-roll `kickoffAt > now` or competition-id checks.
 */
export const MatchEligibility = {
  checkForSingleMatchPool(
    match: Match | null,
    expectedCompetitionId: string,
    clock: Clock,
  ): SingleMatchPoolEligibility {
    if (!match) return { ok: false, reason: 'not-found' }
    if (match.competitionId !== expectedCompetitionId) {
      return { ok: false, reason: 'wrong-competition' }
    }
    if (!match.canBeTargetOfSingleMatchPool(clock.now())) {
      return { ok: false, reason: 'already-started' }
    }
    return { ok: true, match }
  },
}
