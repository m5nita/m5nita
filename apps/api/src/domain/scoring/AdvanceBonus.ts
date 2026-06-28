import { SCORING } from '@m5nita/shared'
import type { Score } from './Score'

/**
 * Context for the advance bonus on a knockout match. Built by callers from a
 * finished knockout match + the member's pick; `undefined` for non-knockout
 * matches. `pastRegularTime` is true when the match is in or past regular
 * time — settled in overtime, OR live in extra time.
 */
export type KnockoutContext = {
  /** True when the match is in or past regular time — settled in overtime, OR live in extra time. */
  pastRegularTime: boolean
  advancingSide: 'home' | 'away'
  predictedAdvance: 'home' | 'away' | null
}

export const AdvanceBonus = {
  /**
   * Adds the +2 bonus only when the match was settled past regular time
   * (extra time or penalties) and the member named the advancing side. Pure;
   * returns `score` unchanged otherwise.
   */
  apply(score: Score, knockout?: KnockoutContext): Score {
    if (!knockout?.pastRegularTime) return score
    if (knockout.predictedAdvance !== knockout.advancingSide) return score
    return score.withAdvanceBonus(SCORING.ADVANCE_BONUS)
  },
}
