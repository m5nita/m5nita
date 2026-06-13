import { describe, expect, it } from 'vitest'
import { RangeScoringPolicy, SingleMatchScoringPolicy } from '../scoring/ScoringPolicy'
import { ParticipantPoolStats } from './ParticipantPoolStats'
import type {
  FormSampleRow,
  ParticipantStatsRow,
  PoolRoundPointsRow,
  PoolStatsAggregateRow,
} from './StatsRepository.port'

function viewer(over: Partial<ParticipantStatsRow> = {}): ParticipantStatsRow {
  return {
    finishedCount: 10,
    exactCount: 3,
    resultCount: 7,
    pointsTotal: 50,
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

const poolRounds: PoolRoundPointsRow[] = [
  { userId: 'me', matchday: 1, points: 20 },
  { userId: 'me', matchday: 2, points: 30 },
  { userId: 'a', matchday: 1, points: 40 },
  { userId: 'a', matchday: 2, points: 40 },
]

function build(
  over: Partial<ParticipantStatsRow> = {},
  opts: {
    aggregate?: PoolStatsAggregateRow[]
    poolRounds?: PoolRoundPointsRow[]
    recentForm?: FormSampleRow[]
    policy?: typeof RangeScoringPolicy | typeof SingleMatchScoringPolicy
  } = {},
) {
  return ParticipantPoolStats.build({
    viewerUserId: 'me',
    viewer: viewer(over),
    aggregate: opts.aggregate ?? aggregate,
    poolRounds: opts.poolRounds ?? poolRounds,
    recentForm: opts.recentForm ?? [],
    scoringPolicy: opts.policy ?? RangeScoringPolicy,
  })
}

describe('ParticipantPoolStats.build', () => {
  it('hit_rate_vs_average_and_leader', () => {
    const b = build()
    expect(b.hitRate.exactPct.you).toBeCloseTo(0.3)
    expect(b.hitRate.exactPct.leader).toBeCloseTo(0.5) // member a, 80 pts
    expect(b.hitRate.resultPct.you).toBeCloseTo(0.7)
    expect(b.hitRate.state).toBe('ok')
  })

  it('ranking_hero_trend_gap_and_member_count', () => {
    const b = build({ position: 2, prevPosition: 4, pointsTotal: 50 })
    expect(b.ranking.trend).toBe('rising') // 2 < 4
    expect(b.ranking.gapToLeader).toBe(30) // 80 - 50
    expect(b.ranking.memberCount).toBe(2)
  })

  it('efficiency_uses_range_max_10', () => {
    const b = build({ finishedCount: 10, pointsTotal: 50 })
    expect(b.efficiency.maxPossible).toBe(100) // 10 * 10
    expect(b.efficiency.leftOnTable).toBe(50)
    expect(b.efficiency.efficiency).toBeCloseTo(0.5)
  })

  it('efficiency_uses_single_match_max_14', () => {
    const b = build(
      { finishedCount: 2, pointsTotal: 14 },
      {
        aggregate: [
          { userId: 'me', finishedCount: 2, exactCount: 1, resultCount: 2, pointsTotal: 14 },
        ],
        policy: SingleMatchScoringPolicy,
      },
    )
    expect(b.efficiency.maxPossible).toBe(28) // 2 * 14
    expect(b.efficiency.leftOnTable).toBe(14)
  })

  it('distribution_partitions_finished_predictions', () => {
    const b = build({ finishedCount: 10, exactCount: 3, resultCount: 7 })
    expect(b.distribution.exact).toBe(3)
    expect(b.distribution.resultOnly).toBe(4) // 7 - 3
    expect(b.distribution.miss).toBe(3) // 10 - 7
    expect(b.distribution.total).toBe(10)
  })

  it('evolution_cumulates_you_leader_and_average', () => {
    const b = build()
    expect(b.evolution.rounds).toEqual([1, 2])
    expect(b.evolution.you).toEqual([20, 50])
    expect(b.evolution.leader).toEqual([40, 80])
    expect(b.evolution.average).toEqual([30, 65]) // mean of me + a per round
  })

  it('recent_form_classifies_and_counts_streak', () => {
    // most-recent first: exact, result-only, miss
    const recentForm: FormSampleRow[] = [
      { predHome: 3, predAway: 1, actualHome: 3, actualAway: 1 }, // exact
      { predHome: 2, predAway: 0, actualHome: 1, actualAway: 0 }, // result only
      { predHome: 0, predAway: 0, actualHome: 1, actualAway: 2 }, // miss
    ]
    const b = build({}, { recentForm })
    expect(b.recentForm.currentStreak).toBe(2) // exact + result, then miss breaks
    expect(b.recentForm.outcomes).toEqual(['miss', 'result', 'exact']) // oldest → newest
  })

  it('strengths_flags_better_side_on_goal_volume', () => {
    const b = build({
      lowGoalsCorrect: 5,
      lowGoalsTotal: 6,
      highGoalsCorrect: 1,
      highGoalsTotal: 4,
    })
    expect(b.strengths.lowGoals.pct).toBeCloseTo(5 / 6)
    expect(b.strengths.highGoals.pct).toBeCloseTo(0.25)
    expect(b.strengths.betterAt).toBe('low')
  })

  it('degrades_to_insufficient_data_with_no_finished_matches', () => {
    const b = build(
      { finishedCount: 0, exactCount: 0, resultCount: 0, pointsTotal: 0, position: null },
      { aggregate: [], poolRounds: [] },
    )
    expect(b.hitRate.state).toBe('insufficient_data')
    expect(b.strengths.state).toBe('insufficient_data')
    expect(b.efficiency.state).toBe('insufficient_data')
    expect(b.ranking.state).toBe('insufficient_data')
    expect(b.evolution.state).toBe('insufficient_data')
    expect(b.efficiency.efficiency).toBe(0) // no divide-by-zero
  })
})
