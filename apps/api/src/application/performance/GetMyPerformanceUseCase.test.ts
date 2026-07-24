import { describe, expect, it, vi } from 'vitest'
import type {
  PerformanceReadRepository,
  UserPoolFact,
} from '../../domain/performance/PerformanceReadRepository.port'
import type {
  PoolStandingRow,
  RankingRepository,
} from '../../domain/ranking/RankingRepository.port'
import { GetMyPerformanceUseCase } from './GetMyPerformanceUseCase'

function fact(overrides: Partial<UserPoolFact> = {}): UserPoolFact {
  return {
    poolId: 'p1',
    name: 'Bolão',
    status: 'closed',
    entryFeeCentavos: 5000,
    discountPercent: 0,
    memberCount: 2,
    entryPaidCentavos: 5000,
    joinedAt: new Date('2026-04-01T00:00:00.000Z'),
    settledAt: new Date('2026-05-01T00:00:00.000Z'),
    ...overrides,
  }
}

function standing(
  poolId: string,
  userId: string,
  totalPoints: number,
  exactMatches = 0,
): PoolStandingRow {
  return { poolId, userId, name: userId, totalPoints, exactMatches }
}

function makePerfRepo(facts: UserPoolFact[], withdrawn: string[] = []): PerformanceReadRepository {
  return {
    getUserPoolFacts: vi.fn().mockResolvedValue(facts),
    getUserWithdrawnPoolIds: vi.fn().mockResolvedValue(withdrawn),
  }
}

function makeRankingRepo(standings: PoolStandingRow[]): RankingRepository {
  return {
    getStandings: vi.fn(),
    recomputeStandings: vi.fn(),
    getPoolRanking: vi.fn(),
    getPoolMemberCount: vi.fn(),
    getStandingsForPools: vi.fn().mockResolvedValue(standings),
  }
}

describe('GetMyPerformanceUseCase', () => {
  it('returns an empty summary and skips the standings read when the user has no pools', async () => {
    const perf = makePerfRepo([])
    const ranking = makeRankingRepo([])

    const s = await new GetMyPerformanceUseCase(perf, ranking).execute({ userId: 'u1' })

    expect(s.participei).toBe(0)
    expect(s.saldo.centavos).toBe(0)
    expect(s.aproveitamento).toBeNull()
    expect(ranking.getStandingsForPools).not.toHaveBeenCalled()
  })

  it('counts a win when the user is first in a closed pool ranking', async () => {
    // 2 members × 5000 × 0.95 = 9500 prize; single winner takes it all.
    const perf = makePerfRepo([fact({ poolId: 'p1', memberCount: 2 })])
    const ranking = makeRankingRepo([standing('p1', 'u1', 30, 3), standing('p1', 'u2', 10, 1)])

    const s = await new GetMyPerformanceUseCase(perf, ranking).execute({ userId: 'u1' })

    expect(s.vitorias).toBe(1)
    expect(s.derrotas).toBe(0)
    expect(s.premiosConquistados.centavos).toBe(9500)
    expect(s.saldo.centavos).toBe(4500)
  })

  it('counts a loss when the user is not first', async () => {
    const perf = makePerfRepo([fact({ poolId: 'p1' })])
    const ranking = makeRankingRepo([standing('p1', 'u2', 30, 3), standing('p1', 'u1', 10, 1)])

    const s = await new GetMyPerformanceUseCase(perf, ranking).execute({ userId: 'u1' })

    expect(s.vitorias).toBe(0)
    expect(s.derrotas).toBe(1)
    expect(s.premiosConquistados.centavos).toBe(0)
    expect(s.saldo.centavos).toBe(-5000)
  })

  it('treats a tie at the top as a win split among co-winners', async () => {
    const perf = makePerfRepo([fact({ poolId: 'p1', memberCount: 2 })])
    const ranking = makeRankingRepo([standing('p1', 'u1', 25, 2), standing('p1', 'u2', 25, 2)])

    const s = await new GetMyPerformanceUseCase(perf, ranking).execute({ userId: 'u1' })

    expect(s.vitorias).toBe(1)
    expect(s.premiosConquistados.centavos).toBe(4750) // 9500 split 2 ways
  })

  it('excludes prizes already withdrawn from a sacar', async () => {
    const perf = makePerfRepo([fact({ poolId: 'p1', memberCount: 2 })], ['p1'])
    const ranking = makeRankingRepo([standing('p1', 'u1', 30, 3), standing('p1', 'u2', 10, 1)])

    const s = await new GetMyPerformanceUseCase(perf, ranking).execute({ userId: 'u1' })

    expect(s.premiosConquistados.centavos).toBe(9500)
    expect(s.aSacar.centavos).toBe(0)
  })

  it('does not treat in-progress pools as decided', async () => {
    const perf = makePerfRepo([fact({ poolId: 'p1', status: 'active', settledAt: null })])
    const ranking = makeRankingRepo([])

    const s = await new GetMyPerformanceUseCase(perf, ranking).execute({ userId: 'u1' })

    expect(s.emAndamento).toBe(1)
    expect(s.vitorias).toBe(0)
    expect(s.derrotas).toBe(0)
    expect(s.aproveitamento).toBeNull()
    expect(ranking.getStandingsForPools).not.toHaveBeenCalled()
  })

  it('reads standings for many closed pools in a SINGLE call (no per-pool N+1)', async () => {
    const facts = Array.from({ length: 25 }, (_, i) => fact({ poolId: `p${i}` }))
    const standings = facts.flatMap((f) => [
      standing(f.poolId, 'u1', 30, 3),
      standing(f.poolId, 'u2', 10, 1),
    ])
    const perf = makePerfRepo(facts)
    const ranking = makeRankingRepo(standings)

    const s = await new GetMyPerformanceUseCase(perf, ranking).execute({ userId: 'u1' })

    expect(s.participei).toBe(25)
    expect(s.vitorias).toBe(25)
    expect(ranking.getStandingsForPools).toHaveBeenCalledTimes(1)
    expect(perf.getUserPoolFacts).toHaveBeenCalledTimes(1)
    expect(perf.getUserWithdrawnPoolIds).toHaveBeenCalledTimes(1)
  })
})
