import * as Sentry from '@sentry/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaimedPayment, PaymentRepository } from '../../domain/payment/PaymentRepository.port'
import { Pool } from '../../domain/pool/Pool'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import { EntryFee } from '../../domain/shared/EntryFee'
import { InviteCode } from '../../domain/shared/InviteCode'
import { PoolScope } from '../../domain/shared/PoolScope'
import { PoolStatus } from '../../domain/shared/PoolStatus'
import type { StatsUnlockRepository } from '../../domain/stats/StatsUnlockRepository.port'
import type { UnitOfWork } from '../ports/UnitOfWork.port'
import { CompleteCheckoutUseCase } from './CompleteCheckoutUseCase'

vi.mock('@sentry/node', () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}))

function makeClaimed(overrides: Partial<ClaimedPayment> = {}): ClaimedPayment {
  return { id: 'pay-1', poolId: 'pool-1', userId: 'user-1', type: 'entry', ...overrides }
}

function makePaymentsRepo(opts: {
  claimed: ClaimedPayment | null
  exists?: boolean
}): PaymentRepository {
  return {
    claimCompletion: vi.fn(async () => opts.claimed),
    exists: vi.fn(async () => opts.exists ?? true),
  }
}

function makePool(status: PoolStatus): Pool {
  return new Pool(
    'pool-1',
    'Test Pool',
    EntryFee.of(5000),
    'owner-1',
    InviteCode.from('ABCD1234'),
    'comp-1',
    PoolScope.wholeCompetition(),
    status,
    true,
    null,
  )
}

function makePoolsRepo(pool: Pool | null, opts: { memberCreated?: boolean } = {}): PoolRepository {
  return {
    findById: vi.fn(async () => pool),
    findByIdWithDetails: vi.fn(),
    findByInviteCode: vi.fn(),
    findActiveByCompetition: vi.fn(),
    findAllActive: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
    updateStatus: vi.fn(),
    getMemberCount: vi.fn(),
    isMember: vi.fn(),
    addMember: vi.fn(async () => opts.memberCreated ?? true),
    removeMember: vi.fn(),
    findUserPools: vi.fn(),
    getMembers: vi.fn(),
    getMembersWithContact: vi.fn(),
  } as unknown as PoolRepository
}

function makeStatsUnlocksRepo(): StatsUnlockRepository {
  return {
    isUnlocked: vi.fn(async () => false),
    listUnlockedUsers: vi.fn(async () => []),
    grant: vi.fn(async () => undefined),
  }
}

function makeUseCase(
  repos: {
    payments: PaymentRepository
    pools: PoolRepository
    statsUnlocks: StatsUnlockRepository
  },
  onPoolActivated?: (poolId: string) => Promise<void>,
) {
  const unitOfWork: UnitOfWork = {
    run: (work) =>
      work({
        ...repos,
        predictions: {} as never,
        ranking: {} as never,
      }),
  }
  return new CompleteCheckoutUseCase(unitOfWork, onPoolActivated)
}

describe('CompleteCheckoutUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('claims the payment, activates the pending pool and adds the member on first call', async () => {
    const pool = makePool(PoolStatus.Pending)
    const payments = makePaymentsRepo({ claimed: makeClaimed() })
    const pools = makePoolsRepo(pool)
    const statsUnlocks = makeStatsUnlocksRepo()

    await makeUseCase({ payments, pools, statsUnlocks }).execute({ paymentId: 'pay-1' })

    expect(payments.claimCompletion).toHaveBeenCalledWith('pay-1')
    expect(pool.status).toBe(PoolStatus.Active)
    expect(pools.updateStatus).toHaveBeenCalledWith('pool-1', PoolStatus.Active)
    expect(pools.addMember).toHaveBeenCalledWith('pool-1', 'user-1', 'pay-1')
    expect(statsUnlocks.grant).not.toHaveBeenCalled()
  })

  it('short-circuits on a duplicate webhook (CAS claims nothing, payment exists)', async () => {
    const payments = makePaymentsRepo({ claimed: null, exists: true })
    const pools = makePoolsRepo(makePool(PoolStatus.Active))
    const statsUnlocks = makeStatsUnlocksRepo()

    await makeUseCase({ payments, pools, statsUnlocks }).execute({ paymentId: 'pay-1' })

    expect(pools.findById).not.toHaveBeenCalled()
    expect(pools.addMember).not.toHaveBeenCalled()
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
  })

  it('reports to Sentry when the payment record does not exist', async () => {
    const payments = makePaymentsRepo({ claimed: null, exists: false })
    const pools = makePoolsRepo(null)
    const statsUnlocks = makeStatsUnlocksRepo()

    await makeUseCase({ payments, pools, statsUnlocks }).execute({ paymentId: 'missing' })

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      '[payment] record not found for id=missing',
      'error',
    )
    expect(pools.addMember).not.toHaveBeenCalled()
  })

  it('grants the stats entitlement and never touches pool/membership for stats_unlock', async () => {
    const payments = makePaymentsRepo({ claimed: makeClaimed({ type: 'stats_unlock' }) })
    const pools = makePoolsRepo(makePool(PoolStatus.Active))
    const statsUnlocks = makeStatsUnlocksRepo()

    await makeUseCase({ payments, pools, statsUnlocks }).execute({ paymentId: 'pay-1' })

    expect(statsUnlocks.grant).toHaveBeenCalledWith({
      userId: 'user-1',
      poolId: 'pool-1',
      paymentId: 'pay-1',
    })
    expect(pools.findById).not.toHaveBeenCalled()
    expect(pools.updateStatus).not.toHaveBeenCalled()
    expect(pools.addMember).not.toHaveBeenCalled()
  })

  it('only claims for other payment types (prize)', async () => {
    const payments = makePaymentsRepo({ claimed: makeClaimed({ type: 'prize' }) })
    const pools = makePoolsRepo(makePool(PoolStatus.Active))
    const statsUnlocks = makeStatsUnlocksRepo()

    await makeUseCase({ payments, pools, statsUnlocks }).execute({ paymentId: 'pay-1' })

    expect(statsUnlocks.grant).not.toHaveBeenCalled()
    expect(pools.findById).not.toHaveBeenCalled()
    expect(pools.addMember).not.toHaveBeenCalled()
  })

  it('does not rewrite the status of an already-active pool but still adds the member', async () => {
    const payments = makePaymentsRepo({ claimed: makeClaimed() })
    const pools = makePoolsRepo(makePool(PoolStatus.Active))
    const statsUnlocks = makeStatsUnlocksRepo()

    await makeUseCase({ payments, pools, statsUnlocks }).execute({ paymentId: 'pay-1' })

    expect(pools.updateStatus).not.toHaveBeenCalled()
    expect(pools.addMember).toHaveBeenCalledWith('pool-1', 'user-1', 'pay-1')
  })

  it('still adds the member when the pool row is missing (FK enforces existence)', async () => {
    const payments = makePaymentsRepo({ claimed: makeClaimed() })
    const pools = makePoolsRepo(null)
    const statsUnlocks = makeStatsUnlocksRepo()

    await makeUseCase({ payments, pools, statsUnlocks }).execute({ paymentId: 'pay-1' })

    expect(pools.updateStatus).not.toHaveBeenCalled()
    expect(pools.addMember).toHaveBeenCalledWith('pool-1', 'user-1', 'pay-1')
  })

  it('resolves when the member already exists (idempotent addMember)', async () => {
    const payments = makePaymentsRepo({ claimed: makeClaimed() })
    const pools = makePoolsRepo(makePool(PoolStatus.Active), { memberCreated: false })
    const statsUnlocks = makeStatsUnlocksRepo()

    await expect(
      makeUseCase({ payments, pools, statsUnlocks }).execute({ paymentId: 'pay-1' }),
    ).resolves.toBeUndefined()
  })
})

describe('CompleteCheckoutUseCase — pool-activated hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fires once with the id of the pool it just activated', async () => {
    const onPoolActivated = vi.fn(async () => {})
    const payments = makePaymentsRepo({ claimed: makeClaimed() })
    const pools = makePoolsRepo(makePool(PoolStatus.Pending))

    await makeUseCase(
      { payments, pools, statsUnlocks: makeStatsUnlocksRepo() },
      onPoolActivated,
    ).execute({ paymentId: 'pay-1' })

    expect(onPoolActivated).toHaveBeenCalledExactlyOnceWith('pool-1')
  })

  it('does not fire for a pool that was already live (a joining member)', async () => {
    const onPoolActivated = vi.fn(async () => {})
    const payments = makePaymentsRepo({ claimed: makeClaimed({ userId: 'joiner-1' }) })
    const pools = makePoolsRepo(makePool(PoolStatus.Active))

    await makeUseCase(
      { payments, pools, statsUnlocks: makeStatsUnlocksRepo() },
      onPoolActivated,
    ).execute({ paymentId: 'pay-1' })

    expect(pools.addMember).toHaveBeenCalledOnce()
    expect(onPoolActivated).not.toHaveBeenCalled()
  })

  it('does not fire on a duplicate confirmation of the same payment', async () => {
    const onPoolActivated = vi.fn(async () => {})
    const payments = makePaymentsRepo({ claimed: null, exists: true })
    const pools = makePoolsRepo(makePool(PoolStatus.Active))

    await makeUseCase(
      { payments, pools, statsUnlocks: makeStatsUnlocksRepo() },
      onPoolActivated,
    ).execute({ paymentId: 'pay-1' })

    expect(onPoolActivated).not.toHaveBeenCalled()
  })

  it('does not fire for a stats-unlock payment', async () => {
    const onPoolActivated = vi.fn(async () => {})
    const payments = makePaymentsRepo({ claimed: makeClaimed({ type: 'stats_unlock' }) })
    const pools = makePoolsRepo(makePool(PoolStatus.Pending))

    await makeUseCase(
      { payments, pools, statsUnlocks: makeStatsUnlocksRepo() },
      onPoolActivated,
    ).execute({ paymentId: 'pay-1' })

    expect(onPoolActivated).not.toHaveBeenCalled()
  })

  it('keeps the payment completed, the pool live and the member in place when the hook throws', async () => {
    const onPoolActivated = vi.fn(async () => {
      throw new Error('push service down')
    })
    const pool = makePool(PoolStatus.Pending)
    const payments = makePaymentsRepo({ claimed: makeClaimed() })
    const pools = makePoolsRepo(pool)

    await expect(
      makeUseCase(
        { payments, pools, statsUnlocks: makeStatsUnlocksRepo() },
        onPoolActivated,
      ).execute({ paymentId: 'pay-1' }),
    ).resolves.toBeUndefined()

    expect(pool.status).toBe(PoolStatus.Active)
    expect(pools.updateStatus).toHaveBeenCalledWith('pool-1', PoolStatus.Active)
    expect(pools.addMember).toHaveBeenCalledWith('pool-1', 'user-1', 'pay-1')
    expect(Sentry.captureException).toHaveBeenCalledOnce()
  })

  it('works without a hook configured', async () => {
    const payments = makePaymentsRepo({ claimed: makeClaimed() })
    const pools = makePoolsRepo(makePool(PoolStatus.Pending))

    await expect(
      makeUseCase({ payments, pools, statsUnlocks: makeStatsUnlocksRepo() }).execute({
        paymentId: 'pay-1',
      }),
    ).resolves.toBeUndefined()
  })
})
