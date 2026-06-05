import { SCORING } from '@m5nita/shared'
import { AdvanceBonus, type KnockoutContext } from './AdvanceBonus'
import { Score } from './Score'
import { SINGLE_MATCH_MAX_POINTS, SingleMatchScore } from './SingleMatchScore'

export type { KnockoutContext }

/**
 * Chooses the scoring algorithm a pool applies to each prediction. Range and
 * whole-competition pools share the same policy (`RangeScoringPolicy`);
 * single-match pools use `SingleMatchScoringPolicy` (category + proximity
 * bonus). Both add the advance bonus via `AdvanceBonus` when a knockout
 * context is supplied. Callers obtain the right policy from
 * `Pool.scoringPolicy()` — they never branch on scope themselves.
 */
export interface ScoringPolicy {
  score(
    predictedHome: number,
    predictedAway: number,
    actualHome: number,
    actualAway: number,
    knockout?: KnockoutContext,
  ): Score
  /** Maximum points obtainable on a single prediction under this policy (scoreline only, excluding the penalty bonus). */
  maxPoints(): number
}

export const RangeScoringPolicy: ScoringPolicy = {
  score(predictedHome, predictedAway, actualHome, actualAway, knockout) {
    const base = Score.calculate(predictedHome, predictedAway, actualHome, actualAway)
    return AdvanceBonus.apply(base, knockout)
  },
  maxPoints() {
    return SCORING.EXACT_MATCH
  },
}

export const SingleMatchScoringPolicy: ScoringPolicy = {
  score(predictedHome, predictedAway, actualHome, actualAway, knockout) {
    const base = SingleMatchScore.calculate(predictedHome, predictedAway, actualHome, actualAway)
    return AdvanceBonus.apply(base, knockout)
  },
  maxPoints() {
    return SINGLE_MATCH_MAX_POINTS
  },
}
