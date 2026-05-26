import { describe, expect, it } from 'vitest'
import type { MatchRepository } from '../../domain/match/MatchRepository.port'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import type { PredictionRepository } from '../../domain/prediction/PredictionRepository.port'
import type { Clock } from '../../domain/shared/Clock'
import { GetMatchPredictionsUseCase } from './GetMatchPredictionsUseCase'

function makeUseCase(overrides: {
  match: {
    id: string
    status: string
    homeScore: number | null
    awayScore: number | null
    competitionId: string
    matchDate: Date
  }
  predictions: {
    userId: string
    name: string
    homeScore: number
    awayScore: number
    points: number | null
  }[]
  members: { userId: string; name: string }[]
  viewerIsMember?: boolean
  poolMatchId?: string | null
}) {
  const pool = {
    id: 'pool-1',
    competitionId: 'comp-1',
    scope: { matchId: overrides.poolMatchId ?? null },
  }
  const poolRepo = {
    findById: async () => pool,
    isMember: async () => overrides.viewerIsMember ?? true,
    getMembers: async () => overrides.members,
  } as unknown as PoolRepository
  const matchRepo = { findById: async () => overrides.match } as unknown as MatchRepository
  const predictionRepo = {
    findByPoolMatch: async () => overrides.predictions,
  } as unknown as PredictionRepository
  const clock: Clock = { now: () => new Date('2026-04-23T22:00:00Z') }
  return new GetMatchPredictionsUseCase(predictionRepo, poolRepo, matchRepo, clock)
}

describe('GetMatchPredictionsUseCase — live scoring', () => {
  it('returns matchStatus=live and computes points on the fly', async () => {
    const uc = makeUseCase({
      match: {
        id: 'm-1',
        status: 'live',
        homeScore: 2,
        awayScore: 1,
        competitionId: 'comp-1',
        matchDate: new Date('2026-04-23T20:00:00Z'),
      },
      predictions: [
        { userId: 'u-ana', name: 'Ana', homeScore: 2, awayScore: 1, points: null },
        { userId: 'u-ped', name: 'Ped', homeScore: 3, awayScore: 2, points: null },
        { userId: 'u-car', name: 'Car', homeScore: 4, awayScore: 0, points: null },
        { userId: 'u-jul', name: 'Jul', homeScore: 1, awayScore: 1, points: null },
      ],
      members: [
        { userId: 'u-viewer', name: 'Viewer' },
        { userId: 'u-ana', name: 'Ana' },
        { userId: 'u-ped', name: 'Ped' },
        { userId: 'u-car', name: 'Car' },
        { userId: 'u-jul', name: 'Jul' },
      ],
    })

    const res = await uc.execute({ viewerUserId: 'u-viewer', poolId: 'pool-1', matchId: 'm-1' })

    expect(res.matchStatus).toBe('live')
    expect(res.predictors.map((p) => [p.userId, p.points])).toEqual([
      ['u-ana', 10],
      ['u-ped', 7],
      ['u-car', 5],
      ['u-jul', 0],
    ])
  })

  it('preserves stored points and sorts desc when match is finished', async () => {
    const uc = makeUseCase({
      match: {
        id: 'm-1',
        status: 'finished',
        homeScore: 2,
        awayScore: 1,
        competitionId: 'comp-1',
        matchDate: new Date('2026-04-23T18:00:00Z'),
      },
      predictions: [
        { userId: 'u-low', name: 'Low', homeScore: 0, awayScore: 0, points: 0 },
        { userId: 'u-mid', name: 'Mid', homeScore: 3, awayScore: 2, points: 7 },
        { userId: 'u-hi', name: 'Hi', homeScore: 2, awayScore: 1, points: 10 },
      ],
      members: [
        { userId: 'u-viewer', name: 'V' },
        { userId: 'u-low', name: 'Low' },
        { userId: 'u-mid', name: 'Mid' },
        { userId: 'u-hi', name: 'Hi' },
      ],
    })

    const res = await uc.execute({ viewerUserId: 'u-viewer', poolId: 'pool-1', matchId: 'm-1' })

    expect(res.matchStatus).toBe('finished')
    expect(res.predictors.map((p) => p.userId)).toEqual(['u-hi', 'u-mid', 'u-low'])
  })

  it('breaks ties by name asc when multiple predictors have the same points', async () => {
    const uc = makeUseCase({
      match: {
        id: 'm-1',
        status: 'live',
        homeScore: 0,
        awayScore: 0,
        competitionId: 'comp-1',
        matchDate: new Date('2026-04-23T20:00:00Z'),
      },
      predictions: [
        // three wrong guesses, all score 0 → tie → sort by name asc
        { userId: 'u-c', name: 'Carlos', homeScore: 2, awayScore: 0, points: null },
        { userId: 'u-a', name: 'Ana', homeScore: 3, awayScore: 1, points: null },
        { userId: 'u-b', name: 'Bia', homeScore: 4, awayScore: 2, points: null },
      ],
      members: [
        { userId: 'u-viewer', name: 'V' },
        { userId: 'u-a', name: 'Ana' },
        { userId: 'u-b', name: 'Bia' },
        { userId: 'u-c', name: 'Carlos' },
      ],
    })

    const res = await uc.execute({ viewerUserId: 'u-viewer', poolId: 'pool-1', matchId: 'm-1' })

    expect(res.predictors.map((p) => p.userId)).toEqual(['u-a', 'u-b', 'u-c'])
  })
})

describe('GetMatchPredictionsUseCase — single-match pool decomposition', () => {
  it('returns category + bonus on each predictor when pool is single-match and match is live', async () => {
    const uc = makeUseCase({
      poolMatchId: 'm-1',
      match: {
        id: 'm-1',
        status: 'live',
        homeScore: 2,
        awayScore: 1,
        competitionId: 'comp-1',
        matchDate: new Date('2026-04-23T20:00:00Z'),
      },
      predictions: [
        // real 2x1
        { userId: 'u-ana', name: 'Ana', homeScore: 2, awayScore: 1, points: null }, // exact: 10+4=14
        { userId: 'u-ped', name: 'Ped', homeScore: 3, awayScore: 2, points: null }, // winner+diff: 7+2=9
      ],
      members: [
        { userId: 'u-viewer', name: 'Viewer' },
        { userId: 'u-ana', name: 'Ana' },
        { userId: 'u-ped', name: 'Ped' },
      ],
    })

    const res = await uc.execute({ viewerUserId: 'u-viewer', poolId: 'pool-1', matchId: 'm-1' })

    const ana = res.predictors.find((p) => p.userId === 'u-ana')
    expect(ana).toBeDefined()
    expect(ana?.points).toBe(14)
    expect(ana?.category).toBe(10)
    expect(ana?.bonus).toBe(4)

    const ped = res.predictors.find((p) => p.userId === 'u-ped')
    expect(ped).toBeDefined()
    expect(ped?.points).toBe(9)
    expect(ped?.category).toBe(7)
    expect(ped?.bonus).toBe(2)
  })

  it('returns category + bonus for finished single-match pool by recomputing from match scores', async () => {
    const uc = makeUseCase({
      poolMatchId: 'm-1',
      match: {
        id: 'm-1',
        status: 'finished',
        homeScore: 2,
        awayScore: 1,
        competitionId: 'comp-1',
        matchDate: new Date('2026-04-23T18:00:00Z'),
      },
      predictions: [
        // points stored may be from legacy 10/7/5/0; we recompute decomposition from match scores
        { userId: 'u-ped', name: 'Ped', homeScore: 3, awayScore: 2, points: 9 },
      ],
      members: [
        { userId: 'u-viewer', name: 'Viewer' },
        { userId: 'u-ped', name: 'Ped' },
      ],
    })

    const res = await uc.execute({ viewerUserId: 'u-viewer', poolId: 'pool-1', matchId: 'm-1' })
    const ped = res.predictors.find((p) => p.userId === 'u-ped')
    expect(ped).toBeDefined()
    expect(ped?.points).toBe(9)
    expect(ped?.category).toBe(7)
    expect(ped?.bonus).toBe(2)
  })

  it('omits category and bonus for range (multi-match) pools', async () => {
    const uc = makeUseCase({
      // poolMatchId omitted → null
      match: {
        id: 'm-1',
        status: 'live',
        homeScore: 2,
        awayScore: 1,
        competitionId: 'comp-1',
        matchDate: new Date('2026-04-23T20:00:00Z'),
      },
      predictions: [{ userId: 'u-ped', name: 'Ped', homeScore: 3, awayScore: 2, points: null }],
      members: [
        { userId: 'u-viewer', name: 'Viewer' },
        { userId: 'u-ped', name: 'Ped' },
      ],
    })

    const res = await uc.execute({ viewerUserId: 'u-viewer', poolId: 'pool-1', matchId: 'm-1' })
    const ped = res.predictors.find((p) => p.userId === 'u-ped')
    expect(ped).toBeDefined()
    expect(ped?.points).toBe(7)
    expect(ped?.category).toBeUndefined()
    expect(ped?.bonus).toBeUndefined()
  })
})
