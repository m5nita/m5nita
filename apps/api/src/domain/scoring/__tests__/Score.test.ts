import { describe, expect, it } from 'vitest'
import { Score } from '../Score'

describe('Score', () => {
  describe('Score.calculate()', () => {
    it('awards 10 points for exact match', () => {
      const score = Score.calculate(2, 1, 2, 1)
      expect(score.points).toBe(10)
    })

    it('awards 7 points for correct winner and goal difference', () => {
      const score = Score.calculate(3, 1, 2, 0)
      expect(score.points).toBe(7)
    })

    it('awards 5 points for draw with different scores (diff=0 excluded from winner+diff)', () => {
      const score = Score.calculate(1, 1, 0, 0)
      expect(score.points).toBe(5)
    })

    it('awards 5 points for correct outcome only', () => {
      const score = Score.calculate(1, 0, 3, 1)
      expect(score.points).toBe(5)
    })

    it('awards 0 points for a miss', () => {
      const score = Score.calculate(1, 0, 0, 2)
      expect(score.points).toBe(0)
    })
  })

  describe('isExact', () => {
    it('returns true for exact match', () => {
      const score = Score.calculate(2, 1, 2, 1)
      expect(score.isExact).toBe(true)
    })

    it('returns false for non-exact match', () => {
      const score = Score.calculate(3, 1, 2, 0)
      expect(score.isExact).toBe(false)
    })
  })
})
