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

  describe('deriveStatusFromApi (stale rule + winner gate)', () => {
    const translator = (api: string): MatchStatus => {
      const map: Record<string, MatchStatus> = {
        IN_PLAY: MatchStatus.Live,
        PAUSED: MatchStatus.Live,
        FINISHED: MatchStatus.Finished,
        SCHEDULED: MatchStatus.Scheduled,
      }
      return map[api] ?? MatchStatus.Scheduled
    }
    const kickoff = new Date('2026-05-26T00:00:00Z')

    it('finishes a FINISHED match that has a winner', () => {
      const r = Match.deriveStatusFromApi({
        apiStatus: 'FINISHED',
        homeScore: 2,
        awayScore: 1,
        winner: 'home',
        kickoffAt: kickoff,
        now: new Date('2026-05-26T02:00:00Z'),
        rawTranslator: translator,
      })
      expect(r.status).toBe(MatchStatus.Finished)
      expect(r.heldForWinner).toBe(false)
    })

    it('holds a FINISHED match as live when the winner is missing', () => {
      const r = Match.deriveStatusFromApi({
        apiStatus: 'FINISHED',
        homeScore: 1,
        awayScore: 1,
        winner: null,
        kickoffAt: kickoff,
        now: new Date('2026-05-26T02:00:00Z'),
        rawTranslator: translator,
      })
      expect(r.status).toBe(MatchStatus.Live)
      expect(r.heldForWinner).toBe(true)
    })

    it('holds a stale IN_PLAY match without a winner (never auto-finishes a non-result)', () => {
      const now = new Date('2026-05-26T13:00:00Z') // 13h after kickoff
      const r = Match.deriveStatusFromApi({
        apiStatus: 'IN_PLAY',
        homeScore: 1,
        awayScore: 0,
        winner: null,
        kickoffAt: kickoff,
        now,
        rawTranslator: translator,
      })
      expect(r.status).toBe(MatchStatus.Live)
      expect(r.heldForWinner).toBe(true)
    })

    it('finishes a stale IN_PLAY match once it has a winner', () => {
      const now = new Date('2026-05-26T13:00:00Z')
      const r = Match.deriveStatusFromApi({
        apiStatus: 'IN_PLAY',
        homeScore: 1,
        awayScore: 0,
        winner: 'home',
        kickoffAt: kickoff,
        now,
        rawTranslator: translator,
      })
      expect(r.status).toBe(MatchStatus.Finished)
      expect(r.heldForWinner).toBe(false)
    })

    it('keeps Live when IN_PLAY within 12h', () => {
      const r = Match.deriveStatusFromApi({
        apiStatus: 'IN_PLAY',
        homeScore: 1,
        awayScore: 0,
        winner: null,
        kickoffAt: kickoff,
        now: new Date('2026-05-26T02:00:00Z'),
        rawTranslator: translator,
      })
      expect(r.status).toBe(MatchStatus.Live)
      expect(r.heldForWinner).toBe(false)
    })

    it('does NOT hold a FINISHED match with no scores (plain translation)', () => {
      const r = Match.deriveStatusFromApi({
        apiStatus: 'FINISHED',
        homeScore: null,
        awayScore: null,
        winner: null,
        kickoffAt: kickoff,
        now: new Date('2026-05-26T15:00:00Z'),
        rawTranslator: translator,
      })
      expect(r.status).toBe(MatchStatus.Finished)
      expect(r.heldForWinner).toBe(false)
    })

    it('delegates SCHEDULED to the raw translator', () => {
      const r = Match.deriveStatusFromApi({
        apiStatus: 'SCHEDULED',
        homeScore: null,
        awayScore: null,
        winner: null,
        kickoffAt: kickoff,
        now: new Date('2026-05-26T02:00:00Z'),
        rawTranslator: translator,
      })
      expect(r.status).toBe(MatchStatus.Scheduled)
      expect(r.heldForWinner).toBe(false)
    })
  })

  describe('deriveStatusFromApi (decisive-duration gate: shootouts / extra time)', () => {
    const translator = (api: string): MatchStatus => {
      const map: Record<string, MatchStatus> = {
        IN_PLAY: MatchStatus.Live,
        PAUSED: MatchStatus.Live,
        FINISHED: MatchStatus.Finished,
        SCHEDULED: MatchStatus.Scheduled,
      }
      return map[api] ?? MatchStatus.Scheduled
    }
    const kickoff = new Date('2026-05-26T00:00:00Z')
    const now = new Date('2026-05-26T02:00:00Z')

    // A knockout level after 90' but reporting a decisive winner (home/away) was
    // settled in extra time / penalties. The feed sets `winner` BEFORE it
    // consolidates `duration`/`penalties`; finalizing here would score the base
    // result WITHOUT the +2 advance bonus and never re-score. Hold as live until
    // the decisive duration settles, then finish and score once, correctly.
    it('holds a level-regulation knockout with a winner but no decisive duration', () => {
      const r = Match.deriveStatusFromApi({
        apiStatus: 'FINISHED',
        homeScore: 0,
        awayScore: 0,
        winner: 'home',
        duration: 'regular',
        kickoffAt: kickoff,
        now,
        rawTranslator: translator,
      })
      expect(r.status).toBe(MatchStatus.Live)
      expect(r.heldForWinner).toBe(true)
    })

    it('also holds when the duration is still missing', () => {
      const r = Match.deriveStatusFromApi({
        apiStatus: 'FINISHED',
        homeScore: 0,
        awayScore: 0,
        winner: 'home',
        duration: null,
        kickoffAt: kickoff,
        now,
        rawTranslator: translator,
      })
      expect(r.status).toBe(MatchStatus.Live)
      expect(r.heldForWinner).toBe(true)
    })

    it('finishes once the penalty-shootout duration arrives', () => {
      const r = Match.deriveStatusFromApi({
        apiStatus: 'FINISHED',
        homeScore: 0,
        awayScore: 0,
        winner: 'home',
        duration: 'penalty_shootout',
        kickoffAt: kickoff,
        now,
        rawTranslator: translator,
      })
      expect(r.status).toBe(MatchStatus.Finished)
      expect(r.heldForWinner).toBe(false)
    })

    it('finishes an extra-time result (level in regulation, decisive duration)', () => {
      const r = Match.deriveStatusFromApi({
        apiStatus: 'FINISHED',
        homeScore: 1,
        awayScore: 1,
        winner: 'away',
        duration: 'extra_time',
        kickoffAt: kickoff,
        now,
        rawTranslator: translator,
      })
      expect(r.status).toBe(MatchStatus.Finished)
      expect(r.heldForWinner).toBe(false)
    })

    it("does NOT hold a regulation-time knockout result (decisive at 90')", () => {
      const r = Match.deriveStatusFromApi({
        apiStatus: 'FINISHED',
        homeScore: 2,
        awayScore: 1,
        winner: 'home',
        duration: 'regular',
        kickoffAt: kickoff,
        now,
        rawTranslator: translator,
      })
      expect(r.status).toBe(MatchStatus.Finished)
      expect(r.heldForWinner).toBe(false)
    })

    it('does NOT hold a level draw with no decisive winner (group stage)', () => {
      const r = Match.deriveStatusFromApi({
        apiStatus: 'FINISHED',
        homeScore: 1,
        awayScore: 1,
        winner: 'draw',
        duration: 'regular',
        isKnockout: false,
        kickoffAt: kickoff,
        now,
        rawTranslator: translator,
      })
      expect(r.status).toBe(MatchStatus.Finished)
      expect(r.heldForWinner).toBe(false)
    })

    // A knockout is NEVER drawn. When the feed reports a level knockout as
    // FINISHED with winner 'draw' (a premature end-of-regulation snapshot before
    // extra time / penalties resolve), finalizing would grade a 0-0 "draw" in a
    // final and close pools early. Hold as live until a decisive winner lands.
    it('holds a knockout reported as a draw (never finalize a drawn knockout)', () => {
      const r = Match.deriveStatusFromApi({
        apiStatus: 'FINISHED',
        homeScore: 0,
        awayScore: 0,
        winner: 'draw',
        duration: 'regular',
        isKnockout: true,
        kickoffAt: kickoff,
        now,
        rawTranslator: translator,
      })
      expect(r.status).toBe(MatchStatus.Live)
      expect(r.heldForWinner).toBe(true)
    })
  })

  it('StaleMatchPolicy exposes 12h boundary', () => {
    expect(StaleMatchPolicy.maxLiveDurationMs).toBe(12 * 60 * 60 * 1000)
  })
})
