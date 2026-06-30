import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MatchData, MatchRepository } from '../../domain/match/MatchRepository.port'
import type { Clock } from '../../domain/shared/Clock'
import type { ExternalMatch, FootballDataApi } from '../ports/FootballDataApi.port'
import { type SyncLiveScoresDeps, SyncLiveScoresUseCase } from './SyncLiveScoresUseCase'

function externalMatch(overrides: Partial<ExternalMatch> = {}): ExternalMatch {
  return {
    id: 100,
    utcDate: '2026-06-15T01:00:00Z',
    status: 'FINISHED',
    stage: 'GROUP_STAGE',
    group: 'A',
    matchday: 3,
    homeTeam: { name: 'Brazil', crest: '' },
    awayTeam: { name: 'Serbia', crest: '' },
    score: { winner: 'HOME_TEAM', duration: 'REGULAR', fullTime: { home: 2, away: 0 } },
    ...overrides,
  }
}

function existingMatch(overrides: Partial<MatchData> = {}): MatchData {
  return {
    id: 'm1',
    externalId: '100',
    competitionId: 'c1',
    homeTeam: 'Brazil',
    awayTeam: 'Serbia',
    homeFlag: '',
    awayFlag: '',
    homeScore: null,
    awayScore: null,
    extraTimeHomeScore: null,
    extraTimeAwayScore: null,
    penaltyHomeScore: null,
    penaltyAwayScore: null,
    winner: null,
    duration: null,
    stage: 'group',
    group: 'A',
    matchday: 3,
    matchDate: new Date('2026-06-15T01:00:00Z'),
    status: 'live',
    ...overrides,
  }
}

function makeUseCase(opts: { live?: ExternalMatch[]; existing?: MatchData[]; now?: Date }) {
  const fetchLiveMatches = vi.fn(async () => opts.live ?? [])
  const updateScores = vi.fn(async () => {})
  const onMatchFinished = vi.fn(async () => {})
  const onMatchHeldAwaitingWinner = vi.fn(async () => {})
  const deps: SyncLiveScoresDeps = {
    footballApi: {
      fetchLiveMatches,
      fetchMatches: vi.fn(async () => []),
    } as unknown as FootballDataApi,
    matchRepo: {
      findByCompetition: vi.fn(async () => opts.existing ?? []),
      updateScores,
    } as unknown as MatchRepository,
    clock: { now: () => opts.now ?? new Date('2026-06-15T03:00:00Z') } as Clock,
    findActiveCompetitions: async () => [{ id: 'c1', externalId: 'WC', name: 'World Cup' }],
    onMatchFinished,
    onMatchHeldAwaitingWinner,
  }
  return {
    uc: new SyncLiveScoresUseCase(deps),
    fetchLiveMatches,
    updateScores,
    onMatchFinished,
    onMatchHeldAwaitingWinner,
  }
}

describe('SyncLiveScoresUseCase', () => {
  // mapStatus()/StaleMatchPolicy read the real wall clock (`new Date()`), not the
  // injected Clock, to decide "stale live → finished after 12h". Pin the system
  // time so the fixed 2026-06-15 fixture dates stay inside the live window no
  // matter when the suite runs (otherwise an IN_PLAY fixture is forced finished).
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T03:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('queries a UTC window spanning the previous and next day (catches matches crossing midnight)', async () => {
    const { uc, fetchLiveMatches } = makeUseCase({ now: new Date('2026-06-15T03:00:00Z') })
    await uc.execute()
    // A match that kicked off late on 06-14 UTC and is still live after midnight
    // must remain inside the queried window; a single-day (06-15) window misses it.
    expect(fetchLiveMatches).toHaveBeenCalledWith('WC', '2026-06-14', '2026-06-16')
  })

  it('persists scores and triggers onMatchFinished when a match transitions to finished', async () => {
    const { uc, updateScores, onMatchFinished } = makeUseCase({
      existing: [existingMatch({ status: 'live' })],
      live: [externalMatch({ status: 'FINISHED' })],
    })

    await uc.execute()

    expect(updateScores).toHaveBeenCalledTimes(1)
    expect(onMatchFinished).toHaveBeenCalledWith('m1')
  })

  it('does not re-trigger onMatchFinished for a match already finished', async () => {
    const { uc, onMatchFinished } = makeUseCase({
      existing: [existingMatch({ status: 'finished' })],
      live: [externalMatch({ status: 'FINISHED' })],
    })

    await uc.execute()

    expect(onMatchFinished).not.toHaveBeenCalled()
  })

  it('does not trigger onMatchFinished while a match is still live', async () => {
    const { uc, onMatchFinished } = makeUseCase({
      existing: [existingMatch({ status: 'live' })],
      live: [externalMatch({ status: 'IN_PLAY', score: { fullTime: { home: 1, away: 0 } } })],
    })

    await uc.execute()

    expect(onMatchFinished).not.toHaveBeenCalled()
  })

  it('holds a match as live and signals when the feed finishes it without a winner', async () => {
    const { uc, updateScores, onMatchFinished, onMatchHeldAwaitingWinner } = makeUseCase({
      existing: [existingMatch({ status: 'live' })],
      live: [
        externalMatch({
          status: 'FINISHED',
          score: { duration: 'penalty_shootout', fullTime: { home: 1, away: 1 } },
        }),
      ],
    })

    await uc.execute()

    expect(updateScores).toHaveBeenCalledWith('m1', expect.objectContaining({ status: 'live' }))
    expect(onMatchHeldAwaitingWinner).toHaveBeenCalledWith('m1')
    expect(onMatchFinished).not.toHaveBeenCalled()
  })

  it('finishes and scores once the winner arrives', async () => {
    const { uc, onMatchFinished, onMatchHeldAwaitingWinner } = makeUseCase({
      existing: [existingMatch({ status: 'live' })],
      live: [
        externalMatch({
          status: 'FINISHED',
          score: {
            winner: 'AWAY_TEAM',
            duration: 'penalty_shootout',
            fullTime: { home: 1, away: 1 },
          },
        }),
      ],
    })

    await uc.execute()

    expect(onMatchFinished).toHaveBeenCalledWith('m1')
    expect(onMatchHeldAwaitingWinner).not.toHaveBeenCalled()
  })

  it('persists the live minute and injury time reported by the provider', async () => {
    const { uc, updateScores } = makeUseCase({
      existing: [existingMatch({ status: 'live' })],
      live: [
        externalMatch({
          status: 'IN_PLAY',
          minute: 45,
          injuryTime: 2,
          score: { fullTime: { home: 1, away: 0 } },
        }),
      ],
    })

    await uc.execute()

    expect(updateScores).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ minute: 45, injuryTime: 2 }),
    )
  })

  it('defaults minute/injuryTime to null when the provider omits them', async () => {
    const { uc, updateScores } = makeUseCase({
      existing: [existingMatch({ status: 'live' })],
      live: [externalMatch({ status: 'IN_PLAY', score: { fullTime: { home: 0, away: 0 } } })],
    })

    await uc.execute()

    expect(updateScores).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ minute: null, injuryTime: null }),
    )
  })
})
