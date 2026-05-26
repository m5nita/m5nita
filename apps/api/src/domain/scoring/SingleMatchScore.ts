import { Score } from './Score'

const BONUS_CAP = 4

export type SingleMatchScoreBreakdown = {
  category: number
  bonus: number
  distance: number
  total: number
}

export const SingleMatchScore = {
  calculate(
    predictedHome: number,
    predictedAway: number,
    actualHome: number,
    actualAway: number,
  ): SingleMatchScoreBreakdown {
    const category = Score.calculate(predictedHome, predictedAway, actualHome, actualAway).points
    const distance = computeDistance(predictedHome, predictedAway, actualHome, actualAway)
    const bonus = Math.max(0, BONUS_CAP - distance)
    return { category, bonus, distance, total: category + bonus }
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
