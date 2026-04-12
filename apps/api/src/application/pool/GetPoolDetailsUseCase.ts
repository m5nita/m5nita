import { PoolError } from '../../domain/pool/PoolError'
import type { PoolRepository, PoolWithDetails } from '../../domain/pool/PoolRepository.port'

type Input = {
  poolId: string
  userId: string
}

export class GetPoolDetailsUseCase {
  constructor(private readonly poolRepo: PoolRepository) {}

  async execute(input: Input): Promise<PoolWithDetails> {
    const pool = await this.poolRepo.findByInviteCode(input.poolId)
    if (!pool) throw new PoolError('NOT_FOUND', 'Bolão não encontrado')
    return pool
  }
}
