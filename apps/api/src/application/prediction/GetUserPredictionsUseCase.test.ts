import { describe, expect, it } from 'vitest'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import type {
  PredictionRepository,
  PredictionWithMatch,
} from '../../domain/prediction/PredictionRepository.port'
import { RangeScoringPolicy, SingleMatchScoringPolicy } from '../../domain/scoring/ScoringPolicy'
import { GetUserPredictionsUseCase } from './GetUserPredictionsUseCase'

function makeSingleMatchPool() {
  return {
    id: 'pool-1',
    competitionId: 'comp-1',
    scope: { kind: 'single-match' as const, matchId: 'm-1', contains: () => true },
    scoringPolicy: () => SingleMatchScoringPolicy,
  }
}

function basePwm(): PredictionWithMatch {
  return {
    id: 'pred-1',
    userId: 'u-1',
    poolId: 'pool-1',
    matchId: 'm-1',
    homeScore: 2,
    awayScore: 1,
    advancePick: null,
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
      extraTimeHomeScore: null,
      extraTimeAwayScore: null,
      penaltyHomeScore: null,
      penaltyAwayScore: null,
      winner: null,
      duration: null,
      status: 'scheduled',
      stage: 'league',
      group: null,
      homeFlag: '',
      awayFlag: '',
    },
  }
}

function makeUseCase(predictions: PredictionWithMatch[]) {
  const pool = {
    id: 'pool-1',
    competitionId: 'comp-1',
    scope: { kind: 'whole-competition', contains: () => true },
    scoringPolicy: () => RangeScoringPolicy,
  }
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

  it('single-match scope filters out predictions for any other match (legacy test)', async () => {
    const a = basePwm()
    a.id = 'pred-a'
    a.matchId = 'm-1'
    a.match.id = 'm-1'

    const b = basePwm()
    b.id = 'pred-b'
    b.matchId = 'm-2'
    b.match.id = 'm-2'

    const singleMatchScope = {
      kind: 'single-match' as const,
      contains: (m: { id: string }) => m.id === 'm-1',
    }
    const pool = {
      id: 'pool-1',
      competitionId: 'comp-1',
      scope: singleMatchScope,
      scoringPolicy: () => SingleMatchScoringPolicy,
    }
    const poolRepo = { findById: async () => pool } as unknown as PoolRepository
    const predictionRepo = {
      findByUserPool: async () => [a, b],
    } as unknown as PredictionRepository
    const uc = new GetUserPredictionsUseCase(predictionRepo, poolRepo)

    const res = await uc.execute({ userId: 'u-1', poolId: 'pool-1' })
    expect(res).toHaveLength(1)
    expect(res[0]?.id).toBe('pred-a')
  })
})

describe('GetUserPredictionsUseCase — single-match pool decomposition', () => {
  it('includes category/bonus when pool is single-match and match is live', async () => {
    const pred = basePwm()
    pred.homeScore = 3
    pred.awayScore = 2
    pred.points = null
    pred.match.status = 'live'
    pred.match.homeScore = 2
    pred.match.awayScore = 1

    const pool = makeSingleMatchPool()
    const poolRepo = { findById: async () => pool } as unknown as PoolRepository
    const predictionRepo = {
      findByUserPool: async () => [pred],
    } as unknown as PredictionRepository
    const uc = new GetUserPredictionsUseCase(predictionRepo, poolRepo)

    const res = await uc.execute({ userId: 'u-1', poolId: 'pool-1' })
    expect(res[0]?.points).toBe(9)
    expect(res[0]?.category).toBe(7)
    expect(res[0]?.bonus).toBe(2)
  })

  it('includes category/bonus when pool is single-match and match is finished (recomputed)', async () => {
    const pred = basePwm()
    pred.homeScore = 3
    pred.awayScore = 2
    pred.points = 9 // stored
    pred.match.status = 'finished'
    pred.match.homeScore = 2
    pred.match.awayScore = 1

    const pool = makeSingleMatchPool()
    const poolRepo = { findById: async () => pool } as unknown as PoolRepository
    const predictionRepo = {
      findByUserPool: async () => [pred],
    } as unknown as PredictionRepository
    const uc = new GetUserPredictionsUseCase(predictionRepo, poolRepo)

    const res = await uc.execute({ userId: 'u-1', poolId: 'pool-1' })
    expect(res[0]?.points).toBe(9)
    expect(res[0]?.category).toBe(7)
    expect(res[0]?.bonus).toBe(2)
  })

  it('omits category/bonus for multi-match (range/competition) pools', async () => {
    const pred = basePwm()
    pred.homeScore = 3
    pred.awayScore = 2
    pred.points = null
    pred.match.status = 'live'
    pred.match.homeScore = 2
    pred.match.awayScore = 1

    const uc = makeUseCase([pred]) // existing helper uses 'whole-competition' scope
    const res = await uc.execute({ userId: 'u-1', poolId: 'pool-1' })
    expect(res[0]?.points).toBe(7)
    expect(res[0]?.category).toBeUndefined()
    expect(res[0]?.bonus).toBeUndefined()
  })
})

describe('GetUserPredictionsUseCase — knockout advance bonus (range pool)', () => {
  it('exposes advanceBonus on a finished penalty-decided knockout (range)', async () => {
    const pred = basePwm()
    pred.homeScore = 1
    pred.awayScore = 1
    pred.advancePick = 'home'
    pred.points = 12
    pred.match.stage = 'final'
    pred.match.status = 'finished'
    pred.match.homeScore = 1
    pred.match.awayScore = 1
    pred.match.winner = 'home'
    pred.match.duration = 'penalty_shootout'

    const uc = makeUseCase([pred])
    const res = await uc.execute({ userId: 'u-1', poolId: 'pool-1' })

    expect(res[0]?.points).toBe(12)
    expect(res[0]?.advanceBonus).toBe(2)
    expect(res[0]?.category).toBeUndefined()
  })

  it('adds a live +2 during extra time when the picked side leads (range)', async () => {
    const pred = basePwm()
    pred.homeScore = 0
    pred.awayScore = 0
    pred.advancePick = 'home'
    pred.points = null
    pred.match.stage = 'semi'
    pred.match.status = 'live'
    pred.match.homeScore = 1
    pred.match.awayScore = 1
    pred.match.duration = 'extra_time'
    pred.match.extraTimeHomeScore = 1
    pred.match.extraTimeAwayScore = 0

    const uc = makeUseCase([pred])
    const res = await uc.execute({ userId: 'u-1', poolId: 'pool-1' })

    expect(res[0]?.points).toBe(7) // 5 (correct draw) + 2
    expect(res[0]?.advanceBonus).toBe(2)
  })
})
