import { describe, expect, it, vi } from 'vitest'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import { StatsUnlockPrice } from '../../domain/stats/StatsUnlockPrice'
import type { StatsUnlockRepository } from '../../domain/stats/StatsUnlockRepository.port'
import type { PaymentGateway } from '../ports/PaymentGateway.port'
import { UnlockStatsUseCase } from './UnlockStatsUseCase'

const price = StatsUnlockPrice.of(199)

// The use case only asks the aggregate one question, so the stub only answers it.
function poolStub(supportsStats = true) {
  return { id: 'p1', supportsParticipantStats: () => supportsStats }
}

function makeDeps(opts: { pool?: unknown; isMember?: boolean; isUnlocked?: boolean } = {}) {
  const poolRepo = {
    findById: vi.fn().mockResolvedValue(opts.pool === undefined ? poolStub() : opts.pool),
    isMember: vi.fn().mockResolvedValue(opts.isMember ?? true),
  } as unknown as PoolRepository
  const statsUnlockRepo = {
    isUnlocked: vi.fn().mockResolvedValue(opts.isUnlocked ?? false),
    listUnlockedUsers: vi.fn(),
  } as unknown as StatsUnlockRepository
  const paymentGateway = {
    createCheckoutSession: vi
      .fn()
      .mockResolvedValue({ payment: { id: 'pay1' }, checkoutUrl: 'https://pay' }),
    isConfigured: vi.fn().mockReturnValue(true),
  } as unknown as PaymentGateway
  return { poolRepo, statsUnlockRepo, paymentGateway }
}

describe('UnlockStatsUseCase', () => {
  it('rejects_non_member_with_not_member_error', async () => {
    const d = makeDeps({ isMember: false })
    const uc = new UnlockStatsUseCase(d.poolRepo, d.statsUnlockRepo, d.paymentGateway, price)
    await expect(uc.execute({ userId: 'u1', poolId: 'p1' })).rejects.toMatchObject({
      code: 'NOT_MEMBER',
    })
    expect(d.paymentGateway.createCheckoutSession).not.toHaveBeenCalled()
  })

  it('rejects_missing_pool_with_not_found', async () => {
    const d = makeDeps({ pool: null })
    const uc = new UnlockStatsUseCase(d.poolRepo, d.statsUnlockRepo, d.paymentGateway, price)
    await expect(uc.execute({ userId: 'u1', poolId: 'p1' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('rejects_already_unlocked_without_charging', async () => {
    const d = makeDeps({ isUnlocked: true })
    const uc = new UnlockStatsUseCase(d.poolRepo, d.statsUnlockRepo, d.paymentGateway, price)
    await expect(uc.execute({ userId: 'u1', poolId: 'p1' })).rejects.toMatchObject({
      code: 'ALREADY_UNLOCKED',
    })
    expect(d.paymentGateway.createCheckoutSession).not.toHaveBeenCalled()
  })

  it('creates_stats_unlock_checkout_at_price_amount', async () => {
    const d = makeDeps()
    const uc = new UnlockStatsUseCase(d.poolRepo, d.statsUnlockRepo, d.paymentGateway, price)
    const result = await uc.execute({ userId: 'u1', poolId: 'p1' })

    expect(d.paymentGateway.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        poolId: 'p1',
        amount: 199,
        platformFee: 199,
        type: 'stats_unlock',
      }),
    )
    expect(result.amount).toBe(199)
    expect(result.payment).toEqual({ payment: { id: 'pay1' }, checkoutUrl: 'https://pay' })
  })
  it('rejects_scope_without_stats_without_charging', async () => {
    const d = makeDeps({ pool: poolStub(false) })
    const uc = new UnlockStatsUseCase(d.poolRepo, d.statsUnlockRepo, d.paymentGateway, price)
    await expect(uc.execute({ userId: 'u1', poolId: 'p1' })).rejects.toMatchObject({
      code: 'SCOPE_UNSUPPORTED',
    })
    expect(d.paymentGateway.createCheckoutSession).not.toHaveBeenCalled()
  })

  it('answers_already_unlocked_before_scope_for_a_grandfathered_holder', async () => {
    const d = makeDeps({ pool: poolStub(false), isUnlocked: true })
    const uc = new UnlockStatsUseCase(d.poolRepo, d.statsUnlockRepo, d.paymentGateway, price)
    await expect(uc.execute({ userId: 'u1', poolId: 'p1' })).rejects.toMatchObject({
      code: 'ALREADY_UNLOCKED',
    })
    expect(d.paymentGateway.createCheckoutSession).not.toHaveBeenCalled()
  })
})
