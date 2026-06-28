import { describe, expect, it } from 'vitest'
import {
  gradedScoreline,
  knockoutContextFor,
  liveAdvancingSide,
  liveKnockoutContextFor,
} from './KnockoutResult'

describe('gradedScoreline', () => {
  it('is the regular-time (90-minute) score, ignoring extra time and penalties', () => {
    const s = gradedScoreline({
      fullTime: { home: 6, away: 5 }, // provider may inflate with ET/penalties — must be ignored
      regularTime: { home: 1, away: 1 },
    })
    expect(s).toEqual({ home: 1, away: 1 })
  })

  it('ignores extra-time goals — uses the 90-minute draw even when ET decided it', () => {
    const s = gradedScoreline({
      fullTime: { home: 2, away: 1 }, // 1-1 at 90, decided 2-1 in ET
      regularTime: { home: 1, away: 1 },
    })
    expect(s).toEqual({ home: 1, away: 1 })
  })

  it('falls back to full-time for a regular match (no regular-time sub-score)', () => {
    expect(gradedScoreline({ fullTime: { home: 3, away: 0 } })).toEqual({ home: 3, away: 0 })
  })

  it('returns nulls when not finished', () => {
    expect(gradedScoreline({ fullTime: { home: null, away: null } })).toEqual({
      home: null,
      away: null,
    })
  })
})

describe('knockoutContextFor', () => {
  it('marks a penalty-decided knockout as decided in overtime', () => {
    const ctx = knockoutContextFor(
      { stage: 'final', winner: 'home', duration: 'penalty_shootout' },
      'home',
    )
    expect(ctx).toEqual({
      pastRegularTime: true,
      advancingSide: 'home',
      predictedAdvance: 'home',
    })
  })

  it('marks an extra-time-decided knockout as decided in overtime', () => {
    const ctx = knockoutContextFor(
      { stage: 'semi', winner: 'away', duration: 'extra_time' },
      'home',
    )
    expect(ctx).toEqual({
      pastRegularTime: true,
      advancingSide: 'away',
      predictedAdvance: 'home',
    })
  })

  it('marks a regular-time knockout as NOT decided in overtime', () => {
    const ctx = knockoutContextFor(
      { stage: 'quarter', winner: 'home', duration: 'regular' },
      'home',
    )
    expect(ctx).toEqual({
      pastRegularTime: false,
      advancingSide: 'home',
      predictedAdvance: 'home',
    })
  })

  it('returns undefined for a non-knockout match', () => {
    expect(
      knockoutContextFor({ stage: 'group', winner: 'home', duration: 'regular' }, 'home'),
    ).toBeUndefined()
  })

  it('returns undefined when there is no decisive winner', () => {
    expect(
      knockoutContextFor({ stage: 'final', winner: 'draw', duration: 'regular' }, null),
    ).toBeUndefined()
  })
})

describe('liveAdvancingSide (extra time, live)', () => {
  const base = {
    status: 'live',
    stage: 'final',
    duration: 'extra_time' as string | null,
    regHome: 1 as number | null,
    regAway: 1 as number | null,
    extraHome: 0 as number | null,
    extraAway: 0 as number | null,
  }

  it('returns the side leading the aggregate (home scored in ET)', () => {
    expect(liveAdvancingSide({ ...base, extraHome: 1 })).toBe('home')
  })

  it('returns the side leading the aggregate (away scored in ET)', () => {
    expect(liveAdvancingSide({ ...base, extraAway: 1 })).toBe('away')
  })

  it('returns null when the aggregate is level', () => {
    expect(liveAdvancingSide(base)).toBeNull()
  })

  it('returns null during a live penalty shootout (resolved only at the end)', () => {
    expect(liveAdvancingSide({ ...base, duration: 'penalty_shootout' })).toBeNull()
  })

  it('returns null during regulation time', () => {
    expect(liveAdvancingSide({ ...base, duration: 'regular' })).toBeNull()
  })

  it('returns null when the match is not live (finished)', () => {
    expect(liveAdvancingSide({ ...base, status: 'finished', extraHome: 1 })).toBeNull()
  })

  it('returns null for a non-knockout match', () => {
    expect(liveAdvancingSide({ ...base, stage: 'group', extraHome: 1 })).toBeNull()
  })
})

describe('liveKnockoutContextFor', () => {
  const state = {
    status: 'live',
    stage: 'final',
    duration: 'extra_time' as string | null,
    regHome: 1 as number | null,
    regAway: 1 as number | null,
    extraHome: 1 as number | null,
    extraAway: 0 as number | null,
  }

  it('builds a context naming the provisional leader', () => {
    expect(liveKnockoutContextFor(state, 'home')).toEqual({
      pastRegularTime: true,
      advancingSide: 'home',
      predictedAdvance: 'home',
    })
  })

  it('returns undefined when there is no provisional leader', () => {
    expect(liveKnockoutContextFor({ ...state, extraHome: 0 }, 'home')).toBeUndefined()
  })
})
