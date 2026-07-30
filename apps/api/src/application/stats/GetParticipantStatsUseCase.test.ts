import { describe, expect, it, vi } from 'vitest'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import { RangeScoringPolicy } from '../../domain/scoring/ScoringPolicy'
import type { StatsRepository } from '../../domain/stats/StatsRepository.port'
import { StatsUnlockPrice } from '../../domain/stats/StatsUnlockPrice'
import type { StatsUnlockRepository } from '../../domain/stats/StatsUnlockRepository.port'
import { GetParticipantStatsUseCase } from './GetParticipantStatsUseCase'

const price = StatsUnlockPrice.of(199)

// The use case asks the aggregate two things: can it carry statistics, and which
// scoring policy applies. The stub answers exactly those.
function poolStub(supportsStats: boolean) {
  return {
    id: 'p1',
    supportsParticipantStats: () => supportsStats,
    scoringPolicy: () => RangeScoringPolicy,
  }
}

function makeUseCase(opts: {
  supportsStats: boolean
  isMember?: boolean
  isUnlocked?: boolean
  pool?: unknown
}) {
  const poolRepo = {
    findById: vi
      .fn()
      .mockResolvedValue(opts.pool === undefined ? poolStub(opts.supportsStats) : opts.pool),
    isMember: vi.fn().mockResolvedValue(opts.isMember ?? true),
  } as unknown as PoolRepository

  const statsUnlockRepo = {
    isUnlocked: vi.fn().mockResolvedValue(opts.isUnlocked ?? false),
    listUnlockedUsers: vi.fn(),
    grant: vi.fn(),
  } as unknown as StatsUnlockRepository

  const statsRepo = {
    participantRow: vi.fn().mockResolvedValue({
      finishedCount: 4,
      exactCount: 1,
      resultCount: 2,
      pointsTotal: 9,
      position: 2,
      prevPosition: 3,
    }),
    recomputeSnapshot: vi.fn(),
    viewerFinishedPredictions: vi.fn().mockResolvedValue([]),
  } as unknown as StatsRepository

  const useCase = new GetParticipantStatsUseCase(
    poolRepo,
    statsUnlockRepo,
    price,
    statsRepo,
    vi.fn().mockResolvedValue([]),
    vi.fn().mockResolvedValue([]),
  )
  return { useCase, poolRepo, statsUnlockRepo, statsRepo }
}

describe('GetParticipantStatsUseCase — scope gate', () => {
  it('refuses a pool whose scope carries no meaningful statistics', async () => {
    const { useCase } = makeUseCase({ supportsStats: false })

    await expect(useCase.execute({ userId: 'u1', poolId: 'p1' })).rejects.toMatchObject({
      code: 'SCOPE_UNSUPPORTED',
    })
  })

  it('still offers the teaser on a whole-competition pool', async () => {
    const { useCase } = makeUseCase({ supportsStats: true })

    const result = await useCase.execute({ userId: 'u1', poolId: 'p1' })

    expect(result).toMatchObject({ unlocked: false, price: { centavos: 199 } })
  })

  it('serves the panel to someone who already paid, even on an unsupported scope', async () => {
    const { useCase } = makeUseCase({ supportsStats: false, isUnlocked: true })

    const result = await useCase.execute({ userId: 'u1', poolId: 'p1' })

    expect(result.unlocked).toBe(true)
  })

  it('checks membership before the scope rule', async () => {
    const { useCase, statsUnlockRepo } = makeUseCase({ supportsStats: false, isMember: false })

    await expect(useCase.execute({ userId: 'u1', poolId: 'p1' })).rejects.toMatchObject({
      code: 'NOT_MEMBER',
    })
    expect(statsUnlockRepo.isUnlocked).not.toHaveBeenCalled()
  })

  it('reports a missing pool before anything else', async () => {
    const { useCase } = makeUseCase({ supportsStats: false, pool: null })

    await expect(useCase.execute({ userId: 'u1', poolId: 'p1' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})
