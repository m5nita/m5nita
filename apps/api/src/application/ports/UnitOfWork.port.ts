import type { PaymentRepository } from '../../domain/payment/PaymentRepository.port'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import type { PredictionRepository } from '../../domain/prediction/PredictionRepository.port'
import type { RankingRepository } from '../../domain/ranking/RankingRepository.port'
import type { StatsUnlockRepository } from '../../domain/stats/StatsUnlockRepository.port'

export type TransactionalRepositories = {
  payments: PaymentRepository
  pools: PoolRepository
  statsUnlocks: StatsUnlockRepository
  predictions: PredictionRepository
  ranking: RankingRepository
}

/**
 * Transactional boundary port. run() executes `work` inside a single database
 * transaction: every repository handed to the callback is bound to that
 * transaction, and any error thrown by `work` rolls back all of its effects.
 */
export interface UnitOfWork {
  run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T>
}
