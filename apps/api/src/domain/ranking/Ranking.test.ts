import { describe, expect, it } from 'vitest'
import { Ranking, type RankingInput } from './Ranking'

function entry(overrides: Partial<RankingInput>): RankingInput {
  return {
    userId: 'u',
    name: null,
    totalPoints: 0,
    livePoints: 0,
    exactMatches: 0,
    ...overrides,
  }
}

describe('Ranking', () => {
  it('assigns sequential positions when no ties', () => {
    const built = Ranking.build(
      [
        entry({ userId: 'a', totalPoints: 30, exactMatches: 3 }),
        entry({ userId: 'b', totalPoints: 20, exactMatches: 2 }),
        entry({ userId: 'c', totalPoints: 10, exactMatches: 1 }),
      ],
      'b',
    )
    expect(built.map((e) => [e.userId, e.position])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ])
  })

  it('shares position when totalPoints AND exactMatches both match', () => {
    const built = Ranking.build(
      [
        entry({ userId: 'a', totalPoints: 30, exactMatches: 3 }),
        entry({ userId: 'b', totalPoints: 30, exactMatches: 3 }),
        entry({ userId: 'c', totalPoints: 20, exactMatches: 2 }),
      ],
      '',
    )
    expect(built.map((e) => [e.userId, e.position])).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 3],
    ])
  })

  it('does NOT share position when totalPoints match but exactMatches differ', () => {
    const built = Ranking.build(
      [
        entry({ userId: 'a', totalPoints: 30, exactMatches: 3 }),
        entry({ userId: 'b', totalPoints: 30, exactMatches: 2 }),
      ],
      '',
    )
    expect(built.map((e) => [e.userId, e.position])).toEqual([
      ['a', 1],
      ['b', 2],
    ])
  })

  it('flags isCurrentUser', () => {
    const built = Ranking.build(
      [entry({ userId: 'a', totalPoints: 10 }), entry({ userId: 'b', totalPoints: 5 })],
      'b',
    )
    expect(built.map((e) => [e.userId, e.isCurrentUser])).toEqual([
      ['a', false],
      ['b', true],
    ])
  })

  it('returns empty for empty input', () => {
    expect(Ranking.build([], 'x')).toEqual([])
  })
})
