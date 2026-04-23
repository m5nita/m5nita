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
}) {
  const pool = { id: 'pool-1', competitionId: 'comp-1' }
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
})
