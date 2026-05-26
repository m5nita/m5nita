import { SCORING } from '@m5nita/shared'

export type ScoreBreakdown = {
  category: number
  bonus: number
  distance: number
}

export class Score {
  readonly points: number
  readonly breakdown: ScoreBreakdown | null

  private constructor(points: number, breakdown: ScoreBreakdown | null = null) {
    this.points = points
    this.breakdown = breakdown
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

  static fromBreakdown(breakdown: ScoreBreakdown): Score {
    return new Score(breakdown.category + breakdown.bonus, breakdown)
  }

  get isExact(): boolean {
    return this.points === SCORING.EXACT_MATCH
  }
}
