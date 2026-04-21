import { describe, expect, it } from 'vitest'
import { MatchdayRange } from './MatchdayRange'

describe('MatchdayRange', () => {
  describe('create()', () => {
    it('returns null when both values are null', () => {
      expect(MatchdayRange.create(null, null)).toBeNull()
    })

    it('throws when only from is null', () => {
      expect(() => MatchdayRange.create(null, 5)).toThrow(
        'Both from and to must be provided together',
      )
    })

    it('throws when only to is null', () => {
      expect(() => MatchdayRange.create(1, null)).toThrow(
        'Both from and to must be provided together',
      )
    })

    it('throws when from is greater than to', () => {
      expect(() => MatchdayRange.create(5, 3)).toThrow('from must be less than or equal to to')
    })

    it('creates a valid range', () => {
      const range = MatchdayRange.create(1, 5) as MatchdayRange
      expect(range.from).toBe(1)
      expect(range.to).toBe(5)
    })

    it('creates a range where from equals to', () => {
      const range = MatchdayRange.create(3, 3) as MatchdayRange
      expect(range.from).toBe(3)
      expect(range.to).toBe(3)
    })
  })

  describe('contains()', () => {
    const range = MatchdayRange.create(3, 7) as MatchdayRange

    it('returns true for a matchday inside the range', () => {
      expect(range.contains(5)).toBe(true)
    })

    it('returns true for the lower boundary', () => {
      expect(range.contains(3)).toBe(true)
    })

    it('returns true for the upper boundary', () => {
      expect(range.contains(7)).toBe(true)
    })

    it('returns false for a matchday below the range', () => {
      expect(range.contains(2)).toBe(false)
    })

    it('returns false for a matchday above the range', () => {
      expect(range.contains(8)).toBe(false)
    })
  })
})
