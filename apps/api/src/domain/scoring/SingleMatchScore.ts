import { SCORING, SINGLE_MATCH_MAX_POINTS } from '@m5nita/shared'
import { Score } from './Score'

// Re-exported from the shared single source of truth so the front-end and the
// scoring policy share one definition of the single-match ceiling.
export { SINGLE_MATCH_MAX_POINTS }

export const SingleMatchScore = {
  /**
   * Single-match scoring: base category (Score.calculate) + a proximity bonus
   * capped at `SCORING.PROXIMITY_BONUS_CAP` points that rewards being numerically
   * close. Returns a `Score` VO with the breakdown attached so callers can both
   * treat it uniformly (`.points`) and inspect category/bonus when displaying.
   */
  calculate(
    predictedHome: number,
    predictedAway: number,
    actualHome: number,
    actualAway: number,
  ): Score {
    const category = Score.calculate(predictedHome, predictedAway, actualHome, actualAway).points
    const distance = computeDistance(predictedHome, predictedAway, actualHome, actualAway)
    const bonus = Math.max(0, SCORING.PROXIMITY_BONUS_CAP - distance)
    return Score.fromBreakdown({ category, bonus, distance, advanceBonus: 0 })
  },
}

function computeDistance(
  predictedHome: number,
  predictedAway: number,
  actualHome: number,
  actualAway: number,
): number {
  const predictedOutcome = Math.sign(predictedHome - predictedAway)
  const actualOutcome = Math.sign(actualHome - actualAway)
  const winnerInverted =
    predictedOutcome !== 0 && actualOutcome !== 0 && predictedOutcome !== actualOutcome

  const homeGoalsGap = Math.abs(predictedHome - actualHome)
  const awayGoalsGap = Math.abs(predictedAway - actualAway)

  if (!winnerInverted) return homeGoalsGap + awayGoalsGap

  // Winner inverted: on the column where the loser became the winner,
  // sum the goals instead of subtracting — this punishes flipping the result
  // more than a numerically-close-but-wrong prediction would otherwise show.
  const actualHomeWon = actualOutcome > 0
  if (actualHomeWon) {
    const awayColumnSum = predictedAway + actualAway
    return homeGoalsGap + awayColumnSum
  }
  const homeColumnSum = predictedHome + actualHome
  return homeColumnSum + awayGoalsGap
}
