import { describe, expect, it, vi } from 'vitest'
import type { db as DbClient } from '../../db/client'
import { DrizzlePaymentRepository } from './DrizzlePaymentRepository'
import { DrizzlePoolRepository } from './DrizzlePoolRepository'
import { DrizzlePredictionRepository } from './DrizzlePredictionRepository'
import { DrizzleRankingRepository } from './DrizzleRankingRepository'
import { DrizzleStatsUnlockRepository } from './DrizzleStatsUnlockRepository'
import { DrizzleUnitOfWork } from './DrizzleUnitOfWork'

function makeDb() {
  const tx = { tag: 'tx' }
  const transaction = vi.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx))
  return { db: { transaction } as unknown as typeof DbClient, tx, transaction }
}

describe('DrizzleUnitOfWork', () => {
  it('runs work inside db.transaction with all repos bound to the SAME tx', async () => {
    const { db, tx, transaction } = makeDb()
    const uow = new DrizzleUnitOfWork(db)

    const result = await uow.run(async (repos) => {
      expect(repos.payments).toBeInstanceOf(DrizzlePaymentRepository)
      expect(repos.pools).toBeInstanceOf(DrizzlePoolRepository)
      expect(repos.statsUnlocks).toBeInstanceOf(DrizzleStatsUnlockRepository)
      expect(repos.predictions).toBeInstanceOf(DrizzlePredictionRepository)
      expect(repos.ranking).toBeInstanceOf(DrizzleRankingRepository)
      // the binding is the atomicity guarantee — every repo must hold the tx,
      // not the root client
      expect((repos.payments as unknown as { db: unknown }).db).toBe(tx)
      expect((repos.pools as unknown as { db: unknown }).db).toBe(tx)
      expect((repos.statsUnlocks as unknown as { db: unknown }).db).toBe(tx)
      expect((repos.predictions as unknown as { db: unknown }).db).toBe(tx)
      expect((repos.ranking as unknown as { db: unknown }).db).toBe(tx)
      return 'done'
    })

    expect(result).toBe('done')
    expect(transaction).toHaveBeenCalledTimes(1)
  })

  it('propagates errors from work (transaction rollback path)', async () => {
    const { db } = makeDb()
    const uow = new DrizzleUnitOfWork(db)

    await expect(
      uow.run(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
  })
})
