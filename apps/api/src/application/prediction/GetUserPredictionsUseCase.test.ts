import { describe, expect, it } from 'vitest'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import type {
  PredictionRepository,
  PredictionWithMatch,
} from '../../domain/prediction/PredictionRepository.port'
import { GetUserPredictionsUseCase } from './GetUserPredictionsUseCase'

function basePwm(): PredictionWithMatch {
  return {
    id: 'pred-1',
    userId: 'u-1',
    poolId: 'pool-1',
    matchId: 'm-1',
    homeScore: 2,
    awayScore: 1,
    points: null,
    match: {
      id: 'm-1',
      competitionId: 'comp-1',
      matchday: 32,
      matchDate: new Date('2026-04-23T20:00:00Z'),
      homeTeam: 'A',
      awayTeam: 'B',
      homeScore: null,
      awayScore: null,
      status: 'scheduled',
      stage: 'league',
      group: null,
      homeFlag: '',
      awayFlag: '',
    },
  }
}

function makeUseCase(predictions: PredictionWithMatch[]) {
  const pool = { id: 'pool-1', competitionId: 'comp-1', matchdayRange: null }
  const poolRepo = { findById: async () => pool } as unknown as PoolRepository
  const predictionRepo = {
    findByUserPool: async () => predictions,
  } as unknown as PredictionRepository
  return new GetUserPredictionsUseCase(predictionRepo, poolRepo)
}

describe('GetUserPredictionsUseCase — live scoring', () => {
  it('injects computed points for predictions on live matches (exact match = 10)', async () => {
    const pred = basePwm()
    pred.homeScore = 2
    pred.awayScore = 1
    pred.points = null
    pred.match.status = 'live'
    pred.match.homeScore = 2
    pred.match.awayScore = 1

    const uc = makeUseCase([pred])
    const res = await uc.execute({ userId: 'u-1', poolId: 'pool-1' })

    expect(res[0]?.points).toBe(10)
  })

  it('keeps stored points for finished matches (does not recompute)', async () => {
    const pred = basePwm()
    pred.homeScore = 2
    pred.awayScore = 1
    pred.points = 5
    pred.match.status = 'finished'
    pred.match.homeScore = 4
    pred.match.awayScore = 0

    const uc = makeUseCase([pred])
    const res = await uc.execute({ userId: 'u-1', poolId: 'pool-1' })

    expect(res[0]?.points).toBe(5)
  })

  it('keeps null points for scheduled matches', async () => {
    const pred = basePwm()
    pred.points = null
    pred.match.status = 'scheduled'

    const uc = makeUseCase([pred])
    const res = await uc.execute({ userId: 'u-1', poolId: 'pool-1' })

    expect(res[0]?.points).toBeNull()
  })

  it('returns null on live match whose scores are still null (defensive)', async () => {
    const pred = basePwm()
    pred.points = null
    pred.match.status = 'live'
    pred.match.homeScore = null
    pred.match.awayScore = null

    const uc = makeUseCase([pred])
    const res = await uc.execute({ userId: 'u-1', poolId: 'pool-1' })

    expect(res[0]?.points).toBeNull()
  })
})
