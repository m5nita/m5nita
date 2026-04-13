import { PoolError } from '../../domain/pool/PoolError'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'

type Input = {
  userId: string
  poolId: string
}

export class CancelPoolUseCase {
  constructor(
    private readonly poolRepo: PoolRepository,
    private readonly hasPrizePayments: (poolId: string) => Promise<boolean>,
  ) {}

  async execute(input: Input): Promise<void> {
    const pool = await this.poolRepo.findById(input.poolId)
    if (!pool) throw new PoolError('NOT_FOUND', 'Bolão não encontrado')
    if (!pool.isOwnedBy(input.userId))
      throw new PoolError('FORBIDDEN', 'Apenas o criador pode cancelar')

    if (await this.hasPrizePayments(input.poolId)) {
      throw new PoolError(
        'PRIZE_WITHDRAWAL_REQUESTED',
        'Não é possível cancelar o bolão após solicitação de retirada do prêmio.',
      )
    }

    pool.cancel()
    await this.poolRepo.updateStatus(pool.id, pool.status)
  }
}
