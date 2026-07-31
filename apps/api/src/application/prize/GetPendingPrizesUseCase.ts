import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import type { GetPrizeInfoUseCase } from './GetPrizeInfoUseCase'

type Input = {
  userId: string
}

type PendingPrizeWithdrawal = {
  amount: number
  /** Já mascarada por GetPrizeInfoUseCase. */
  pixKey: string
  status: string
  requestedAt: string
}

type PendingPrizeItem = {
  poolId: string
  poolName: string
  winnerShare: number
  winnerCount: number
  /** null enquanto o ganhador não enviou a chave PIX. */
  withdrawal: PendingPrizeWithdrawal | null
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
      // Sai da lista só quando o dinheiro cai — até lá a home acompanha.
      if (!info.isWinner || info.withdrawal?.status === 'completed') continue

      items.push({
        poolId: pool.id,
        poolName: pool.name,
        winnerShare: info.winnerShare,
        winnerCount: info.winnerCount,
        withdrawal: info.withdrawal
          ? {
              amount: info.withdrawal.amount,
              pixKey: info.withdrawal.pixKey,
              status: info.withdrawal.status,
              requestedAt: info.withdrawal.createdAt,
            }
          : null,
      })
    }

    return { items }
  }
}
