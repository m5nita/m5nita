import { describe, expect, it } from 'vitest'
import { SingleMatchScore } from './SingleMatchScore'

function brk(s: ReturnType<typeof SingleMatchScore.calculate>) {
  if (!s.breakdown) throw new Error('SingleMatchScore must include a breakdown')
  return { ...s.breakdown, total: s.points }
}

describe('SingleMatchScore', () => {
  describe('category points (unchanged from Score)', () => {
    it('awards 10 + 4 bonus for exact match (total 14)', () => {
      const s = brk(SingleMatchScore.calculate(2, 1, 2, 1))
      expect(s.category).toBe(10)
      expect(s.bonus).toBe(4)
      expect(s.total).toBe(14)
      expect(s.distance).toBe(0)
    })

    it('awards 7 + bonus for correct winner and goal difference', () => {
      const s = brk(SingleMatchScore.calculate(3, 2, 2, 1))
      expect(s.category).toBe(7)
      expect(s.distance).toBe(2)
      expect(s.bonus).toBe(2)
      expect(s.total).toBe(9)
    })

    it('awards 5 + bonus for correct winner only', () => {
      const s = brk(SingleMatchScore.calculate(3, 1, 2, 1))
      expect(s.category).toBe(5)
      expect(s.distance).toBe(1)
      expect(s.bonus).toBe(3)
      expect(s.total).toBe(8)
    })

    it('awards 5 + bonus for draw without exact score', () => {
      const s = brk(SingleMatchScore.calculate(1, 1, 0, 0))
      expect(s.category).toBe(5)
      expect(s.distance).toBe(2)
      expect(s.bonus).toBe(2)
      expect(s.total).toBe(7)
    })

    it('awards 3 bonus for distance=1 on winner-only outcome', () => {
      const s = brk(SingleMatchScore.calculate(4, 0, 3, 0))
      expect(s.category).toBe(5)
      expect(s.distance).toBe(1)
      expect(s.bonus).toBe(3)
      expect(s.total).toBe(8)
    })

    it('awards 5 + 0 bonus for correct winner with distance >= 4', () => {
      const s = brk(SingleMatchScore.calculate(1, 0, 4, 2))
      expect(s.category).toBe(5)
      expect(s.distance).toBe(5)
      expect(s.bonus).toBe(0)
      expect(s.total).toBe(5)
    })
  })

  describe('distance — signed-sum on winner inversion', () => {
    it('predicts away wins when real is home wins: sums the away column', () => {
      const s = brk(SingleMatchScore.calculate(1, 2, 2, 1))
      expect(s.category).toBe(0)
      expect(s.distance).toBe(4)
      expect(s.bonus).toBe(0)
      expect(s.total).toBe(0)
    })

    it('predicts home wins when real is away wins: sums the home column', () => {
      const s = brk(SingleMatchScore.calculate(2, 1, 1, 2))
      expect(s.category).toBe(0)
      expect(s.distance).toBe(4)
      expect(s.bonus).toBe(0)
      expect(s.total).toBe(0)
    })

    it('inversion with high enough distance zeros bonus', () => {
      const s = brk(SingleMatchScore.calculate(0, 1, 2, 1))
      expect(s.category).toBe(0)
      expect(s.distance).toBe(4)
      expect(s.bonus).toBe(0)
      expect(s.total).toBe(0)
    })

    it('inversion with small goal counts can still earn a small bonus', () => {
      const s = brk(SingleMatchScore.calculate(0, 1, 1, 0))
      expect(s.category).toBe(0)
      expect(s.distance).toBe(2)
      expect(s.bonus).toBe(2)
      expect(s.total).toBe(2)
    })

    it('high-scoring inversion has large distance', () => {
      const s = brk(SingleMatchScore.calculate(3, 5, 5, 3))
      expect(s.distance).toBe(10)
      expect(s.total).toBe(0)
    })
  })

  describe('wrong-winner without inversion (predicted draw, real winner)', () => {
    it('predicted draw, real home wins: uses absolute distance', () => {
      const s = brk(SingleMatchScore.calculate(1, 1, 2, 1))
      expect(s.category).toBe(0)
      expect(s.distance).toBe(1)
      expect(s.bonus).toBe(3)
      expect(s.total).toBe(3)
    })

    it('predicted home wins, real draw: uses absolute distance', () => {
      const s = brk(SingleMatchScore.calculate(1, 0, 0, 0))
      expect(s.category).toBe(0)
      expect(s.distance).toBe(1)
      expect(s.bonus).toBe(3)
      expect(s.total).toBe(3)
    })
  })

  describe('hierarchy guarantee', () => {
    it('any wrong-winner total is strictly less than any correct-winner total', () => {
      const worstCorrectWinner = SingleMatchScore.calculate(9, 0, 2, 1)
      const bestWrongWinner = SingleMatchScore.calculate(1, 1, 2, 1)
      expect(bestWrongWinner.points).toBeLessThan(worstCorrectWinner.points)
    })
  })
})
