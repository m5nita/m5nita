import { describe, expect, it } from 'vitest'
import { type ImpactContext, PendingMatchImpactPolicy } from './PendingMatchImpactPolicy'

const matches = [
  {
    matchId: 'a',
    homeTeam: 'A',
    awayTeam: 'B',
    matchDate: new Date('2026-06-10T18:00:00Z'),
    hasPrediction: true,
  },
  {
    matchId: 'b',
    homeTeam: 'C',
    awayTeam: 'D',
    matchDate: new Date('2026-06-09T18:00:00Z'),
    hasPrediction: false,
  },
  {
    matchId: 'c',
    homeTeam: 'E',
    awayTeam: 'F',
    matchDate: new Date('2026-06-11T18:00:00Z'),
    hasPrediction: false,
  },
]

const ctx: ImpactContext = { viewerPoints: 30, memberPoints: [30, 28, 35, 10], maxPoints: 10 }

describe('PendingMatchImpactPolicy.rank', () => {
  it('includes_predicted_and_unpredicted_with_correct_action', () => {
    const r = PendingMatchImpactPolicy.rank(matches, ctx)
    expect(r).toHaveLength(3)
    expect(r.find((x) => x.matchId === 'a')?.action).toBe('change')
    expect(r.find((x) => x.matchId === 'b')?.action).toBe('submit')
  })

  it('orders_unpredicted_first_then_by_kickoff', () => {
    const r = PendingMatchImpactPolicy.rank(matches, ctx)
    // b (unpredicted, 06-09), c (unpredicted, 06-11), a (predicted, 06-10)
    expect(r.map((x) => x.matchId)).toEqual(['b', 'c', 'a'])
  })

  it('buckets_high_when_many_rivals_are_reachable', () => {
    // viewer 30, ±10 band [20,40]: 30,28,35 within (3) − self = 2 rivals; denom 3 → 0.67
    const top = PendingMatchImpactPolicy.rank(matches, ctx)[0]
    expect(top?.impact).toBe('high')
    expect(top?.reachableRivals).toBe(2)
    expect(top?.pointsAtStake).toBe(10)
  })

  it('buckets_low_when_no_rivals_are_reachable', () => {
    const lonely: ImpactContext = { viewerPoints: 100, memberPoints: [100, 10, 5], maxPoints: 10 }
    expect(PendingMatchImpactPolicy.rank(matches, lonely)[0]?.impact).toBe('low')
  })

  it('returns_kickoff_iso_and_never_exposes_prediction_data', () => {
    const r = PendingMatchImpactPolicy.rank(matches, ctx)
    expect(r[0]?.kickoff).toBe('2026-06-09T18:00:00.000Z')
    // Output carries only the viewer's own hasPrediction flag — no scores/predictions.
    for (const item of r) {
      expect(Object.keys(item).sort()).toEqual(
        [
          'action',
          'awayTeam',
          'hasPrediction',
          'homeTeam',
          'impact',
          'kickoff',
          'matchId',
          'pointsAtStake',
          'reachableRivals',
        ].sort(),
      )
    }
  })

  it('handles_empty_pending_list', () => {
    expect(PendingMatchImpactPolicy.rank([], ctx)).toEqual([])
  })
})
