import type { TransactionalRepositories, UnitOfWork } from '../../application/ports/UnitOfWork.port'
import type { db as DbClient } from '../../db/client'
import { DrizzlePaymentRepository } from './DrizzlePaymentRepository'
import { DrizzlePoolRepository } from './DrizzlePoolRepository'
import { DrizzlePredictionRepository } from './DrizzlePredictionRepository'
import { DrizzleRankingRepository } from './DrizzleRankingRepository'
import { DrizzleStatsUnlockRepository } from './DrizzleStatsUnlockRepository'

/**
 * Drizzle adapter for the UnitOfWork port: opens one transaction and hands the
 * use case repositories bound to it. A throw inside `work` rolls the whole
 * transaction back.
 */
export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(private readonly db: typeof DbClient) {}

  run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) =>
      work({
        payments: new DrizzlePaymentRepository(tx),
        pools: new DrizzlePoolRepository(tx),
        statsUnlocks: new DrizzleStatsUnlockRepository(tx),
        predictions: new DrizzlePredictionRepository(tx),
        ranking: new DrizzleRankingRepository(tx),
      }),
    )
  }
}
