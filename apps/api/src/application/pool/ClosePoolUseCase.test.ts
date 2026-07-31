import { describe, expect, it, vi } from 'vitest'
import type { MatchData, MatchRepository } from '../../domain/match/MatchRepository.port'
import { Pool } from '../../domain/pool/Pool'
import type { PoolRepository, PoolWithDetails } from '../../domain/pool/PoolRepository.port'
import type { PredictionRepository } from '../../domain/prediction/PredictionRepository.port'
import type { RankingEntry, RankingRepository } from '../../domain/ranking/RankingRepository.port'
import { EntryFee } from '../../domain/shared/EntryFee'
import { InviteCode } from '../../domain/shared/InviteCode'
import { PoolScope } from '../../domain/shared/PoolScope'
import { PoolStatus } from '../../domain/shared/PoolStatus'
import type { NotificationService } from '../ports/NotificationService.port'
import { ClosePoolUseCase } from './ClosePoolUseCase'

const NOW = new Date('2026-07-31T12:00:00Z')
const CODE = '9VZJQ9J9'

function details(over: Partial<PoolWithDetails> = {}): PoolWithDetails {
  return {
    id: 'pool-1',
    name: 'Rafinha é careca!',
    entryFee: 100,
    ownerId: 'owner-1',
    inviteCode: CODE,
    competitionId: 'comp-1',
    matchdayFrom: 21,
    matchdayTo: 21,
    matchId: null,
    status: 'active',
    isOpen: true,
    notifyOnCreate: false,
    couponId: null,
    owner: { id: 'owner-1', name: 'Igor Túllio' },
    competitionName: 'Brasileirão Série A',
    coupon: null,
    memberCount: 3,
    prizeTotal: 285,
    hasLiveMatch: false,
    ...over,
  }
}

function aggregate(): Pool {
  return new Pool(
    'pool-1',
    'Rafinha é careca!',
    EntryFee.of(100),
    'owner-1',
    InviteCode.from(CODE),
    'comp-1',
    PoolScope.fromRow({ matchdayFrom: 21, matchdayTo: 21, matchId: null }),
    PoolStatus.Active,
    true,
    null,
  )
}

function matchRow(over: Partial<MatchData> = {}): MatchData {
  return {
    id: 'match-1',
    externalId: '554948',
    competitionId: 'comp-1',
    homeTeam: 'São Paulo FC',
    awayTeam: 'Santos FC',
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
    stage: 'REGULAR_SEASON',
    group: null,
    matchday: 21,
    matchDate: new Date('2026-07-29T00:00:00Z'),
    status: 'postponed',
    ...over,
  }
}

function ranking(): RankingEntry[] {
  return [
    {
      position: 1,
      userId: 'user-1',
      name: 'Igor Túllio',
      totalPoints: 22,
      exactMatches: 1,
      isCurrentUser: false,
    },
    {
      position: 2,
      userId: 'user-2',
      name: 'RafaTiroCerto',
      totalPoints: 15,
      exactMatches: 1,
      isCurrentUser: false,
    },
  ]
}

function makeUseCase(over?: {
  pool?: PoolWithDetails | null
  unfinished?: MatchData[]
  ranking?: RankingEntry[]
  /** matchId → prediction count in this pool. Absent id means zero. */
  predictionCounts?: Record<string, number>
}) {
  const resolved = over && 'pool' in over ? over.pool : details()
  const updateStatus = vi.fn(async () => {})
  const notifyWinners = vi.fn(async () => {})
  const poolRepo = {
    findByInviteCode: vi.fn(async () => resolved),
    findById: vi.fn(async () => (resolved ? aggregate() : null)),
    updateStatus,
    getMemberCount: vi.fn(async () => 3),
    getMembersWithContact: vi.fn(async () => [
      {
        userId: 'user-1',
        name: 'Igor Túllio',
        phoneNumber: '+5511999999999',
        email: null,
        emailVerified: false,
      },
    ]),
  } as unknown as PoolRepository
  const matchRepo = {
    findUnfinishedFor: vi.fn(async () => over?.unfinished ?? []),
  } as unknown as MatchRepository
  const predictionRepo = {
    countByPoolMatches: vi.fn(async (_poolId: string, matchIds: string[]) => {
      const counts = over?.predictionCounts ?? {}
      return new Map(matchIds.filter((id) => counts[id]).map((id) => [id, counts[id] as number]))
    }),
  } as unknown as PredictionRepository
  const rankingRepo = {
    getPoolRanking: vi.fn(async () => over?.ranking ?? ranking()),
  } as unknown as RankingRepository
  const notificationService = { notifyWinners } as unknown as NotificationService

  const useCase = new ClosePoolUseCase({
    poolRepo,
    matchRepo,
    predictionRepo,
    rankingRepo,
    notificationService,
    clock: { now: () => NOW },
  })

  return { useCase, updateStatus, notifyWinners, poolRepo, matchRepo, predictionRepo }
}

describe('ClosePoolUseCase', () => {
  it('closes a pool whose only pending matches are postponed past their kickoff', async () => {
    const { useCase, updateStatus, notifyWinners } = makeUseCase({
      unfinished: [matchRow()],
    })

    const result = await useCase.execute({ inviteCode: CODE, force: false })

    expect(result.outcome).toBe('closed')
    if (result.outcome !== 'closed') return
    expect(result.poolName).toBe('Rafinha é careca!')
    expect(result.stranded).toEqual([
      { id: 'match-1', label: 'São Paulo FC × Santos FC', status: 'postponed' },
    ])
    expect(result.blocking).toEqual([])
    expect(result.predicted).toEqual([])
    expect(result.winners).toEqual([{ userId: 'user-1', name: 'Igor Túllio', totalPoints: 22 }])
    // 3 members × R$ 1,00 entry, 5% platform fee.
    expect(result.prizeShare).toBe(285)
    expect(updateStatus).toHaveBeenCalledTimes(1)
    expect(notifyWinners).toHaveBeenCalledTimes(1)
  })

  it('closes the production pool it was built for: 4 postponed matches, zero predictions on any of them', async () => {
    // Mirrors pool 9VZJQ9J9 ("Rafinha é careca!"): four postponed matches past
    // their kickoff, nobody ever predicted them. A bare command with no
    // `confirmar` must still close it — this must not regress with the
    // stranded-with-predictions guard added alongside it.
    const { useCase, updateStatus, notifyWinners, predictionRepo } = makeUseCase({
      unfinished: [
        matchRow({ id: 'match-a', homeTeam: 'Time A', awayTeam: 'Time B' }),
        matchRow({ id: 'match-b', homeTeam: 'Time C', awayTeam: 'Time D' }),
        matchRow({ id: 'match-c', homeTeam: 'Time E', awayTeam: 'Time F' }),
        matchRow({ id: 'match-d', homeTeam: 'Time G', awayTeam: 'Time H' }),
      ],
      predictionCounts: {},
    })

    const result = await useCase.execute({ inviteCode: CODE, force: false })

    expect(result.outcome).toBe('closed')
    if (result.outcome !== 'closed') return
    expect(result.stranded.map((m) => m.id)).toEqual(['match-a', 'match-b', 'match-c', 'match-d'])
    expect(result.predicted).toEqual([])
    expect(predictionRepo.countByPoolMatches).toHaveBeenCalledWith('pool-1', [
      'match-a',
      'match-b',
      'match-c',
      'match-d',
    ])
    expect(updateStatus).toHaveBeenCalledTimes(1)
    expect(notifyWinners).toHaveBeenCalledTimes(1)
  })

  it('refuses a stranded match that already carries a prediction, even though nothing is blocking', async () => {
    const { useCase, updateStatus, notifyWinners } = makeUseCase({
      unfinished: [matchRow({ id: 'match-1', status: 'postponed' })],
      predictionCounts: { 'match-1': 2 },
    })

    const result = await useCase.execute({ inviteCode: CODE, force: false })

    expect(result.outcome).toBe('blocked')
    if (result.outcome !== 'blocked') return
    expect(result.blocking).toEqual([])
    expect(result.predicted).toEqual([
      { id: 'match-1', label: 'São Paulo FC × Santos FC', predictionCount: 2 },
    ])
    expect(updateStatus).not.toHaveBeenCalled()
    expect(notifyWinners).not.toHaveBeenCalled()
  })

  it('closes when force overrides a stranded match with predictions', async () => {
    const { useCase, updateStatus } = makeUseCase({
      unfinished: [matchRow({ id: 'match-1', status: 'postponed' })],
      predictionCounts: { 'match-1': 2 },
    })

    const result = await useCase.execute({ inviteCode: CODE, force: true })

    expect(result.outcome).toBe('closed')
    if (result.outcome !== 'closed') return
    expect(result.predicted).toEqual([
      { id: 'match-1', label: 'São Paulo FC × Santos FC', predictionCount: 2 },
    ])
    expect(result.stranded.map((m) => m.id)).toEqual(['match-1'])
    expect(updateStatus).toHaveBeenCalledTimes(1)
  })

  it('refuses on the mixed case: one blocking match plus one predicted-stranded match', async () => {
    const { useCase, updateStatus, notifyWinners } = makeUseCase({
      unfinished: [
        matchRow({
          id: 'match-2',
          homeTeam: 'CR Flamengo',
          awayTeam: 'CR Vasco da Gama',
          status: 'scheduled',
          matchDate: new Date('2026-08-05T21:30:00Z'),
        }),
        matchRow({ id: 'match-1', status: 'postponed' }),
      ],
      predictionCounts: { 'match-1': 1 },
    })

    const result = await useCase.execute({ inviteCode: CODE, force: false })

    expect(result.outcome).toBe('blocked')
    if (result.outcome !== 'blocked') return
    expect(result.blocking).toEqual([
      { id: 'match-2', label: 'CR Flamengo × CR Vasco da Gama', live: false },
    ])
    expect(result.predicted).toEqual([
      { id: 'match-1', label: 'São Paulo FC × Santos FC', predictionCount: 1 },
    ])
    expect(updateStatus).not.toHaveBeenCalled()
    expect(notifyWinners).not.toHaveBeenCalled()
  })

  it('refuses while a match is still scheduled for the future', async () => {
    const { useCase, updateStatus, notifyWinners } = makeUseCase({
      unfinished: [
        matchRow({
          id: 'match-2',
          homeTeam: 'CR Flamengo',
          awayTeam: 'CR Vasco da Gama',
          status: 'scheduled',
          matchDate: new Date('2026-08-05T21:30:00Z'),
        }),
      ],
    })

    const result = await useCase.execute({ inviteCode: CODE, force: false })

    expect(result.outcome).toBe('blocked')
    if (result.outcome !== 'blocked') return
    expect(result.blocking).toEqual([
      { id: 'match-2', label: 'CR Flamengo × CR Vasco da Gama', live: false },
    ])
    expect(updateStatus).not.toHaveBeenCalled()
    expect(notifyWinners).not.toHaveBeenCalled()
  })

  it('refuses while a match is live', async () => {
    const { useCase, updateStatus } = makeUseCase({
      unfinished: [matchRow({ id: 'match-3', status: 'live' })],
    })

    const result = await useCase.execute({ inviteCode: CODE, force: false })

    expect(result.outcome).toBe('blocked')
    if (result.outcome !== 'blocked') return
    expect(result.blocking[0]?.live).toBe(true)
    expect(updateStatus).not.toHaveBeenCalled()
  })

  it('closes anyway when forced, reporting what was left open', async () => {
    const { useCase, updateStatus } = makeUseCase({
      unfinished: [
        matchRow({ id: 'match-3', status: 'live' }),
        matchRow({ id: 'match-1', status: 'postponed' }),
      ],
    })

    const result = await useCase.execute({ inviteCode: CODE, force: true })

    expect(result.outcome).toBe('closed')
    if (result.outcome !== 'closed') return
    expect(result.blocking.map((m) => m.id)).toEqual(['match-3'])
    expect(result.stranded.map((m) => m.id)).toEqual(['match-1'])
    expect(updateStatus).toHaveBeenCalledTimes(1)
  })

  it('reports an unknown invite code without touching anything', async () => {
    const { useCase, updateStatus, notifyWinners } = makeUseCase({ pool: null })

    const result = await useCase.execute({ inviteCode: 'NOPE1234', force: false })

    expect(result).toEqual({ outcome: 'not-found' })
    expect(updateStatus).not.toHaveBeenCalled()
    expect(notifyWinners).not.toHaveBeenCalled()
  })

  it('is idempotent: an already-closed pool is reported, not re-notified', async () => {
    const { useCase, updateStatus, notifyWinners } = makeUseCase({
      pool: details({ status: 'closed' }),
    })

    const result = await useCase.execute({ inviteCode: CODE, force: false })

    expect(result).toEqual({
      outcome: 'not-active',
      poolName: 'Rafinha é careca!',
      status: 'closed',
    })
    expect(updateStatus).not.toHaveBeenCalled()
    expect(notifyWinners).not.toHaveBeenCalled()
  })

  it('splits the prize between tied winners', async () => {
    const { useCase } = makeUseCase({
      unfinished: [],
      ranking: [
        {
          position: 1,
          userId: 'user-1',
          name: 'Ana',
          totalPoints: 22,
          exactMatches: 1,
          isCurrentUser: false,
        },
        {
          position: 1,
          userId: 'user-2',
          name: 'Bia',
          totalPoints: 22,
          exactMatches: 1,
          isCurrentUser: false,
        },
      ],
    })

    const result = await useCase.execute({ inviteCode: CODE, force: false })

    expect(result.outcome).toBe('closed')
    if (result.outcome !== 'closed') return
    expect(result.winners.map((w) => w.name)).toEqual(['Ana', 'Bia'])
    expect(result.prizeShare).toBe(142)
  })

  it('closes a pool nobody scored in, with no winners and no notification', async () => {
    const { useCase, updateStatus, notifyWinners } = makeUseCase({
      unfinished: [],
      ranking: [],
    })

    const result = await useCase.execute({ inviteCode: CODE, force: false })

    expect(result.outcome).toBe('closed')
    if (result.outcome !== 'closed') return
    expect(result.winners).toEqual([])
    expect(result.prizeShare).toBe(0)
    expect(updateStatus).toHaveBeenCalledTimes(1)
    expect(notifyWinners).not.toHaveBeenCalled()
  })

  it('uppercases and trims the invite code before looking it up', async () => {
    const { useCase, poolRepo } = makeUseCase({ unfinished: [] })

    await useCase.execute({ inviteCode: '  9vzjq9j9 ', force: false })

    expect(poolRepo.findByInviteCode).toHaveBeenCalledWith('9VZJQ9J9')
  })
})
