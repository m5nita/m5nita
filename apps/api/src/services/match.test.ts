import { describe, expect, it } from 'vitest'
import { extractGroup, mapStage, mapStageForCompetition, mapStatus } from './matchUtils'

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
    const score = { fullTime: { home: 1, away: 1 } }

    expect(mapStatus('IN_PLAY', score, oneHourAgo)).toBe('live')
  })

  it('keeps PAUSED as live when match is recent', () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const score = { fullTime: { home: 0, away: 0 } }

    expect(mapStatus('PAUSED', score, thirtyMinAgo)).toBe('live')
  })

  it('marks IN_PLAY as finished when match started over 12 hours ago with scores', () => {
    const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString()
    const score = { fullTime: { home: 1, away: 0 } }

    expect(mapStatus('IN_PLAY', score, thirteenHoursAgo)).toBe('finished')
  })

  it('marks PAUSED as finished when match started over 12 hours ago with scores', () => {
    const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString()
    const score = { fullTime: { home: 2, away: 2 } }

    expect(mapStatus('PAUSED', score, twentyHoursAgo)).toBe('finished')
  })

  it('does not mark IN_PLAY as finished when scores are null', () => {
    const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString()
    const score = { fullTime: { home: null, away: null } }

    expect(mapStatus('IN_PLAY', score, thirteenHoursAgo)).toBe('live')
  })

  it('does not mark IN_PLAY as finished when only one score is null', () => {
    const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString()
    const score = { fullTime: { home: 1, away: null } }

    expect(mapStatus('IN_PLAY', score, thirteenHoursAgo)).toBe('live')
  })

  it('does not mark IN_PLAY as finished without utcDate', () => {
    const score = { fullTime: { home: 1, away: 0 } }

    expect(mapStatus('IN_PLAY', score)).toBe('live')
  })

  it('does not apply stale heuristic to FINISHED status', () => {
    const recentDate = new Date(Date.now() - 60 * 1000).toISOString()
    const score = { fullTime: { home: 1, away: 0 } }

    expect(mapStatus('FINISHED', score, recentDate)).toBe('finished')
  })

  it('handles 0-0 draw correctly when stale', () => {
    const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString()
    const score = { fullTime: { home: 0, away: 0 } }

    expect(mapStatus('IN_PLAY', score, thirteenHoursAgo)).toBe('finished')
  })

  it('does not apply stale heuristic to SCHEDULED', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const score = { fullTime: { home: null, away: null } }

    expect(mapStatus('SCHEDULED', score, yesterday)).toBe('scheduled')
  })
})

describe('mapStage', () => {
  it('maps stage values correctly', () => {
    expect(mapStage('GROUP_STAGE')).toBe('group')
    expect(mapStage('LAST_32')).toBe('round-of-32')
    expect(mapStage('ROUND_OF_32')).toBe('round-of-32')
    expect(mapStage('LAST_16')).toBe('round-of-16')
    expect(mapStage('ROUND_OF_16')).toBe('round-of-16')
    expect(mapStage('QUARTER_FINALS')).toBe('quarter')
    expect(mapStage('SEMI_FINALS')).toBe('semi')
    expect(mapStage('THIRD_PLACE')).toBe('third-place')
    expect(mapStage('FINAL')).toBe('final')
    expect(mapStage('REGULAR_SEASON')).toBe('league')
  })

  it('defaults to group for unknown stage', () => {
    expect(mapStage('UNKNOWN')).toBe('group')
  })
})

describe('mapStageForCompetition', () => {
  it('returns league for league-type competitions regardless of stage', () => {
    expect(mapStageForCompetition('GROUP_STAGE', 'league')).toBe('league')
    expect(mapStageForCompetition('FINAL', 'league')).toBe('league')
  })

  it('maps stage for cup-type competitions', () => {
    expect(mapStageForCompetition('GROUP_STAGE', 'cup')).toBe('group')
    expect(mapStageForCompetition('QUARTER_FINALS', 'cup')).toBe('quarter')
    expect(mapStageForCompetition('FINAL', 'cup')).toBe('final')
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
