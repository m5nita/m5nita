import { SCORING } from '@m5nita/shared'
import { Score } from './Score'

const BONUS_CAP = 4

/** Max points obtainable on a single-match prediction: exact (10) + full bonus (4). */
export const SINGLE_MATCH_MAX_POINTS = SCORING.EXACT_MATCH + BONUS_CAP

export const SingleMatchScore = {
  /**
   * Single-match scoring: base category (Score.calculate) + a proximity bonus
   * capped at 4 points that rewards being numerically close. Returns a `Score`
   * VO with the breakdown attached so callers can both treat it uniformly
   * (`.points`) and inspect category/bonus when displaying.
   */
  calculate(
    predictedHome: number,
    predictedAway: number,
    actualHome: number,
    actualAway: number,
  ): Score {
    const category = Score.calculate(predictedHome, predictedAway, actualHome, actualAway).points
    const distance = computeDistance(predictedHome, predictedAway, actualHome, actualAway)
    const bonus = Math.max(0, BONUS_CAP - distance)
    return Score.fromBreakdown({ category, bonus, distance })
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
