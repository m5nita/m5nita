import { describe, expect, it } from 'vitest'
import { RangeScoringPolicy, SingleMatchScoringPolicy } from '../../domain/scoring/ScoringPolicy'
import { computeLivePoints } from './computeLivePoints'

describe('computeLivePoints', () => {
  const prediction = { homeScore: 2, awayScore: 1 }
  const range = RangeScoringPolicy

  it('returns stored points when match is finished', () => {
    expect(
      computeLivePoints(prediction, { status: 'finished', homeScore: 2, awayScore: 1 }, 99, range),
    ).toBe(99)
  })

  it('returns stored points (even if null) when match is finished', () => {
    expect(
      computeLivePoints(
        prediction,
        { status: 'finished', homeScore: 3, awayScore: 0 },
        null,
        range,
      ),
    ).toBeNull()
  })

  it('computes exact match (10) when live and prediction equals current score', () => {
    expect(
      computeLivePoints(prediction, { status: 'live', homeScore: 2, awayScore: 1 }, null, range),
    ).toBe(10)
  })

  it('computes winner+diff (7) when live, same winner and same goal difference', () => {
    expect(
      computeLivePoints(prediction, { status: 'live', homeScore: 3, awayScore: 2 }, null, range),
    ).toBe(7)
  })

  it('computes outcome correct (5) when live, same winner only', () => {
    expect(
      computeLivePoints(prediction, { status: 'live', homeScore: 4, awayScore: 0 }, null, range),
    ).toBe(5)
  })

  it('computes miss (0) when live and wrong outcome', () => {
    expect(
      computeLivePoints(prediction, { status: 'live', homeScore: 0, awayScore: 2 }, null, range),
    ).toBe(0)
  })

  it('returns null when scheduled', () => {
    expect(
      computeLivePoints(
        prediction,
        { status: 'scheduled', homeScore: null, awayScore: null },
        null,
        range,
      ),
    ).toBeNull()
  })

  it('returns null when live but match scores are still null (defensive)', () => {
    expect(
      computeLivePoints(
        prediction,
        { status: 'live', homeScore: null, awayScore: null },
        null,
        range,
      ),
    ).toBeNull()
  })
})

describe('computeLivePoints — single-match pool', () => {
  it('returns category + bonus for live single-match pool', () => {
    const result = computeLivePoints(
      { homeScore: 3, awayScore: 2 },
      { status: 'live', homeScore: 2, awayScore: 1 },
      null,
      SingleMatchScoringPolicy,
    )
    expect(result).toEqual({ total: 9, category: 7, bonus: 2 })
  })

  it('returns plain number for multi-match (range) pool', () => {
    const result = computeLivePoints(
      { homeScore: 3, awayScore: 2 },
      { status: 'live', homeScore: 2, awayScore: 1 },
      null,
      RangeScoringPolicy,
    )
    expect(result).toBe(7)
  })
})
