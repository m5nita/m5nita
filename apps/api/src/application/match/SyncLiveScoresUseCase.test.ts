import { describe, expect, it, vi } from 'vitest'
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
  }
  return { uc: new SyncLiveScoresUseCase(deps), fetchLiveMatches, updateScores, onMatchFinished }
}

describe('SyncLiveScoresUseCase', () => {
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
})
