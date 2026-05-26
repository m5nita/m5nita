import { describe, expect, it } from 'vitest'
import { SingleMatchScore } from './SingleMatchScore'

describe('SingleMatchScore', () => {
  describe('category points (unchanged from Score)', () => {
    it('awards 10 + 4 bonus for exact match (total 14)', () => {
      const s = SingleMatchScore.calculate(2, 1, 2, 1)
      expect(s.category).toBe(10)
      expect(s.bonus).toBe(4)
      expect(s.total).toBe(14)
      expect(s.distance).toBe(0)
    })

    it('awards 7 + bonus for correct winner and goal difference', () => {
      // real 2x1, pred 3x2 → diff correct, dist=2
      const s = SingleMatchScore.calculate(3, 2, 2, 1)
      expect(s.category).toBe(7)
      expect(s.distance).toBe(2)
      expect(s.bonus).toBe(2)
      expect(s.total).toBe(9)
    })

    it('awards 5 + bonus for correct winner only', () => {
      // real 2x1, pred 3x1 → winner correct, dist=1
      const s = SingleMatchScore.calculate(3, 1, 2, 1)
      expect(s.category).toBe(5)
      expect(s.distance).toBe(1)
      expect(s.bonus).toBe(3)
      expect(s.total).toBe(8)
    })

    it('awards 5 + bonus for draw without exact score', () => {
      // real 0x0, pred 1x1 → draw correct, dist=2
      const s = SingleMatchScore.calculate(1, 1, 0, 0)
      expect(s.category).toBe(5)
      expect(s.distance).toBe(2)
      expect(s.bonus).toBe(2)
      expect(s.total).toBe(7)
    })

    it('awards 3 bonus for distance=1 on winner-only outcome', () => {
      const s = SingleMatchScore.calculate(4, 0, 3, 0)
      expect(s.category).toBe(5)
      expect(s.distance).toBe(1)
      expect(s.bonus).toBe(3)
      expect(s.total).toBe(8)
    })

    it('awards 5 + 0 bonus for correct winner with distance >= 4', () => {
      // real 4x2 (home wins), pred 1x0 (home wins) → category 5, dist=5, bonus 0
      const s = SingleMatchScore.calculate(1, 0, 4, 2)
      expect(s.category).toBe(5)
      expect(s.distance).toBe(5)
      expect(s.bonus).toBe(0)
      expect(s.total).toBe(5)
    })
  })

  describe('distance — signed-sum on winner inversion', () => {
    it('predicts away wins when real is home wins: sums the away column', () => {
      // real 2x1 (home wins), pred 1x2 (away wins, inverted)
      // home: |2-1|=1, away: 1+2=3, total=4 → bonus 0
      const s = SingleMatchScore.calculate(1, 2, 2, 1)
      expect(s.category).toBe(0)
      expect(s.distance).toBe(4)
      expect(s.bonus).toBe(0)
      expect(s.total).toBe(0)
    })

    it('predicts home wins when real is away wins: sums the home column', () => {
      // real 1x2 (away wins), pred 2x1 (home wins, inverted)
      // home: 1+2=3, away: |2-1|=1, total=4 → bonus 0
      const s = SingleMatchScore.calculate(2, 1, 1, 2)
      expect(s.category).toBe(0)
      expect(s.distance).toBe(4)
      expect(s.bonus).toBe(0)
      expect(s.total).toBe(0)
    })

    it('inversion with high enough distance zeros bonus', () => {
      // real 2x1 (home wins), pred 0x1 (away wins, inverted)
      // home: |0-2|=2, away: 1+1=2, total dist=4 → bonus 0
      const s = SingleMatchScore.calculate(0, 1, 2, 1)
      expect(s.category).toBe(0)
      expect(s.distance).toBe(4)
      expect(s.bonus).toBe(0)
      expect(s.total).toBe(0)
    })

    it('inversion with small goal counts can still earn a small bonus', () => {
      // real 1x0 (home wins), pred 0x1 (away wins, inverted)
      // home: |0-1|=1, away: 1+0=1, total dist=2 → bonus 2, total 2
      const s = SingleMatchScore.calculate(0, 1, 1, 0)
      expect(s.category).toBe(0)
      expect(s.distance).toBe(2)
      expect(s.bonus).toBe(2)
      expect(s.total).toBe(2)
    })

    it('high-scoring inversion has large distance', () => {
      // real 5x3, pred 3x5 (inverted)
      // home: |5-3|=2, away: 3+5=8, total=10
      const s = SingleMatchScore.calculate(3, 5, 5, 3)
      expect(s.distance).toBe(10)
      expect(s.total).toBe(0)
    })
  })

  describe('wrong-winner without inversion (predicted draw, real winner)', () => {
    it('predicted draw, real home wins: uses absolute distance', () => {
      // real 2x1, pred 1x1 → draw vs home win, no inversion
      // dist = |2-1| + |1-1| = 1
      const s = SingleMatchScore.calculate(1, 1, 2, 1)
      expect(s.category).toBe(0)
      expect(s.distance).toBe(1)
      expect(s.bonus).toBe(3)
      expect(s.total).toBe(3)
    })

    it('predicted home wins, real draw: uses absolute distance', () => {
      // real 0x0, pred 1x0 → home win vs draw, no inversion (real has no winner to invert)
      // dist = |0-1| + |0-0| = 1
      const s = SingleMatchScore.calculate(1, 0, 0, 0)
      expect(s.category).toBe(0)
      expect(s.distance).toBe(1)
      expect(s.bonus).toBe(3)
      expect(s.total).toBe(3)
    })
  })

  describe('hierarchy guarantee', () => {
    it('any wrong-winner total is strictly less than any correct-winner total', () => {
      // real 2x1
      const worstCorrectWinner = SingleMatchScore.calculate(9, 0, 2, 1) // winner only, dist=8 → 5+0=5
      const bestWrongWinner = SingleMatchScore.calculate(1, 1, 2, 1) // draw close, dist=1 → 0+3=3
      expect(bestWrongWinner.total).toBeLessThan(worstCorrectWinner.total)
    })
  })
})
