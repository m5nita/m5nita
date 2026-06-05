import { describe, expect, it } from 'vitest'
import { Score } from './Score'

describe('Score', () => {
  describe('Score.calculate() — 5-tier scale on a decisive result (real 2-0)', () => {
    it('awards 10 for the exact score', () => {
      expect(Score.calculate(2, 0, 2, 0).points).toBe(10)
    })

    it('awards 8 for correct winner and the winner goal count (2-1)', () => {
      expect(Score.calculate(2, 1, 2, 0).points).toBe(8)
    })

    it('awards 7 for correct winner and goal difference (3-1)', () => {
      expect(Score.calculate(3, 1, 2, 0).points).toBe(7)
    })

    it('awards 5 for correct winner only (1-0)', () => {
      expect(Score.calculate(1, 0, 2, 0).points).toBe(5)
    })

    it('awards 5 for correct winner only with a different winner goal count (4-0)', () => {
      expect(Score.calculate(4, 0, 2, 0).points).toBe(5)
    })

    it('awards 0 for a draw prediction on a decisive result (0-0)', () => {
      expect(Score.calculate(0, 0, 2, 0).points).toBe(0)
    })

    it('awards 0 for the wrong winner (0-2)', () => {
      expect(Score.calculate(0, 2, 2, 0).points).toBe(0)
    })
  })

  describe('Score.calculate() — away win is symmetric (real 0-2)', () => {
    it('awards 8 for correct winner and away goal count (1-2)', () => {
      expect(Score.calculate(1, 2, 0, 2).points).toBe(8)
    })

    it('awards 7 for correct winner and difference (1-3)', () => {
      expect(Score.calculate(1, 3, 0, 2).points).toBe(7)
    })

    it('awards 5 for correct winner only (0-1)', () => {
      expect(Score.calculate(0, 1, 0, 2).points).toBe(5)
    })
  })

  describe('Score.calculate() — draws yield only 10 / 5 / 0 (real 1-1)', () => {
    it('awards 10 for the exact draw', () => {
      expect(Score.calculate(1, 1, 1, 1).points).toBe(10)
    })

    it('awards 5 for a non-exact draw (0-0)', () => {
      expect(Score.calculate(0, 0, 1, 1).points).toBe(5)
    })

    it('awards 5 for a non-exact draw (2-2)', () => {
      expect(Score.calculate(2, 2, 1, 1).points).toBe(5)
    })

    it('awards 0 for a decisive prediction on a draw (2-1)', () => {
      expect(Score.calculate(2, 1, 1, 1).points).toBe(0)
    })
  })

  describe('withAdvanceBonus', () => {
    it('adds the bonus and exposes it in the breakdown', () => {
      const s = Score.calculate(1, 1, 1, 1).withAdvanceBonus(2)
      expect(s.points).toBe(12)
      expect(s.breakdown?.advanceBonus).toBe(2)
      expect(s.breakdown?.category).toBe(10)
    })

    it('is a no-op for a zero bonus', () => {
      const s = Score.calculate(1, 1, 1, 1)
      expect(s.withAdvanceBonus(0)).toBe(s)
    })
  })

  describe('isExact', () => {
    it('is true for an exact match even with an advance bonus', () => {
      expect(Score.calculate(1, 1, 1, 1).withAdvanceBonus(2).isExact).toBe(true)
    })

    it('is false for a non-exact match', () => {
      expect(Score.calculate(3, 1, 2, 0).isExact).toBe(false)
    })
  })
})
