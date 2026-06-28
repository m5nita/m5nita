import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MatchData, MatchRepository } from '../../domain/match/MatchRepository.port'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import type { PredictionRepository } from '../../domain/prediction/PredictionRepository.port'
import type { RankingRepository } from '../../domain/ranking/RankingRepository.port'
import type { NotificationService } from '../ports/NotificationService.port'
import { NotifyMatchPointsUseCase } from './NotifyMatchPointsUseCase'

function finishedMatch(over: Partial<MatchData> = {}): MatchData {
  return {
    id: 'match-1',
    externalId: '1',
    competitionId: 'comp-1',
    homeTeam: 'Brasil',
    awayTeam: 'Argentina',
    homeFlag: '',
    awayFlag: '',
    homeScore: 2,
    awayScore: 1,
    extraTimeHomeScore: null,
    extraTimeAwayScore: null,
    penaltyHomeScore: null,
    penaltyAwayScore: null,
    winner: 'home',
    duration: 'regular',
    stage: 'GROUP',
    group: 'A',
    matchday: 3,
    matchDate: new Date(0),
    status: 'finished',
    ...over,
  }
}

function makeDeps(match: MatchData | null) {
  const matchRepo = { findById: vi.fn(async () => match) } as unknown as MatchRepository
  const poolRepo = {
    findActivePoolsForMatch: vi.fn(async () => []),
  } as unknown as PoolRepository & {
    findActivePoolsForMatch: ReturnType<typeof vi.fn>
  }
  const predictionRepo = {
    findByPoolMatch: vi.fn(async () => []),
  } as unknown as PredictionRepository & { findByPoolMatch: ReturnType<typeof vi.fn> }
  const rankingRepo = {
    getPoolRanking: vi.fn(async () => []),
  } as unknown as RankingRepository & { getPoolRanking: ReturnType<typeof vi.fn> }
  const notificationService = {
    notifyMatchPoints: vi.fn(async () => {}),
  } as unknown as NotificationService & { notifyMatchPoints: ReturnType<typeof vi.fn> }
  const useCase = new NotifyMatchPointsUseCase(
    matchRepo,
    poolRepo,
    predictionRepo,
    rankingRepo,
    notificationService,
  )
  return { matchRepo, poolRepo, predictionRepo, rankingRepo, notificationService, useCase }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NotifyMatchPointsUseCase', () => {
  it('does nothing when the match is not finished', async () => {
    const deps = makeDeps(finishedMatch({ status: 'live' }))
    await deps.useCase.execute('match-1')
    expect(deps.notificationService.notifyMatchPoints).not.toHaveBeenCalled()
  })

  it('does nothing when the match does not exist', async () => {
    const deps = makeDeps(null)
    await deps.useCase.execute('match-1')
    expect(deps.notificationService.notifyMatchPoints).not.toHaveBeenCalled()
  })

  it('emits one item per (user, pool) with points and resulting position', async () => {
    const deps = makeDeps(finishedMatch())
    deps.poolRepo.findActivePoolsForMatch.mockResolvedValue([{ id: 'pool-1', name: 'Bolão A' }])
    deps.predictionRepo.findByPoolMatch.mockResolvedValue([
      { userId: 'u1', name: 'Ana', homeScore: 2, awayScore: 1, advancePick: null, points: 10 },
      { userId: 'u2', name: 'Beto', homeScore: 1, awayScore: 1, advancePick: null, points: 1 },
    ])
    deps.rankingRepo.getPoolRanking.mockResolvedValue([
      {
        position: 1,
        userId: 'u1',
        name: 'Ana',
        totalPoints: 10,
        exactMatches: 1,
        isCurrentUser: false,
      },
      {
        position: 2,
        userId: 'u2',
        name: 'Beto',
        totalPoints: 1,
        exactMatches: 0,
        isCurrentUser: false,
      },
    ])

    await deps.useCase.execute('match-1')

    expect(deps.notificationService.notifyMatchPoints).toHaveBeenCalledOnce()
    const items = deps.notificationService.notifyMatchPoints.mock.calls[0]?.[0]
    expect(items).toEqual([
      {
        userId: 'u1',
        poolId: 'pool-1',
        poolName: 'Bolão A',
        matchId: 'match-1',
        homeTeam: 'Brasil',
        awayTeam: 'Argentina',
        homeScore: 2,
        awayScore: 1,
        points: 10,
        position: 1,
      },
      {
        userId: 'u2',
        poolId: 'pool-1',
        poolName: 'Bolão A',
        matchId: 'match-1',
        homeTeam: 'Brasil',
        awayTeam: 'Argentina',
        homeScore: 2,
        awayScore: 1,
        points: 1,
        position: 2,
      },
    ])
  })

  it('skips pools where nobody predicted the match', async () => {
    const deps = makeDeps(finishedMatch())
    deps.poolRepo.findActivePoolsForMatch.mockResolvedValue([
      { id: 'pool-1', name: 'A' },
      { id: 'pool-empty', name: 'B' },
    ])
    deps.predictionRepo.findByPoolMatch.mockImplementation(async (poolId: string) =>
      poolId === 'pool-1'
        ? [{ userId: 'u1', name: 'Ana', homeScore: 0, awayScore: 0, advancePick: null, points: 3 }]
        : [],
    )
    deps.rankingRepo.getPoolRanking.mockResolvedValue([
      {
        position: 1,
        userId: 'u1',
        name: 'Ana',
        totalPoints: 3,
        exactMatches: 0,
        isCurrentUser: false,
      },
    ])

    await deps.useCase.execute('match-1')

    const items = deps.notificationService.notifyMatchPoints.mock.calls[0]?.[0]
    expect(items).toHaveLength(1)
    expect(items[0].poolId).toBe('pool-1')
  })

  // C1 benchmark: cost is O(pools), never O(members). For each pool we fetch
  // predictions ONCE and the ranking ONCE — no per-user ranking queries.
  it('issues at most 2 queries per pool and zero per-user ranking queries', async () => {
    const deps = makeDeps(finishedMatch())
    deps.poolRepo.findActivePoolsForMatch.mockResolvedValue([
      { id: 'pool-1', name: 'A' },
      { id: 'pool-2', name: 'B' },
    ])
    // pool-1 has 3 members — the ranking must still be fetched only once for it.
    deps.predictionRepo.findByPoolMatch.mockResolvedValue([
      { userId: 'u1', name: 'A', homeScore: 0, awayScore: 0, advancePick: null, points: 1 },
      { userId: 'u2', name: 'B', homeScore: 0, awayScore: 0, advancePick: null, points: 1 },
      { userId: 'u3', name: 'C', homeScore: 0, awayScore: 0, advancePick: null, points: 1 },
    ])
    deps.rankingRepo.getPoolRanking.mockResolvedValue([
      {
        position: 1,
        userId: 'u1',
        name: 'A',
        totalPoints: 1,
        exactMatches: 0,
        isCurrentUser: false,
      },
      {
        position: 1,
        userId: 'u2',
        name: 'B',
        totalPoints: 1,
        exactMatches: 0,
        isCurrentUser: false,
      },
      {
        position: 1,
        userId: 'u3',
        name: 'C',
        totalPoints: 1,
        exactMatches: 0,
        isCurrentUser: false,
      },
    ])

    await deps.useCase.execute('match-1')

    expect(deps.predictionRepo.findByPoolMatch).toHaveBeenCalledTimes(2)
    expect(deps.rankingRepo.getPoolRanking).toHaveBeenCalledTimes(2)
  })
})
