import { describe, expect, it } from 'vitest'
import type { KnockoutContext } from './AdvanceBonus'
import { RangeScoringPolicy, SingleMatchScoringPolicy } from './ScoringPolicy'

const overtimeHomeAdvances: KnockoutContext = {
  decidedInOvertime: true,
  advancingSide: 'home',
  predictedAdvance: 'home',
}

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

describe('RangeScoringPolicy — new scale + advance bonus', () => {
  it('awards 8 for winner + winner goals', () => {
    expect(RangeScoringPolicy.score(2, 1, 2, 0).points).toBe(8)
  })

  it('adds +2 when settled in overtime and the advance pick is correct', () => {
    const s = RangeScoringPolicy.score(1, 1, 1, 1, overtimeHomeAdvances)
    expect(s.points).toBe(12)
    expect(s.breakdown?.advanceBonus).toBe(2)
  })

  it('does not add the bonus without a knockout context', () => {
    expect(RangeScoringPolicy.score(1, 1, 1, 1).points).toBe(10)
  })
})

describe('SingleMatchScoringPolicy — advance bonus stacks', () => {
  it('stacks the advance bonus on top of category + proximity bonus', () => {
    const s = SingleMatchScoringPolicy.score(1, 1, 1, 1, overtimeHomeAdvances)
    expect(s.breakdown?.category).toBe(10)
    expect(s.breakdown?.bonus).toBe(4)
    expect(s.breakdown?.advanceBonus).toBe(2)
    expect(s.points).toBe(16)
  })

  it('omits the bonus when the match stayed in regular time', () => {
    const s = SingleMatchScoringPolicy.score(1, 1, 1, 1, {
      ...overtimeHomeAdvances,
      decidedInOvertime: false,
    })
    expect(s.breakdown?.advanceBonus).toBe(0)
    expect(s.points).toBe(14)
  })
})
