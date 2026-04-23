import { describe, expect, it } from 'vitest'
import { computeLivePoints } from './computeLivePoints'

describe('computeLivePoints', () => {
  const prediction = { homeScore: 2, awayScore: 1 }

  it('returns stored points when match is finished', () => {
    expect(
      computeLivePoints(
        prediction,
        {
          status: 'finished',
          homeScore: 2,
          awayScore: 1,
        },
        99,
      ),
    ).toBe(99)
  })

  it('returns stored points (even if null) when match is finished', () => {
    expect(
      computeLivePoints(
        prediction,
        {
          status: 'finished',
          homeScore: 3,
          awayScore: 0,
        },
        null,
      ),
    ).toBeNull()
  })

  it('computes exact match (10) when live and prediction equals current score', () => {
    expect(
      computeLivePoints(prediction, { status: 'live', homeScore: 2, awayScore: 1 }, null),
    ).toBe(10)
  })

  it('computes winner+diff (7) when live, same winner and same goal difference', () => {
    expect(
      computeLivePoints(prediction, { status: 'live', homeScore: 3, awayScore: 2 }, null),
    ).toBe(7)
  })

  it('computes outcome correct (5) when live, same winner only', () => {
    expect(
      computeLivePoints(prediction, { status: 'live', homeScore: 4, awayScore: 0 }, null),
    ).toBe(5)
  })

  it('computes miss (0) when live and wrong outcome', () => {
    expect(
      computeLivePoints(prediction, { status: 'live', homeScore: 0, awayScore: 2 }, null),
    ).toBe(0)
  })

  it('returns null when scheduled', () => {
    expect(
      computeLivePoints(
        prediction,
        { status: 'scheduled', homeScore: null, awayScore: null },
        null,
      ),
    ).toBeNull()
  })

  it('returns null when live but match scores are still null (defensive)', () => {
    expect(
      computeLivePoints(prediction, { status: 'live', homeScore: null, awayScore: null }, null),
    ).toBeNull()
  })
})
