import { describe, expect, it } from 'vitest'
import { Match } from './Match'
import { MatchStatus } from './MatchStatus'
import { StaleMatchPolicy } from './StaleMatchPolicy'

function future(minutes: number, base: Date = new Date()): Date {
  return new Date(base.getTime() + minutes * 60_000)
}

describe('Match', () => {
  it('canBePredicted: true when scheduled AND kickoff in the future', () => {
    const now = new Date('2026-05-26T12:00:00Z')
    const m = new Match('m', 'c', future(60, now), 1, MatchStatus.Scheduled)
    expect(m.canBePredicted(now)).toBe(true)
  })

  it('canBePredicted: false once kickoff has passed', () => {
    const now = new Date('2026-05-26T12:00:00Z')
    const m = new Match('m', 'c', future(-1, now), 1, MatchStatus.Scheduled)
    expect(m.canBePredicted(now)).toBe(false)
  })

  it('canBePredicted: false when status is already live/finished', () => {
    const now = new Date('2026-05-26T12:00:00Z')
    const m = new Match('m', 'c', future(60, now), 1, MatchStatus.Live)
    expect(m.canBePredicted(now)).toBe(false)
  })

  it('canBeTargetOfSingleMatchPool same rule as canBePredicted', () => {
    const now = new Date('2026-05-26T12:00:00Z')
    expect(
      new Match('m', 'c', future(60, now), 1, MatchStatus.Scheduled).canBeTargetOfSingleMatchPool(
        now,
      ),
    ).toBe(true)
    expect(
      new Match('m', 'c', future(-1, now), 1, MatchStatus.Scheduled).canBeTargetOfSingleMatchPool(
        now,
      ),
    ).toBe(false)
  })

  describe('deriveStatusFromApi (12h stale rule)', () => {
    const translator = (api: string): MatchStatus => {
      const map: Record<string, MatchStatus> = {
        IN_PLAY: MatchStatus.Live,
        PAUSED: MatchStatus.Live,
        FINISHED: MatchStatus.Finished,
        SCHEDULED: MatchStatus.Scheduled,
      }
      return map[api] ?? MatchStatus.Scheduled
    }

    it('forces Finished when IN_PLAY for >12h with scores', () => {
      const kickoff = new Date('2026-05-26T00:00:00Z')
      const now = new Date('2026-05-26T13:00:00Z') // 13h after kickoff
      const status = Match.deriveStatusFromApi({
        apiStatus: 'IN_PLAY',
        homeScore: 1,
        awayScore: 0,
        kickoffAt: kickoff,
        now,
        rawTranslator: translator,
      })
      expect(status).toBe(MatchStatus.Finished)
    })

    it('keeps Live when IN_PLAY within 12h', () => {
      const kickoff = new Date('2026-05-26T00:00:00Z')
      const now = new Date('2026-05-26T02:00:00Z')
      const status = Match.deriveStatusFromApi({
        apiStatus: 'IN_PLAY',
        homeScore: 1,
        awayScore: 0,
        kickoffAt: kickoff,
        now,
        rawTranslator: translator,
      })
      expect(status).toBe(MatchStatus.Live)
    })

    it('does NOT force Finished if scores are missing (defensive)', () => {
      const kickoff = new Date('2026-05-26T00:00:00Z')
      const now = new Date('2026-05-26T15:00:00Z')
      const status = Match.deriveStatusFromApi({
        apiStatus: 'IN_PLAY',
        homeScore: null,
        awayScore: null,
        kickoffAt: kickoff,
        now,
        rawTranslator: translator,
      })
      expect(status).toBe(MatchStatus.Live)
    })

    it('delegates non-IN_PLAY statuses to the raw translator', () => {
      const status = Match.deriveStatusFromApi({
        apiStatus: 'FINISHED',
        homeScore: 2,
        awayScore: 1,
        kickoffAt: new Date('2026-05-26T00:00:00Z'),
        now: new Date('2026-05-26T02:00:00Z'),
        rawTranslator: translator,
      })
      expect(status).toBe(MatchStatus.Finished)
    })
  })

  it('StaleMatchPolicy exposes 12h boundary', () => {
    expect(StaleMatchPolicy.maxLiveDurationMs).toBe(12 * 60 * 60 * 1000)
  })
})
