import { SCORING } from '@m5nita/shared'

export class Score {
  readonly points: number

  private constructor(points: number) {
    this.points = points
  }

  static calculate(
    predictedHome: number,
    predictedAway: number,
    actualHome: number,
    actualAway: number,
  ): Score {
    if (predictedHome === actualHome && predictedAway === actualAway) {
      return new Score(SCORING.EXACT_MATCH)
    }
    const predictedDiff = predictedHome - predictedAway
    const actualDiff = actualHome - actualAway
    if (predictedDiff === actualDiff && predictedDiff !== 0) {
      return new Score(SCORING.WINNER_AND_DIFF)
    }
    const predictedResult = Math.sign(predictedDiff)
    const actualResult = Math.sign(actualDiff)
    if (predictedResult === actualResult) {
      return new Score(SCORING.OUTCOME_CORRECT)
    }
    return new Score(SCORING.MISS)
  }

  get isExact(): boolean {
    return this.points === SCORING.EXACT_MATCH
  }
}
