import { describe, expect, it } from 'vitest'
import { RangeScoringPolicy, SingleMatchScoringPolicy } from './ScoringPolicy'

describe('ScoringPolicy.maxPoints', () => {
  it('range_policy_max_is_10', () => {
    expect(RangeScoringPolicy.maxPoints()).toBe(10)
  })

  it('single_match_policy_max_is_14', () => {
    expect(SingleMatchScoringPolicy.maxPoints()).toBe(14)
  })

  it('range_max_equals_best_achievable_score', () => {
    const best = RangeScoringPolicy.score(2, 1, 2, 1).points
    expect(best).toBe(10)
    expect(best).toBeLessThanOrEqual(RangeScoringPolicy.maxPoints())
  })

  it('single_match_max_equals_best_achievable_score', () => {
    // exact prediction → category 10 + full proximity bonus 4 = 14 (the cap)
    const best = SingleMatchScoringPolicy.score(2, 1, 2, 1).points
    expect(best).toBe(14)
    expect(best).toBeLessThanOrEqual(SingleMatchScoringPolicy.maxPoints())
  })
})
