import { describe, expect, it } from 'vitest'
import { StatsComparisonPolicy } from './StatsComparisonPolicy'
import type { PoolStatsAggregateRow } from './StatsRepository.port'

function row(over: Partial<PoolStatsAggregateRow> & { userId: string }): PoolStatsAggregateRow {
  return {
    userId: over.userId,
    displayName: over.displayName ?? null,
    finishedCount: over.finishedCount ?? 10,
    exactCount: over.exactCount ?? 0,
    resultCount: over.resultCount ?? 0,
    pointsTotal: over.pointsTotal ?? 0,
  }
}

describe('StatsComparisonPolicy.compute', () => {
  const members: PoolStatsAggregateRow[] = [
    row({ userId: 'a', finishedCount: 10, exactCount: 3, resultCount: 7, pointsTotal: 50 }),
    row({ userId: 'b', finishedCount: 10, exactCount: 1, resultCount: 5, pointsTotal: 30 }),
    row({ userId: 'c', finishedCount: 10, exactCount: 2, resultCount: 6, pointsTotal: 40 }),
  ]

  it('averages_member_rates', () => {
    const c = StatsComparisonPolicy.compute(members, 10)
    expect(c.exactPct.average).toBeCloseTo(0.2) // (0.3+0.1+0.2)/3
    expect(c.resultPct.average).toBeCloseTo(0.6) // (0.7+0.5+0.6)/3
    expect(c.efficiency.average).toBeCloseTo(0.4) // (0.5+0.3+0.4)/3
  })

  it('leader_is_top_points_member', () => {
    const c = StatsComparisonPolicy.compute(members, 10)
    expect(c.leaderPoints).toBe(50) // member a
    expect(c.exactPct.leader).toBeCloseTo(0.3)
    expect(c.efficiency.leader).toBeCloseTo(0.5)
  })

  it('tiebreaks_leader_by_exact_count', () => {
    const tied = [
      row({ userId: 'x', finishedCount: 10, exactCount: 2, pointsTotal: 40 }),
      row({ userId: 'y', finishedCount: 10, exactCount: 5, pointsTotal: 40 }),
    ]
    expect(StatsComparisonPolicy.compute(tied, 10).exactPct.leader).toBeCloseTo(0.5) // y wins tie
  })

  it('excludes_members_with_no_finished_predictions', () => {
    const withEmpty = [...members, row({ userId: 'd', finishedCount: 0 })]
    const c = StatsComparisonPolicy.compute(withEmpty, 10)
    expect(c.ratedMembers).toBe(3)
    expect(c.exactPct.average).toBeCloseTo(0.2)
  })

  it('returns_zeroes_when_no_rated_members', () => {
    const c = StatsComparisonPolicy.compute([row({ userId: 'z', finishedCount: 0 })], 10)
    expect(c.ratedMembers).toBe(0)
    expect(c.exactPct.average).toBe(0)
    expect(c.leaderPoints).toBe(0)
  })
})
