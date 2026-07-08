import { describe, expect, it } from 'vitest'
import {
  extractGroup,
  mapDuration,
  mapStage,
  mapStatus,
  mapSyncStatus,
  mapWinner,
} from './MatchMapper'

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

  it('marks IN_PLAY as finished when stale (12h+) and a winner is known', () => {
    const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString()
    expect(
      mapStatus(
        'IN_PLAY',
        { fullTime: { home: 1, away: 0 }, winner: 'HOME_TEAM' },
        thirteenHoursAgo,
      ),
    ).toBe('finished')
  })

  it('marks PAUSED as finished when stale (12h+) and a winner is known', () => {
    const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString()
    expect(
      mapStatus('PAUSED', { fullTime: { home: 2, away: 2 }, winner: 'DRAW' }, twentyHoursAgo),
    ).toBe('finished')
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

  it('keeps a FINISHED match finished when a winner is known', () => {
    const recentDate = new Date(Date.now() - 60 * 1000).toISOString()
    expect(
      mapStatus('FINISHED', { fullTime: { home: 1, away: 0 }, winner: 'HOME_TEAM' }, recentDate),
    ).toBe('finished')
  })

  it('handles a 0-0 draw when stale and the winner (draw) is known', () => {
    const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString()
    expect(
      mapStatus('IN_PLAY', { fullTime: { home: 0, away: 0 }, winner: 'DRAW' }, thirteenHoursAgo),
    ).toBe('finished')
  })

  it('does not apply stale heuristic to SCHEDULED', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    expect(mapStatus('SCHEDULED', { fullTime: { home: null, away: null } }, yesterday)).toBe(
      'scheduled',
    )
  })
})

describe('mapStatus winner gate', () => {
  it('holds a FINISHED match as live when the winner is missing', () => {
    const recent = new Date(Date.now() - 60 * 1000).toISOString()
    expect(mapStatus('FINISHED', { fullTime: { home: 1, away: 1 } }, recent)).toBe('live')
  })

  it('holds a stale IN_PLAY match as live when the winner is missing', () => {
    const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString()
    expect(mapStatus('IN_PLAY', { fullTime: { home: 1, away: 0 } }, thirteenHoursAgo)).toBe('live')
  })

  it('finishes a FINISHED match once the winner is known', () => {
    const recent = new Date(Date.now() - 60 * 1000).toISOString()
    expect(mapStatus('FINISHED', { fullTime: { home: 1, away: 1 }, winner: 'DRAW' }, recent)).toBe(
      'finished',
    )
  })

  it('still maps a plain FINISHED (no score) to finished', () => {
    expect(mapStatus('FINISHED')).toBe('finished')
  })
})

describe('mapSyncStatus', () => {
  it('flags heldForWinner when finished without a winner', () => {
    const recent = new Date(Date.now() - 60 * 1000).toISOString()
    expect(mapSyncStatus('FINISHED', { fullTime: { home: 1, away: 1 } }, recent)).toEqual({
      status: 'live',
      heldForWinner: true,
    })
  })

  it('does not flag held once the winner is present (decisive in regulation)', () => {
    const recent = new Date(Date.now() - 60 * 1000).toISOString()
    expect(
      mapSyncStatus('FINISHED', { fullTime: { home: 1, away: 2 }, winner: 'AWAY_TEAM' }, recent),
    ).toEqual({ status: 'finished', heldForWinner: false })
  })

  // Decisive-duration gate: a knockout level after 90' with a decisive winner was
  // settled past regulation. The feed sets `winner` before `duration`; hold until
  // the duration lands so the +2 advance bonus is scored in the single grading pass.
  it('holds a level-regulation winner until the decisive duration arrives', () => {
    const recent = new Date(Date.now() - 60 * 1000).toISOString()
    expect(
      mapSyncStatus(
        'FINISHED',
        {
          fullTime: { home: 1, away: 1 },
          regularTime: { home: 1, away: 1 },
          winner: 'AWAY_TEAM',
          duration: 'REGULAR',
        },
        recent,
      ),
    ).toEqual({ status: 'live', heldForWinner: true })
  })

  it('finishes a level-regulation winner once the shootout duration is known', () => {
    const recent = new Date(Date.now() - 60 * 1000).toISOString()
    expect(
      mapSyncStatus(
        'FINISHED',
        {
          fullTime: { home: 1, away: 1 },
          regularTime: { home: 1, away: 1 },
          winner: 'AWAY_TEAM',
          duration: 'PENALTY_SHOOTOUT',
        },
        recent,
      ),
    ).toEqual({ status: 'finished', heldForWinner: false })
  })

  // full-time may merge extra-time/penalty goals; the gate must grade on the 90'
  // score. A 0-0 at 90' won on penalties (fullTime shows the 4-3 shootout tally)
  // is still "level in regulation" → held until the duration lands.
  it('grades the level check on regulation time, not full-time', () => {
    const recent = new Date(Date.now() - 60 * 1000).toISOString()
    expect(
      mapSyncStatus(
        'FINISHED',
        {
          fullTime: { home: 4, away: 3 },
          regularTime: { home: 0, away: 0 },
          winner: 'HOME_TEAM',
          duration: 'REGULAR',
        },
        recent,
      ),
    ).toEqual({ status: 'live', heldForWinner: true })
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
