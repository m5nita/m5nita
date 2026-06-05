import { describe, expect, it } from 'vitest'
import { extractGroup, mapDuration, mapStage, mapStatus, mapWinner } from './MatchMapper'

describe('mapStatus', () => {
  it('maps standard API statuses correctly', () => {
    expect(mapStatus('SCHEDULED')).toBe('scheduled')
    expect(mapStatus('TIMED')).toBe('scheduled')
    expect(mapStatus('IN_PLAY')).toBe('live')
    expect(mapStatus('PAUSED')).toBe('live')
    expect(mapStatus('FINISHED')).toBe('finished')
    expect(mapStatus('POSTPONED')).toBe('postponed')
    expect(mapStatus('CANCELLED')).toBe('cancelled')
    expect(mapStatus('SUSPENDED')).toBe('cancelled')
    expect(mapStatus('AWARDED')).toBe('finished')
  })

  it('defaults to scheduled for unknown status', () => {
    expect(mapStatus('UNKNOWN')).toBe('scheduled')
  })

  it('keeps IN_PLAY as live when match is recent', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    expect(mapStatus('IN_PLAY', { fullTime: { home: 1, away: 1 } }, oneHourAgo)).toBe('live')
  })

  it('keeps PAUSED as live when match is recent', () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    expect(mapStatus('PAUSED', { fullTime: { home: 0, away: 0 } }, thirtyMinAgo)).toBe('live')
  })

  it('marks IN_PLAY as finished when match started over 12 hours ago with scores', () => {
    const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString()
    expect(mapStatus('IN_PLAY', { fullTime: { home: 1, away: 0 } }, thirteenHoursAgo)).toBe(
      'finished',
    )
  })

  it('marks PAUSED as finished when match started over 12 hours ago with scores', () => {
    const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString()
    expect(mapStatus('PAUSED', { fullTime: { home: 2, away: 2 } }, twentyHoursAgo)).toBe('finished')
  })

  it('does not mark IN_PLAY as finished when scores are null', () => {
    const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString()
    expect(mapStatus('IN_PLAY', { fullTime: { home: null, away: null } }, thirteenHoursAgo)).toBe(
      'live',
    )
  })

  it('does not mark IN_PLAY as finished when only one score is null', () => {
    const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString()
    expect(mapStatus('IN_PLAY', { fullTime: { home: 1, away: null } }, thirteenHoursAgo)).toBe(
      'live',
    )
  })

  it('does not mark IN_PLAY as finished without utcDate', () => {
    expect(mapStatus('IN_PLAY', { fullTime: { home: 1, away: 0 } })).toBe('live')
  })

  it('does not apply stale heuristic to FINISHED status', () => {
    const recentDate = new Date(Date.now() - 60 * 1000).toISOString()
    expect(mapStatus('FINISHED', { fullTime: { home: 1, away: 0 } }, recentDate)).toBe('finished')
  })

  it('handles 0-0 draw correctly when stale', () => {
    const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString()
    expect(mapStatus('IN_PLAY', { fullTime: { home: 0, away: 0 } }, thirteenHoursAgo)).toBe(
      'finished',
    )
  })

  it('does not apply stale heuristic to SCHEDULED', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    expect(mapStatus('SCHEDULED', { fullTime: { home: null, away: null } }, yesterday)).toBe(
      'scheduled',
    )
  })
})

describe('mapStage', () => {
  it('maps stage values correctly for cup competitions', () => {
    expect(mapStage('GROUP_STAGE', 'cup')).toBe('group')
    expect(mapStage('LAST_32', 'cup')).toBe('round-of-32')
    expect(mapStage('ROUND_OF_32', 'cup')).toBe('round-of-32')
    expect(mapStage('LAST_16', 'cup')).toBe('round-of-16')
    expect(mapStage('ROUND_OF_16', 'cup')).toBe('round-of-16')
    expect(mapStage('QUARTER_FINALS', 'cup')).toBe('quarter')
    expect(mapStage('SEMI_FINALS', 'cup')).toBe('semi')
    expect(mapStage('THIRD_PLACE', 'cup')).toBe('third-place')
    expect(mapStage('FINAL', 'cup')).toBe('final')
    expect(mapStage('REGULAR_SEASON', 'cup')).toBe('league')
  })

  it('defaults to group for unknown stage', () => {
    expect(mapStage('UNKNOWN', 'cup')).toBe('group')
  })

  it('returns league for league-type competitions regardless of stage', () => {
    expect(mapStage('GROUP_STAGE', 'league')).toBe('league')
    expect(mapStage('FINAL', 'league')).toBe('league')
  })
})

describe('extractGroup', () => {
  it('extracts group letter from GROUP_X format', () => {
    expect(extractGroup('GROUP_A')).toBe('A')
    expect(extractGroup('GROUP_B')).toBe('B')
    expect(extractGroup('GROUP_L')).toBe('L')
  })

  it('handles lowercase', () => {
    expect(extractGroup('group_a')).toBe('A')
  })

  it('returns null for null input', () => {
    expect(extractGroup(null)).toBeNull()
  })

  it('returns null for non-group string', () => {
    expect(extractGroup('REGULAR_SEASON')).toBeNull()
  })
})

describe('mapWinner', () => {
  it('maps provider winner to home/away/draw', () => {
    expect(mapWinner('HOME_TEAM')).toBe('home')
    expect(mapWinner('AWAY_TEAM')).toBe('away')
    expect(mapWinner('DRAW')).toBe('draw')
  })

  it('returns null for unknown/absent winner', () => {
    expect(mapWinner('UNKNOWN')).toBeNull()
    expect(mapWinner(null)).toBeNull()
    expect(mapWinner(undefined)).toBeNull()
  })
})

describe('mapDuration', () => {
  it('maps provider duration to internal values', () => {
    expect(mapDuration('REGULAR')).toBe('regular')
    expect(mapDuration('EXTRA_TIME')).toBe('extra_time')
    expect(mapDuration('PENALTY_SHOOTOUT')).toBe('penalty_shootout')
  })

  it('returns null for unknown/absent duration', () => {
    expect(mapDuration('UNKNOWN')).toBeNull()
    expect(mapDuration(null)).toBeNull()
    expect(mapDuration(undefined)).toBeNull()
  })
})
