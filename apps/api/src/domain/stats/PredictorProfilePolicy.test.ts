import { describe, expect, it } from 'vitest'
import { PredictorProfilePolicy } from './PredictorProfilePolicy'
import type { ProfileFactRow } from './StatsRepository.port'

// predHome, predAway, actualHome, actualAway, points
function fact(ph: number, pa: number, ah: number, aa: number, points = 0): ProfileFactRow {
  return { predHome: ph, predAway: pa, actualHome: ah, actualAway: aa, points }
}

const MAX = 10

describe('PredictorProfilePolicy.build', () => {
  it('empty_facts_all_cards_null_and_insufficient', () => {
    const b = PredictorProfilePolicy.build([], MAX)
    expect(b.drawBlindness).toBeNull()
    expect(b.nearMiss).toBeNull()
    expect(b.goalCalibration).toBeNull()
    expect(b.goalType).toBeNull()
    expect(b.state).toBe('insufficient_data')
  })

  it('state_ok_when_any_card_present', () => {
    // One off-by-one (near-miss) among 2 finished → only nearMiss qualifies.
    const facts = [fact(2, 1, 2, 2, 0), fact(0, 0, 0, 0, 10)]
    const b = PredictorProfilePolicy.build(facts, MAX)
    expect(b.nearMiss).not.toBeNull()
    expect(b.goalType).toBeNull() // < 4 finished
    expect(b.state).toBe('ok')
  })

  it('draw_blindness_shown_when_under_predicting_with_enough_games', () => {
    // 10 games: you predict a draw once (10%); 4 ended drawn (40%).
    const facts: ProfileFactRow[] = [
      fact(1, 1, 1, 1), // your draw + real draw
      fact(2, 0, 0, 0), // real draw, you didn't
      fact(2, 1, 1, 1), // real draw, you didn't
      fact(3, 1, 2, 2), // real draw, you didn't
      fact(2, 0, 2, 0),
      fact(3, 1, 3, 1),
      fact(1, 0, 1, 0),
      fact(2, 1, 2, 1),
      fact(0, 2, 0, 2),
      fact(3, 0, 3, 0),
    ]
    const b = PredictorProfilePolicy.build(facts, MAX)
    expect(b.drawBlindness).not.toBeNull()
    expect(b.drawBlindness?.yourCount).toBe(1)
    expect(b.drawBlindness?.realCount).toBe(4)
    expect(b.drawBlindness?.yourRate).toBeCloseTo(0.1)
    expect(b.drawBlindness?.realRate).toBeCloseTo(0.4)
  })

  it('draw_blindness_hidden_when_not_under_predicting', () => {
    // You predict draws as often as they happen → no blind spot.
    const facts = Array.from({ length: 10 }, (_, i) =>
      i < 4 ? fact(1, 1, 1, 1) : fact(2, 0, 2, 0),
    )
    expect(PredictorProfilePolicy.build(facts, MAX).drawBlindness).toBeNull()
  })

  it('draw_blindness_hidden_below_minimum_games', () => {
    const facts = Array.from({ length: 7 }, (_, i) => (i < 3 ? fact(2, 0, 0, 0) : fact(1, 0, 1, 0)))
    expect(PredictorProfilePolicy.build(facts, MAX).drawBlindness).toBeNull()
  })

  it('near_miss_counts_off_by_one_and_recoverable_points', () => {
    const facts = [
      fact(2, 1, 2, 2, 0), // off by 1 (away), result wrong → recover 10
      fact(1, 0, 2, 0, 7), // off by 1 (home), result right → recover 3
      fact(0, 0, 0, 0, 10), // exact → excluded
      fact(0, 0, 2, 0, 0), // off by 2 → excluded
    ]
    const b = PredictorProfilePolicy.build(facts, MAX)
    expect(b.nearMiss?.count).toBe(2)
    expect(b.nearMiss?.points).toBe(13) // (10-0) + (10-7)
  })

  it('near_miss_hidden_when_none', () => {
    const facts = [fact(0, 0, 0, 0, 10), fact(0, 0, 2, 0, 0)]
    expect(PredictorProfilePolicy.build(facts, MAX).nearMiss).toBeNull()
  })

  it('goal_calibration_flags_inflation', () => {
    // your avg total 3.0, real avg total 2.0 → inflate
    const facts = Array.from({ length: 6 }, () => fact(2, 1, 1, 1))
    const b = PredictorProfilePolicy.build(facts, MAX)
    expect(b.goalCalibration?.yourAvg).toBeCloseTo(3)
    expect(b.goalCalibration?.realAvg).toBeCloseTo(2)
    expect(b.goalCalibration?.lean).toBe('inflate')
  })

  it('goal_calibration_flags_economy', () => {
    const facts = Array.from({ length: 6 }, () => fact(1, 1, 2, 1))
    expect(PredictorProfilePolicy.build(facts, MAX).goalCalibration?.lean).toBe('economize')
  })

  it('goal_calibration_calibrated_within_margin', () => {
    const facts = Array.from({ length: 6 }, () => fact(1, 1, 2, 0)) // both total 2
    expect(PredictorProfilePolicy.build(facts, MAX).goalCalibration?.lean).toBe('calibrated')
  })

  it('goal_calibration_hidden_below_minimum_games', () => {
    const facts = Array.from({ length: 5 }, () => fact(2, 1, 1, 1))
    expect(PredictorProfilePolicy.build(facts, MAX).goalCalibration).toBeNull()
  })

  it('signature_scoreline_shown_when_repeated', () => {
    const facts = [
      fact(2, 1, 2, 1),
      fact(2, 1, 1, 0),
      fact(2, 1, 0, 0),
      fact(1, 0, 1, 0),
      fact(0, 0, 0, 0),
      fact(3, 1, 3, 1),
      fact(1, 2, 1, 2),
      fact(2, 2, 2, 2),
    ]
    const sig = PredictorProfilePolicy.build(facts, MAX).goalCalibration?.signature
    expect(sig?.home).toBe(2)
    expect(sig?.away).toBe(1)
    expect(sig?.sharePct).toBeCloseTo(3 / 8)
  })

  it('signature_hidden_when_predictions_are_spread', () => {
    const facts = [
      fact(1, 0, 1, 0),
      fact(2, 0, 2, 0),
      fact(0, 1, 0, 1),
      fact(2, 1, 2, 1),
      fact(3, 0, 3, 0),
      fact(0, 2, 0, 2),
    ]
    const b = PredictorProfilePolicy.build(facts, MAX)
    expect(b.goalCalibration).not.toBeNull() // card still shows (>= 6 games)
    expect(b.goalCalibration?.signature).toBeNull()
  })

  it('goal_type_better_at_low_scoring_games', () => {
    const facts = [
      // low (total <= 2), all result-correct
      fact(1, 0, 1, 0),
      fact(0, 1, 0, 2),
      fact(1, 1, 0, 0),
      // high (total > 2), all result-wrong
      fact(0, 2, 3, 1),
      fact(0, 1, 2, 1),
      fact(1, 0, 1, 3),
    ]
    const gt = PredictorProfilePolicy.build(facts, MAX).goalType
    expect(gt?.low.pct).toBeCloseTo(1)
    expect(gt?.high.pct).toBeCloseTo(0)
    expect(gt?.betterAt).toBe('low')
  })

  it('goal_type_betterAt_null_when_gap_small', () => {
    const facts = [
      // low: 2/3 correct
      fact(1, 0, 1, 0),
      fact(0, 1, 0, 1),
      fact(1, 1, 2, 0),
      // high: 2/3 correct → same accuracy, gap under the margin
      fact(2, 0, 3, 1),
      fact(0, 2, 1, 3),
      fact(1, 1, 3, 0),
    ]
    const gt = PredictorProfilePolicy.build(facts, MAX).goalType
    expect(gt?.low.total).toBe(3)
    expect(gt?.high.total).toBe(3)
    expect(gt?.betterAt).toBeNull()
  })

  it('goal_type_hidden_below_four_games', () => {
    const facts = [fact(1, 0, 1, 0), fact(0, 2, 1, 3), fact(2, 0, 2, 0)]
    expect(PredictorProfilePolicy.build(facts, MAX).goalType).toBeNull()
  })
})
