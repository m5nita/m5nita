import { describe, expect, it } from 'vitest'
import { Match } from '../match/Match'
import { MatchStatus } from '../match/MatchStatus'
import { PoolClosurePolicy } from './PoolClosurePolicy'

const NOW = new Date('2026-07-31T12:00:00Z')
const PAST = new Date('2026-07-29T00:00:00Z')
const FUTURE = new Date('2026-08-05T21:30:00Z')

function match(status: MatchStatus, kickoffAt: Date): Match {
  return new Match('match-1', 'comp-1', kickoffAt, 21, status)
}

describe('PoolClosurePolicy.blocks', () => {
  it('does not block on a match postponed past its original kickoff', () => {
    expect(PoolClosurePolicy.blocks(match(MatchStatus.Postponed, PAST), NOW)).toBe(false)
  })

  it('blocks on a postponed match that already carries a future date', () => {
    expect(PoolClosurePolicy.blocks(match(MatchStatus.Postponed, FUTURE), NOW)).toBe(true)
  })

  it('blocks on a match scheduled for the future', () => {
    expect(PoolClosurePolicy.blocks(match(MatchStatus.Scheduled, FUTURE), NOW)).toBe(true)
  })

  it('blocks on a live match even though its kickoff is in the past', () => {
    expect(PoolClosurePolicy.blocks(match(MatchStatus.Live, PAST), NOW)).toBe(true)
  })

  it('does not block on a scheduled match whose kickoff came and went', () => {
    expect(PoolClosurePolicy.blocks(match(MatchStatus.Scheduled, PAST), NOW)).toBe(false)
  })

  it('treats a kickoff exactly at now as already started', () => {
    expect(PoolClosurePolicy.blocks(match(MatchStatus.Scheduled, NOW), NOW)).toBe(false)
  })
})
