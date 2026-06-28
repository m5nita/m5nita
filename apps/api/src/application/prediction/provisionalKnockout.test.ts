import { describe, expect, it } from 'vitest'
import { provisionalKnockoutContext } from './provisionalKnockout'

describe('provisionalKnockoutContext', () => {
  it('uses the live extra-time leader while the match is live', () => {
    const ctx = provisionalKnockoutContext(
      {
        status: 'live',
        stage: 'semi',
        duration: 'extra_time',
        winner: null,
        home: 1,
        away: 1,
        extraHome: 1,
        extraAway: 0,
      },
      'home',
    )
    expect(ctx).toEqual({ pastRegularTime: true, advancingSide: 'home', predictedAdvance: 'home' })
  })

  it('uses the settled winner once the match is finished (penalty-decided)', () => {
    const ctx = provisionalKnockoutContext(
      {
        status: 'finished',
        stage: 'final',
        duration: 'penalty_shootout',
        winner: 'away',
        home: 1,
        away: 1,
        extraHome: 0,
        extraAway: 0,
      },
      'away',
    )
    expect(ctx).toEqual({ pastRegularTime: true, advancingSide: 'away', predictedAdvance: 'away' })
  })

  it('returns undefined for a live shootout (no provisional leader)', () => {
    const ctx = provisionalKnockoutContext(
      {
        status: 'live',
        stage: 'final',
        duration: 'penalty_shootout',
        winner: null,
        home: 1,
        away: 1,
        extraHome: 0,
        extraAway: 0,
      },
      'home',
    )
    expect(ctx).toBeUndefined()
  })
})
