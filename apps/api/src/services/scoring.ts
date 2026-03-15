import { SCORING } from '@manita/shared'

export function calculatePoints(
  predictedHome: number,
  predictedAway: number,
  actualHome: number,
  actualAway: number,
): number {
  // Exact match
  if (predictedHome === actualHome && predictedAway === actualAway) {
    return SCORING.EXACT_MATCH
  }

  const predictedDiff = predictedHome - predictedAway
  const actualDiff = actualHome - actualAway

  // Correct winner + correct goal difference
  if (predictedDiff === actualDiff) {
    return SCORING.WINNER_AND_DIFF
  }

  // Correct winner (or both predicted draw and actual draw - handled above by diff)
  const predictedResult = Math.sign(predictedDiff)
  const actualResult = Math.sign(actualDiff)

  if (predictedResult === actualResult) {
    if (actualResult === 0) {
      return SCORING.DRAW_CORRECT
    }
    return SCORING.WINNER_CORRECT
  }

  return SCORING.MISS
}
