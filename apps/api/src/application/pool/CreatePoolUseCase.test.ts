import { describe, expect, it, vi } from 'vitest'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import type { PaymentGateway } from '../ports/PaymentGateway.port'
import { CreatePoolUseCase } from './CreatePoolUseCase'

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
    getMembersWithPhone: vi.fn(),
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
  entryFee: 100,
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
        getEffectiveFeeRate: () => 0,
      },
      activeCompetition,
      0.05,
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
        getEffectiveFeeRate: () => 0,
      },
      activeCompetition,
      0.05,
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
        getEffectiveFeeRate: () => 0,
      },
      activeCompetition,
      0.05,
    )

    await expect(useCase.execute({ ...baseInput, couponCode: 'FREE' })).rejects.toMatchObject({
      code: 'COUPON_EXHAUSTED',
    })
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('creates pool without coupon flow when couponCode is absent', async () => {
    const incrementUsage = vi.fn()
    const validateCoupon = vi.fn()
    const save = vi.fn(async (p) => p)

    const useCase = new CreatePoolUseCase(
      makeRepo({ save }),
      makeGateway(),
      { validateCoupon, incrementUsage, getEffectiveFeeRate: () => 0.05 },
      activeCompetition,
      0.05,
    )

    const result = await useCase.execute(baseInput)

    expect(validateCoupon).not.toHaveBeenCalled()
    expect(incrementUsage).not.toHaveBeenCalled()
    expect(save).toHaveBeenCalledTimes(1)
    expect(result.couponCode).toBeNull()
    expect(result.discountPercent).toBe(0)
  })
})
