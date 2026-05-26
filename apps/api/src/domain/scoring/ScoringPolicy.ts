import { Score } from './Score'
import { SingleMatchScore } from './SingleMatchScore'

/**
 * Chooses the scoring algorithm a pool applies to each prediction. Range and
 * whole-competition pools share the same policy (`RangeScoringPolicy`);
 * single-match pools use `SingleMatchScoringPolicy` (category + proximity
 * bonus). Callers obtain the right policy from `Pool.scoringPolicy()` — they
 * never branch on scope themselves.
 */
export interface ScoringPolicy {
  score(predictedHome: number, predictedAway: number, actualHome: number, actualAway: number): Score
}

export const RangeScoringPolicy: ScoringPolicy = {
  score(predictedHome, predictedAway, actualHome, actualAway) {
    return Score.calculate(predictedHome, predictedAway, actualHome, actualAway)
  },
}

export const SingleMatchScoringPolicy: ScoringPolicy = {
  score(predictedHome, predictedAway, actualHome, actualAway) {
    return SingleMatchScore.calculate(predictedHome, predictedAway, actualHome, actualAway)
  },
}
