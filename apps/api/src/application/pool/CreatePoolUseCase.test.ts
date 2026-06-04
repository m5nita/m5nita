import { describe, expect, it, vi } from 'vitest'
import { Match } from '../../domain/match/Match'
import { MatchStatus } from '../../domain/match/MatchStatus'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import type { Clock } from '../../domain/shared/Clock'
import type { PaymentGateway } from '../ports/PaymentGateway.port'
import { CreatePoolUseCase, type MatchFinder } from './CreatePoolUseCase'

const FIXED_NOW = new Date('2026-05-22T12:00:00Z')
const fixedClock: Clock = { now: () => FIXED_NOW }
const noMatchFinder: MatchFinder = vi.fn(async () => null)
const upcomingMatchFinder = (
  overrides: Partial<{ id: string; competitionId: string; kickoffAt: Date }> = {},
): MatchFinder =>
  vi.fn(
    async () =>
      new Match(
        overrides.id ?? '11111111-1111-4111-8111-111111111111',
        overrides.competitionId ?? 'comp-1',
        overrides.kickoffAt ?? new Date('2026-05-25T18:00:00Z'),
        null,
        MatchStatus.Scheduled,
      ),
  )

function makeRepo(overrides: Partial<PoolRepository> = {}): PoolRepository {
  const base: Partial<PoolRepository> = {
    findById: vi.fn(),
    findByIdWithDetails: vi.fn(),
    findByInviteCode: vi.fn(),
    findActiveByCompetition: vi.fn(),
    findAllActive: vi.fn(),
    save: vi.fn(async (p) => p),
    delete: vi.fn(),
    updateStatus: vi.fn(),
    getMemberCount: vi.fn(),
    isMember: vi.fn(),
    addMember: vi.fn(),
    removeMember: vi.fn(),
    findUserPools: vi.fn(),
    getMembers: vi.fn(),
    getMembersWithContact: vi.fn(),
  }
  return { ...base, ...overrides } as PoolRepository
}

function makeGateway(overrides: Partial<PaymentGateway> = {}): PaymentGateway {
  return {
    createCheckoutSession: vi.fn(async ({ poolId }) => ({
      payment: { id: `pay-${poolId}` },
      checkoutUrl: 'https://checkout.example/abc',
    })),
    isConfigured: vi.fn(() => true),
    ...overrides,
  } as PaymentGateway
}

const activeCompetition = async (id: string) => ({ id, status: 'active' })
const baseInput = {
  userId: 'user-1',
  name: 'La Liga 33ª',
  entryFee: 500,
  competitionId: 'comp-1',
  matchdayFrom: 33,
  matchdayTo: 33,
}

describe('CreatePoolUseCase', () => {
  it('does not consume coupon when gateway fails', async () => {
    const incrementUsage = vi.fn(async () => true)
    const save = vi.fn(async (p) => p)
    const createCheckoutSession = vi.fn(async () => {
      throw new Error('gateway 502')
    })

    const useCase = new CreatePoolUseCase(
      makeRepo({ save }),
      makeGateway({ createCheckoutSession }),
      {
        validateCoupon: vi.fn(async () => ({
          valid: true as const,
          couponId: 'coup-1',
          discountPercent: 100,
        })),
        incrementUsage,
      },
      activeCompetition,
      noMatchFinder,
      fixedClock,
    )

    await expect(useCase.execute({ ...baseInput, couponCode: 'FREE' })).rejects.toThrow(
      'gateway 502',
    )

    expect(save).toHaveBeenCalledTimes(1)
    expect(createCheckoutSession).toHaveBeenCalledTimes(1)
    expect(incrementUsage).not.toHaveBeenCalled()
  })

  it('saves pool before gateway so the payment FK resolves, increments coupon after', async () => {
    const calls: string[] = []
    const incrementUsage = vi.fn(async () => {
      calls.push('increment')
      return true
    })
    const save = vi.fn(async (p) => {
      calls.push('save')
      return p
    })
    const createCheckoutSession = vi.fn(async ({ poolId }) => {
      calls.push('gateway')
      return {
        payment: { id: `pay-${poolId}` },
        checkoutUrl: 'https://checkout.example/abc',
      }
    })

    const useCase = new CreatePoolUseCase(
      makeRepo({ save }),
      makeGateway({ createCheckoutSession }),
      {
        validateCoupon: vi.fn(async () => ({
          valid: true as const,
          couponId: 'coup-1',
          discountPercent: 100,
        })),
        incrementUsage,
      },
      activeCompetition,
      noMatchFinder,
      fixedClock,
    )

    await useCase.execute({ ...baseInput, couponCode: 'FREE' })

    expect(calls).toEqual(['save', 'gateway', 'increment'])
  })

  it('throws COUPON_EXHAUSTED when coupon race-exhausts after gateway succeeds', async () => {
    const incrementUsage = vi.fn(async () => false)
    const save = vi.fn(async (p) => p)

    const useCase = new CreatePoolUseCase(
      makeRepo({ save }),
      makeGateway(),
      {
        validateCoupon: vi.fn(async () => ({
          valid: true as const,
          couponId: 'coup-1',
          discountPercent: 100,
        })),
        incrementUsage,
      },
      activeCompetition,
      noMatchFinder,
      fixedClock,
    )

    await expect(useCase.execute({ ...baseInput, couponCode: 'FREE' })).rejects.toMatchObject({
      code: 'COUPON_EXHAUSTED',
    })
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('creates single-match pool when matchId is provided', async () => {
    const save = vi.fn(async (p) => p)
    const findMatch = upcomingMatchFinder()
    const useCase = new CreatePoolUseCase(
      makeRepo({ save }),
      makeGateway(),
      {
        validateCoupon: vi.fn(),
        incrementUsage: vi.fn(),
      },
      activeCompetition,
      findMatch,
      fixedClock,
    )

    const result = await useCase.execute({
      userId: 'user-1',
      name: 'Final La Liga',
      entryFee: 500,
      competitionId: 'comp-1',
      matchId: '11111111-1111-4111-8111-111111111111',
    })

    expect(findMatch).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
    expect(result.pool.scope.kind).toBe('single-match')
    expect(result.pool.scope.matchId).toBe('11111111-1111-4111-8111-111111111111')
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('rejects MATCH_UNAVAILABLE when matchId does not exist', async () => {
    const useCase = new CreatePoolUseCase(
      makeRepo(),
      makeGateway(),
      { validateCoupon: vi.fn(), incrementUsage: vi.fn() },
      activeCompetition,
      vi.fn(async () => null),
      fixedClock,
    )

    await expect(
      useCase.execute({
        userId: 'user-1',
        name: 'Bad',
        entryFee: 500,
        competitionId: 'comp-1',
        matchId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toMatchObject({ code: 'MATCH_UNAVAILABLE' })
  })

  it('rejects MATCH_UNAVAILABLE when match belongs to a different competition', async () => {
    const findMatch = upcomingMatchFinder({ competitionId: 'other-comp' })
    const useCase = new CreatePoolUseCase(
      makeRepo(),
      makeGateway(),
      { validateCoupon: vi.fn(), incrementUsage: vi.fn() },
      activeCompetition,
      findMatch,
      fixedClock,
    )

    await expect(
      useCase.execute({
        userId: 'user-1',
        name: 'Bad',
        entryFee: 500,
        competitionId: 'comp-1',
        matchId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toMatchObject({ code: 'MATCH_UNAVAILABLE' })
  })

  it('rejects MATCH_UNAVAILABLE when kickoff has already passed', async () => {
    const findMatch = upcomingMatchFinder({ kickoffAt: new Date('2026-05-22T11:59:59Z') })
    const useCase = new CreatePoolUseCase(
      makeRepo(),
      makeGateway(),
      { validateCoupon: vi.fn(), incrementUsage: vi.fn() },
      activeCompetition,
      findMatch,
      fixedClock,
    )

    await expect(
      useCase.execute({
        userId: 'user-1',
        name: 'Bad',
        entryFee: 500,
        competitionId: 'comp-1',
        matchId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toMatchObject({ code: 'MATCH_UNAVAILABLE' })
  })

  it('rejects INVALID_SCOPE when both matchId and matchdayFrom are present', async () => {
    const useCase = new CreatePoolUseCase(
      makeRepo(),
      makeGateway(),
      { validateCoupon: vi.fn(), incrementUsage: vi.fn() },
      activeCompetition,
      upcomingMatchFinder(),
      fixedClock,
    )

    await expect(
      useCase.execute({
        userId: 'user-1',
        name: 'Mixed',
        entryFee: 500,
        competitionId: 'comp-1',
        matchId: '11111111-1111-4111-8111-111111111111',
        matchdayFrom: 30,
        matchdayTo: 30,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SCOPE' })
  })

  it('creates pool without coupon flow when couponCode is absent', async () => {
    const incrementUsage = vi.fn()
    const validateCoupon = vi.fn()
    const save = vi.fn(async (p) => p)

    const useCase = new CreatePoolUseCase(
      makeRepo({ save }),
      makeGateway(),
      { validateCoupon, incrementUsage },
      activeCompetition,
      noMatchFinder,
      fixedClock,
    )

    const result = await useCase.execute(baseInput)

    expect(validateCoupon).not.toHaveBeenCalled()
    expect(incrementUsage).not.toHaveBeenCalled()
    expect(save).toHaveBeenCalledTimes(1)
    expect(result.couponCode).toBeNull()
    expect(result.discountPercent).toBe(0)
  })
})
