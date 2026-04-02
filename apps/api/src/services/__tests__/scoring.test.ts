import { SCORING } from '@m5nita/shared'
import { describe, expect, it } from 'vitest'
import { calculatePoints } from '../scoring'

describe('calculatePoints', () => {
  it('exactMatch_sameScore_returns10', () => {
    expect(calculatePoints(2, 1, 2, 1)).toBe(SCORING.EXACT_MATCH)
    expect(calculatePoints(0, 0, 0, 0)).toBe(SCORING.EXACT_MATCH)
    expect(calculatePoints(3, 3, 3, 3)).toBe(SCORING.EXACT_MATCH)
  })

  it('winnerAndDiff_correctDifference_returns7', () => {
    // Predicted 3-1 (diff +2), Actual 2-0 (diff +2)
    expect(calculatePoints(3, 1, 2, 0)).toBe(SCORING.WINNER_AND_DIFF)
    // Predicted 0-2 (diff -2), Actual 1-3 (diff -2)
    expect(calculatePoints(0, 2, 1, 3)).toBe(SCORING.WINNER_AND_DIFF)
  })

  it('winnerCorrect_wrongScore_returns5', () => {
    // Predicted 2-0 (home win), Actual 1-0 (home win, diff differs)
    expect(calculatePoints(2, 0, 1, 0)).toBe(SCORING.WINNER_CORRECT)
    // Predicted 0-1 (away win), Actual 0-3 (away win)
    expect(calculatePoints(0, 1, 0, 3)).toBe(SCORING.WINNER_CORRECT)
  })

  it('drawCorrect_wrongScore_returnsWinnerAndDiff', () => {
    // Predicted 1-1, Actual 0-0 — both draws, diff=0 always matches
    expect(calculatePoints(1, 1, 0, 0)).toBe(SCORING.WINNER_AND_DIFF)
    // Predicted 2-2, Actual 3-3 — both draws, diff=0 always matches
    expect(calculatePoints(2, 2, 3, 3)).toBe(SCORING.WINNER_AND_DIFF)
    // Predicted 0-0, Actual 4-4
    expect(calculatePoints(0, 0, 4, 4)).toBe(SCORING.WINNER_AND_DIFF)
  })

  it('miss_wrongEverything_returns0', () => {
    // Predicted home win, Actual away win
    expect(calculatePoints(2, 0, 0, 1)).toBe(SCORING.MISS)
    // Predicted draw, Actual home win
    expect(calculatePoints(1, 1, 2, 0)).toBe(SCORING.MISS)
    // Predicted away win, Actual draw
    expect(calculatePoints(0, 2, 1, 1)).toBe(SCORING.MISS)
  })

  it('edgeCase_highScores_calculatesCorrectly', () => {
    expect(calculatePoints(5, 5, 5, 5)).toBe(SCORING.EXACT_MATCH)
    expect(calculatePoints(7, 1, 7, 1)).toBe(SCORING.EXACT_MATCH)
    expect(calculatePoints(0, 0, 1, 1)).toBe(SCORING.WINNER_AND_DIFF)
  })

  it('edgeCase_zeroZero_exactMatch', () => {
    expect(calculatePoints(0, 0, 0, 0)).toBe(SCORING.EXACT_MATCH)
  })

  it('edgeCase_sameDiffDifferentWinner_returns7not5', () => {
    // Predicted 2-1 (diff +1), Actual 3-2 (diff +1) — same winner, same diff
    expect(calculatePoints(2, 1, 3, 2)).toBe(SCORING.WINNER_AND_DIFF)
  })
})
