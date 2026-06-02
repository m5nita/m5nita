import type {
  PoolListItem,
  PoolListStatusFilter,
  PoolRepository,
} from '../../domain/pool/PoolRepository.port'

type Input = {
  userId: string
  status?: PoolListStatusFilter
}

export class GetUserPoolsUseCase {
  constructor(private readonly poolRepo: PoolRepository) {}

  async execute(input: Input): Promise<PoolListItem[]> {
    return this.poolRepo.findUserPools(input.userId, input.status)
  }
}
