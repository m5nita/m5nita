import { describe, expect, it, vi } from 'vitest'
import { DrizzleStatsUnlockRepository } from './DrizzleStatsUnlockRepository'

describe('DrizzleStatsUnlockRepository.grant', () => {
  it('inserts the entitlement idempotently (ON CONFLICT DO NOTHING)', async () => {
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined)
    const values = vi.fn(() => ({ onConflictDoNothing }))
    const insert = vi.fn(() => ({ values }))
    const repo = new DrizzleStatsUnlockRepository({ insert } as unknown as never)

    await repo.grant({ userId: 'user-1', poolId: 'pool-1', paymentId: 'pay-1' })

    expect(values).toHaveBeenCalledWith({
      userId: 'user-1',
      poolId: 'pool-1',
      paymentId: 'pay-1',
    })
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1)
  })
})
