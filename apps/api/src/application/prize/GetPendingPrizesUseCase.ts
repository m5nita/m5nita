import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import type { GetPrizeInfoUseCase } from './GetPrizeInfoUseCase'

type Input = {
  userId: string
}

type PendingPrizeItem = {
  poolId: string
  poolName: string
  winnerShare: number
  winnerCount: number
}

type Output = {
  items: PendingPrizeItem[]
}

export class GetPendingPrizesUseCase {
  constructor(
    private readonly poolRepo: PoolRepository,
    private readonly getPrizeInfoUseCase: GetPrizeInfoUseCase,
  ) {}

  async execute({ userId }: Input): Promise<Output> {
    const pools = await this.poolRepo.findUserPools(userId)
    const closedPools = pools.filter((p) => p.status === 'closed')

    const items: PendingPrizeItem[] = []
    for (const pool of closedPools) {
      const info = await this.getPrizeInfoUseCase.execute({ poolId: pool.id, userId })
      if (info.isWinner && info.withdrawal === null) {
        items.push({
          poolId: pool.id,
          poolName: pool.name,
          winnerShare: info.winnerShare,
          winnerCount: info.winnerCount,
        })
      }
    }

    return { items }
  }
}
