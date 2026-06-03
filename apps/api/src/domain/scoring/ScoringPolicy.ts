import { SCORING } from '@m5nita/shared'
import { Score } from './Score'
import { SINGLE_MATCH_MAX_POINTS, SingleMatchScore } from './SingleMatchScore'

/**
 * Chooses the scoring algorithm a pool applies to each prediction. Range and
 * whole-competition pools share the same policy (`RangeScoringPolicy`);
 * single-match pools use `SingleMatchScoringPolicy` (category + proximity
 * bonus). Callers obtain the right policy from `Pool.scoringPolicy()` — they
 * never branch on scope themselves.
 */
export interface ScoringPolicy {
  score(predictedHome: number, predictedAway: number, actualHome: number, actualAway: number): Score
  /** Maximum points obtainable on a single prediction under this policy. */
  maxPoints(): number
}

export const RangeScoringPolicy: ScoringPolicy = {
  score(predictedHome, predictedAway, actualHome, actualAway) {
    return Score.calculate(predictedHome, predictedAway, actualHome, actualAway)
  },
  maxPoints() {
    return SCORING.EXACT_MATCH
  },
}

export const SingleMatchScoringPolicy: ScoringPolicy = {
  score(predictedHome, predictedAway, actualHome, actualAway) {
    return SingleMatchScore.calculate(predictedHome, predictedAway, actualHome, actualAway)
  },
  maxPoints() {
    return SINGLE_MATCH_MAX_POINTS
  },
}
