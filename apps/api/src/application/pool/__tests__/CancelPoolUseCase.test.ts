import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Pool } from '../../../domain/pool/Pool'
import { PoolError } from '../../../domain/pool/PoolError'
import type { PoolRepository } from '../../../domain/pool/PoolRepository.port'
import { EntryFee } from '../../../domain/shared/EntryFee'
import { InviteCode } from '../../../domain/shared/InviteCode'
import { PoolStatus } from '../../../domain/shared/PoolStatus'
import { CancelPoolUseCase } from '../CancelPoolUseCase'

function createPool(overrides: { ownerId?: string; status?: PoolStatus } = {}): Pool {
  return new Pool(
    'pool-1',
    'Test Pool',
    EntryFee.of(2000),
    overrides.ownerId ?? 'owner-1',
    InviteCode.generate(),
    'comp-1',
    null,
    overrides.status ?? PoolStatus.Active,
    true,
    null,
  )
}

describe('CancelPoolUseCase', () => {
  let poolRepo: PoolRepository
  let hasPrizePayments: ReturnType<typeof vi.fn>
  let useCase: CancelPoolUseCase

  beforeEach(() => {
    poolRepo = {
      findById: vi.fn(),
      updateStatus: vi.fn(),
    } as unknown as PoolRepository

    hasPrizePayments = vi.fn().mockResolvedValue(false)
    useCase = new CancelPoolUseCase(poolRepo, hasPrizePayments)
  })

  it('cancelsPool_withoutRefunds', async () => {
    const pool = createPool()
    vi.mocked(poolRepo.findById).mockResolvedValue(pool)

    await useCase.execute({ userId: 'owner-1', poolId: 'pool-1' })

    expect(pool.status).toEqual(PoolStatus.Cancelled)
    expect(poolRepo.updateStatus).toHaveBeenCalledWith('pool-1', PoolStatus.Cancelled)
  })

  it('blocksCancellation_whenPrizeWithdrawalExists', async () => {
    const pool = createPool()
    vi.mocked(poolRepo.findById).mockResolvedValue(pool)
    hasPrizePayments.mockResolvedValue(true)

    await expect(useCase.execute({ userId: 'owner-1', poolId: 'pool-1' })).rejects.toThrow(
      PoolError,
    )
    expect(poolRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('throwsForbidden_whenNotOwner', async () => {
    const pool = createPool({ ownerId: 'owner-1' })
    vi.mocked(poolRepo.findById).mockResolvedValue(pool)

    await expect(useCase.execute({ userId: 'other-user', poolId: 'pool-1' })).rejects.toThrow(
      PoolError,
    )
  })

  it('throwsNotFound_whenPoolMissing', async () => {
    vi.mocked(poolRepo.findById).mockResolvedValue(null)

    await expect(useCase.execute({ userId: 'owner-1', poolId: 'pool-1' })).rejects.toThrow(
      PoolError,
    )
  })
})
