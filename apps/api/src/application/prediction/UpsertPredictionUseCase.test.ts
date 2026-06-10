import { describe, expect, it } from 'vitest'
import type { MatchData, MatchRepository } from '../../domain/match/MatchRepository.port'
import { Pool } from '../../domain/pool/Pool'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import { PredictionError } from '../../domain/prediction/PredictionError'
import type { PredictionRepository } from '../../domain/prediction/PredictionRepository.port'
import type { Clock } from '../../domain/shared/Clock'
import { EntryFee } from '../../domain/shared/EntryFee'
import { InviteCode } from '../../domain/shared/InviteCode'
import { MatchdayRange } from '../../domain/shared/MatchdayRange'
import { PoolScope } from '../../domain/shared/PoolScope'
import { PoolStatus } from '../../domain/shared/PoolStatus'
import { UpsertPredictionUseCase } from './UpsertPredictionUseCase'

const NOW = new Date('2026-06-10T12:00:00Z')
const FUTURE = new Date('2026-06-20T12:00:00Z')
const IN_SCOPE_MATCH = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OUT_OF_SCOPE_MATCH = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function makePool(scope: PoolScope, competitionId = 'comp-1'): Pool {
  return new Pool(
    'pool-1',
    'Test Pool',
    EntryFee.of(5000),
    'owner-1',
    InviteCode.from('ABCD1234'),
    competitionId,
    scope,
    PoolStatus.Active,
    true,
    null,
  )
}

function makeMatch(overrides: Partial<MatchData> = {}): MatchData {
  return {
    id: IN_SCOPE_MATCH,
    externalId: 'ext-1',
    competitionId: 'comp-1',
    homeTeam: 'Brazil',
    awayTeam: 'Argentina',
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
    matchday: 4,
    matchDate: FUTURE,
    status: 'scheduled',
    ...overrides,
  }
}

function makeUseCase(opts: { pool: Pool; match: MatchData; isMember?: boolean }) {
  const saved: { called: boolean } = { called: false }
  const poolRepo = {
    findById: async () => opts.pool,
    isMember: async () => opts.isMember ?? true,
  } as unknown as PoolRepository
  const matchRepo = { findById: async () => opts.match } as unknown as MatchRepository
  const predictionRepo = {
    findByUserPoolMatch: async () => null,
    save: async (p: unknown) => {
      saved.called = true
      return p
    },
  } as unknown as PredictionRepository
  const clock: Clock = { now: () => NOW }
  const uc = new UpsertPredictionUseCase(predictionRepo, poolRepo, matchRepo, clock)
  return { uc, saved }
}

const baseInput = {
  userId: 'user-1',
  poolId: 'pool-1',
  matchId: IN_SCOPE_MATCH,
  homeScore: 2,
  awayScore: 1,
}

describe('UpsertPredictionUseCase — scope guard', () => {
  it('rejects a match from a different competition (whole-competition pool)', async () => {
    const { uc, saved } = makeUseCase({
      pool: makePool(PoolScope.wholeCompetition(), 'comp-1'),
      match: makeMatch({ competitionId: 'comp-2' }),
    })

    await expect(uc.execute(baseInput)).rejects.toMatchObject({ code: 'MATCH_NOT_IN_POOL' })
    expect(saved.called).toBe(false)
  })

  it('rejects a match whose matchday is outside the pool range (range pool)', async () => {
    const range = MatchdayRange.create(3, 5) as MatchdayRange
    const { uc, saved } = makeUseCase({
      pool: makePool(PoolScope.fromRange(range), 'comp-1'),
      match: makeMatch({ matchday: 7 }),
    })

    await expect(uc.execute(baseInput)).rejects.toMatchObject({ code: 'MATCH_NOT_IN_POOL' })
    expect(saved.called).toBe(false)
  })

  it('rejects a match that is not the target of a single-match pool', async () => {
    const { uc, saved } = makeUseCase({
      pool: makePool(PoolScope.singleMatch(IN_SCOPE_MATCH), 'comp-1'),
      match: makeMatch({ id: OUT_OF_SCOPE_MATCH }),
    })

    await expect(uc.execute({ ...baseInput, matchId: OUT_OF_SCOPE_MATCH })).rejects.toMatchObject({
      code: 'MATCH_NOT_IN_POOL',
    })
    expect(saved.called).toBe(false)
  })

  it('accepts an in-scope match and persists the prediction (range pool)', async () => {
    const range = MatchdayRange.create(3, 5) as MatchdayRange
    const { uc, saved } = makeUseCase({
      pool: makePool(PoolScope.fromRange(range), 'comp-1'),
      match: makeMatch({ matchday: 4 }),
    })

    await uc.execute(baseInput)
    expect(saved.called).toBe(true)
  })

  it('accepts the target match of a single-match pool', async () => {
    const { uc, saved } = makeUseCase({
      pool: makePool(PoolScope.singleMatch(IN_SCOPE_MATCH), 'comp-1'),
      match: makeMatch({ id: IN_SCOPE_MATCH }),
    })

    await uc.execute(baseInput)
    expect(saved.called).toBe(true)
  })

  it('rejects on scope before checking the prediction deadline (out-of-scope + started)', async () => {
    const { uc } = makeUseCase({
      pool: makePool(PoolScope.wholeCompetition(), 'comp-1'),
      match: makeMatch({ competitionId: 'comp-2', status: 'finished', matchDate: NOW }),
    })

    await expect(uc.execute(baseInput)).rejects.toMatchObject({ code: 'MATCH_NOT_IN_POOL' })
  })

  it('throws MATCH_NOT_IN_POOL as a PredictionError instance', async () => {
    const { uc } = makeUseCase({
      pool: makePool(PoolScope.wholeCompetition(), 'comp-1'),
      match: makeMatch({ competitionId: 'comp-2' }),
    })

    await expect(uc.execute(baseInput)).rejects.toBeInstanceOf(PredictionError)
  })
})
