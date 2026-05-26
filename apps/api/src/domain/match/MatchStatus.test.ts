import { describe, expect, it } from 'vitest'
import { MatchStatus } from './MatchStatus'

describe('MatchStatus', () => {
  it('from() returns the canonical instance', () => {
    expect(MatchStatus.from('scheduled')).toBe(MatchStatus.Scheduled)
    expect(MatchStatus.from('live')).toBe(MatchStatus.Live)
    expect(MatchStatus.from('finished')).toBe(MatchStatus.Finished)
  })

  it('from() rejects unknown values', () => {
    expect(() => MatchStatus.from('whatever')).toThrow()
  })

  it('isFinished()', () => {
    expect(MatchStatus.Finished.isFinished()).toBe(true)
    expect(MatchStatus.Live.isFinished()).toBe(false)
  })

  it('isOngoing()', () => {
    expect(MatchStatus.Scheduled.isOngoing()).toBe(true)
    expect(MatchStatus.Live.isOngoing()).toBe(true)
    expect(MatchStatus.Finished.isOngoing()).toBe(false)
    expect(MatchStatus.Cancelled.isOngoing()).toBe(false)
  })

  it('isTerminal()', () => {
    expect(MatchStatus.Finished.isTerminal()).toBe(true)
    expect(MatchStatus.Cancelled.isTerminal()).toBe(true)
    expect(MatchStatus.Postponed.isTerminal()).toBe(false)
  })
})
