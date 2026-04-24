import { describe, expect, it, vi } from 'vitest'
import type { PoolListItem, PoolRepository } from '../../domain/pool/PoolRepository.port'
import { GetPendingPrizesUseCase } from './GetPendingPrizesUseCase'
import type { GetPrizeInfoUseCase } from './GetPrizeInfoUseCase'

function makePoolListItem(overrides: Partial<PoolListItem>): PoolListItem {
  return {
    id: 'pool-x',
    name: 'Pool X',
    entryFee: 5000,
    status: 'active',
    competitionName: 'Copa',
    memberCount: 3,
    userPosition: null,
    userPoints: 0,
    nextMatchAt: null,
    lastMatchAt: null,
    hasLiveMatch: false,
    ...overrides,
  }
}

function makePoolRepo(items: PoolListItem[]): PoolRepository {
  return {
    findById: vi.fn(),
    findByIdWithDetails: vi.fn(),
    findByInviteCode: vi.fn(),
    findActiveByCompetition: vi.fn(),
    findAllActive: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
    updateStatus: vi.fn(),
    getMemberCount: vi.fn(),
    isMember: vi.fn(),
    addMember: vi.fn(),
    removeMember: vi.fn(),
    findUserPools: vi.fn().mockResolvedValue(items),
    getMembers: vi.fn(),
    getMembersWithPhone: vi.fn(),
  }
}

function makePrizeInfoUseCase(
  responses: Record<string, Awaited<ReturnType<GetPrizeInfoUseCase['execute']>>>,
): GetPrizeInfoUseCase {
  return {
    execute: vi.fn(async ({ poolId }: { poolId: string; userId: string }) => {
      const r = responses[poolId]
      if (!r) throw new Error(`unexpected poolId ${poolId}`)
      return r
    }),
  } as unknown as GetPrizeInfoUseCase
}

describe('GetPendingPrizesUseCase', () => {
  it('returns empty items when user has no closed pools', async () => {
    const repo = makePoolRepo([makePoolListItem({ id: 'p1', status: 'active' })])
    const prizeInfo = makePrizeInfoUseCase({})
    const useCase = new GetPendingPrizesUseCase(repo, prizeInfo)

    const result = await useCase.execute({ userId: 'user-1' })

    expect(result.items).toEqual([])
    expect(prizeInfo.execute).not.toHaveBeenCalled()
  })

  it('includes a closed pool where the user is a winner without a withdrawal', async () => {
    const repo = makePoolRepo([makePoolListItem({ id: 'p1', name: 'Bolão Um', status: 'closed' })])
    const prizeInfo = makePrizeInfoUseCase({
      p1: {
        prizeTotal: 14000,
        winnerCount: 1,
        winnerShare: 14000,
        isWinner: true,
        withdrawal: null,
        winners: [
          { userId: 'user-1', name: 'Igor', position: 1, totalPoints: 30, exactMatches: 3 },
        ],
      },
    })
    const useCase = new GetPendingPrizesUseCase(repo, prizeInfo)

    const result = await useCase.execute({ userId: 'user-1' })

    expect(result.items).toEqual([
      { poolId: 'p1', poolName: 'Bolão Um', winnerShare: 14000, winnerCount: 1 },
    ])
  })

  it('excludes a closed pool where the user already requested withdrawal', async () => {
    const repo = makePoolRepo([makePoolListItem({ id: 'p1', name: 'Bolão Um', status: 'closed' })])
    const prizeInfo = makePrizeInfoUseCase({
      p1: {
        prizeTotal: 14000,
        winnerCount: 1,
        winnerShare: 14000,
        isWinner: true,
        withdrawal: {
          id: 'w-1',
          amount: 14000,
          pixKeyType: 'cpf',
          pixKey: '***',
          status: 'pending',
          createdAt: new Date().toISOString(),
        },
        winners: [
          { userId: 'user-1', name: 'Igor', position: 1, totalPoints: 30, exactMatches: 3 },
        ],
      },
    })
    const useCase = new GetPendingPrizesUseCase(repo, prizeInfo)

    const result = await useCase.execute({ userId: 'user-1' })

    expect(result.items).toEqual([])
  })

  it('excludes a closed pool where the user is not a winner', async () => {
    const repo = makePoolRepo([makePoolListItem({ id: 'p1', name: 'Bolão Um', status: 'closed' })])
    const prizeInfo = makePrizeInfoUseCase({
      p1: {
        prizeTotal: 14000,
        winnerCount: 1,
        winnerShare: 14000,
        isWinner: false,
        withdrawal: null,
        winners: [
          { userId: 'user-2', name: 'Maria', position: 1, totalPoints: 30, exactMatches: 3 },
        ],
      },
    })
    const useCase = new GetPendingPrizesUseCase(repo, prizeInfo)

    const result = await useCase.execute({ userId: 'user-1' })

    expect(result.items).toEqual([])
  })

  it('returns multiple items for mixed-state closed pools', async () => {
    const repo = makePoolRepo([
      makePoolListItem({ id: 'p1', name: 'Bolão A', status: 'closed' }),
      makePoolListItem({ id: 'p2', name: 'Bolão B', status: 'active' }),
      makePoolListItem({ id: 'p3', name: 'Bolão C', status: 'closed' }),
    ])
    const prizeInfo = makePrizeInfoUseCase({
      p1: {
        prizeTotal: 10000,
        winnerCount: 1,
        winnerShare: 10000,
        isWinner: true,
        withdrawal: null,
        winners: [
          { userId: 'user-1', name: 'Igor', position: 1, totalPoints: 30, exactMatches: 3 },
        ],
      },
      p3: {
        prizeTotal: 20000,
        winnerCount: 2,
        winnerShare: 10000,
        isWinner: true,
        withdrawal: null,
        winners: [
          { userId: 'user-1', name: 'Igor', position: 1, totalPoints: 25, exactMatches: 2 },
          { userId: 'user-3', name: 'Pedro', position: 1, totalPoints: 25, exactMatches: 2 },
        ],
      },
    })
    const useCase = new GetPendingPrizesUseCase(repo, prizeInfo)

    const result = await useCase.execute({ userId: 'user-1' })

    expect(result.items).toEqual([
      { poolId: 'p1', poolName: 'Bolão A', winnerShare: 10000, winnerCount: 1 },
      { poolId: 'p3', poolName: 'Bolão C', winnerShare: 10000, winnerCount: 2 },
    ])
  })
})
