import { SCORING } from '@m5nita/shared'

export type ScoreBreakdown = {
  category: number
  bonus: number
  distance: number
  advanceBonus: number
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
    return new Score(categoryPoints(predictedHome, predictedAway, actualHome, actualAway))
  }

  static fromBreakdown(breakdown: ScoreBreakdown): Score {
    return new Score(breakdown.category + breakdown.bonus + breakdown.advanceBonus, breakdown)
  }

  /** Returns a new Score with `amount` added as the advance bonus. */
  withAdvanceBonus(amount: number): Score {
    if (amount === 0) return this
    const base = this.breakdown ?? emptyBreakdown(this.points)
    return Score.fromBreakdown({ ...base, advanceBonus: base.advanceBonus + amount })
  }

  get isExact(): boolean {
    const category = this.breakdown?.category ?? this.points
    return category === SCORING.EXACT_MATCH
  }
}

function emptyBreakdown(category: number): ScoreBreakdown {
  return { category, bonus: 0, distance: 0, advanceBonus: 0 }
}

/**
 * The scoreline category, evaluated as an ordered ladder:
 * exact → winner + winner's goals → winner + goal difference → result → miss.
 * Draws can only reach exact (10), correct-draw (5), or miss (0).
 */
function categoryPoints(ph: number, pa: number, ah: number, aa: number): number {
  if (ph === ah && pa === aa) return SCORING.EXACT_MATCH
  if (!sameDecisiveWinner(ph, pa, ah, aa)) {
    return isDraw(ph, pa) && isDraw(ah, aa) ? SCORING.OUTCOME_CORRECT : SCORING.MISS
  }
  if (winnerGoalsMatch(ph, pa, ah, aa)) return SCORING.WINNER_AND_WINNER_GOALS
  if (ph - pa === ah - aa) return SCORING.WINNER_AND_DIFF
  return SCORING.OUTCOME_CORRECT
}

function isDraw(home: number, away: number): boolean {
  return home === away
}

function sameDecisiveWinner(ph: number, pa: number, ah: number, aa: number): boolean {
  const predicted = Math.sign(ph - pa)
  const actual = Math.sign(ah - aa)
  return predicted === actual && actual !== 0
}

/** Caller guarantees the same decisive winner; compares the winner's goal count. */
function winnerGoalsMatch(ph: number, pa: number, ah: number, aa: number): boolean {
  const homeWon = ah - aa > 0
  const predictedWinnerGoals = homeWon ? ph : pa
  const actualWinnerGoals = homeWon ? ah : aa
  return predictedWinnerGoals === actualWinnerGoals
}
