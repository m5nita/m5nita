import { describe, expect, it } from 'vitest'
import { RangeScoringPolicy, SingleMatchScoringPolicy } from '../scoring/ScoringPolicy'
import { ParticipantPoolStats } from './ParticipantPoolStats'
import type { ParticipantStatsRow, PoolStatsAggregateRow } from './StatsRepository.port'

function viewer(over: Partial<ParticipantStatsRow> = {}): ParticipantStatsRow {
  return {
    finishedCount: 10,
    exactCount: 3,
    resultCount: 7,
    pointsTotal: 50,
    homeCorrect: 4,
    homeTotal: 5,
    awayCorrect: 2,
    awayTotal: 4,
    lowGoalsCorrect: 5,
    lowGoalsTotal: 6,
    highGoalsCorrect: 1,
    highGoalsTotal: 4,
    position: 2,
    prevPosition: 4,
    ...over,
  }
}

const aggregate: PoolStatsAggregateRow[] = [
  { userId: 'a', finishedCount: 10, exactCount: 5, resultCount: 9, pointsTotal: 80 },
  { userId: 'me', finishedCount: 10, exactCount: 3, resultCount: 7, pointsTotal: 50 },
]

describe('ParticipantPoolStats.build', () => {
  it('block_a_hit_rate_vs_average_and_leader', () => {
    const b = ParticipantPoolStats.build({
      viewer: viewer(),
      aggregate,
      rounds: [{ matchday: 1, points: 20 }],
      scoringPolicy: RangeScoringPolicy,
    })
    expect(b.hitRateVsAverage.exactPct.you).toBeCloseTo(0.3)
    expect(b.hitRateVsAverage.exactPct.leader).toBeCloseTo(0.5) // member a, 80 pts
    expect(b.hitRateVsAverage.resultPct.you).toBeCloseTo(0.7)
    expect(b.hitRateVsAverage.state).toBe('ok')
  })

  it('block_b_trend_and_gap_to_leader', () => {
    const b = ParticipantPoolStats.build({
      viewer: viewer({ position: 2, prevPosition: 4, pointsTotal: 50 }),
      aggregate,
      rounds: [
        { matchday: 1, points: 20 },
        { matchday: 2, points: 30 },
      ],
      scoringPolicy: RangeScoringPolicy,
    })
    expect(b.rankingEvolution.trend).toBe('rising') // 2 < 4
    expect(b.rankingEvolution.gapToLeader).toBe(30) // 80 - 50
    expect(b.rankingEvolution.perRound).toHaveLength(2)
  })

  it('block_d_points_left_uses_range_max_10', () => {
    const b = ParticipantPoolStats.build({
      viewer: viewer({ finishedCount: 10, pointsTotal: 50 }),
      aggregate,
      rounds: [],
      scoringPolicy: RangeScoringPolicy,
    })
    expect(b.pointsLeftOnTable.maxPossible).toBe(100) // 10 * 10
    expect(b.pointsLeftOnTable.leftOnTable).toBe(50)
    expect(b.pointsLeftOnTable.efficiency).toBeCloseTo(0.5)
  })

  it('block_d_points_left_uses_single_match_max_14', () => {
    const b = ParticipantPoolStats.build({
      viewer: viewer({ finishedCount: 2, pointsTotal: 14 }),
      aggregate: [
        { userId: 'me', finishedCount: 2, exactCount: 1, resultCount: 2, pointsTotal: 14 },
      ],
      rounds: [],
      scoringPolicy: SingleMatchScoringPolicy,
    })
    expect(b.pointsLeftOnTable.maxPossible).toBe(28) // 2 * 14
    expect(b.pointsLeftOnTable.leftOnTable).toBe(14)
  })

  it('block_c_dimension_ratios', () => {
    const b = ParticipantPoolStats.build({
      viewer: viewer(),
      aggregate,
      rounds: [],
      scoringPolicy: RangeScoringPolicy,
    })
    expect(b.strengthsWeaknesses.home.pct).toBeCloseTo(0.8) // 4/5
    expect(b.strengthsWeaknesses.away.pct).toBeCloseTo(0.5) // 2/4
    expect(b.strengthsWeaknesses.lowGoals.pct).toBeCloseTo(5 / 6)
  })

  it('degrades_to_insufficient_data_with_no_finished_matches', () => {
    const b = ParticipantPoolStats.build({
      viewer: viewer({ finishedCount: 0, exactCount: 0, resultCount: 0, pointsTotal: 0 }),
      aggregate: [],
      rounds: [],
      scoringPolicy: RangeScoringPolicy,
    })
    expect(b.hitRateVsAverage.state).toBe('insufficient_data')
    expect(b.strengthsWeaknesses.state).toBe('insufficient_data')
    expect(b.pointsLeftOnTable.state).toBe('insufficient_data')
    expect(b.rankingEvolution.state).toBe('insufficient_data')
    expect(b.pointsLeftOnTable.efficiency).toBe(0) // no divide-by-zero
  })
})
