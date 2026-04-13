import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import { PrizeCalculation } from '../../domain/prize/PrizeCalculation'
import { PrizeWithdrawalError } from '../../domain/prize/PrizeWithdrawalError'
import type { PrizeWithdrawalRepository } from '../../domain/prize/PrizeWithdrawalRepository.port'
import type { RankingRepository } from '../../domain/ranking/RankingRepository.port'

type Input = {
  poolId: string
  userId: string
}

type WinnerOutput = {
  userId: string
  name: string | null
  position: number
  totalPoints: number
  exactMatches: number
}

type WithdrawalOutput = {
  id: string
  amount: number
  pixKeyType: string
  pixKey: string
  status: string
  createdAt: string
}

type Output = {
  prizeTotal: number
  winnerCount: number
  winnerShare: number
  isWinner: boolean
  withdrawal: WithdrawalOutput | null
  winners: WinnerOutput[]
}

export class GetPrizeInfoUseCase {
  constructor(
    private readonly poolRepo: PoolRepository,
    private readonly prizeWithdrawalRepo: PrizeWithdrawalRepository,
    private readonly rankingRepo: RankingRepository,
    private readonly getEffectiveFeeRate: (discountPercent: number) => number,
  ) {}

  async execute(input: Input): Promise<Output> {
    const poolDetails = await this.poolRepo.findByIdWithDetails(input.poolId)
    if (!poolDetails) {
      throw new PrizeWithdrawalError('NOT_FOUND', 'Bolão não encontrado')
    }

    if (poolDetails.status !== 'closed') {
      throw new PrizeWithdrawalError('POOL_NOT_CLOSED', 'O bolão ainda não foi finalizado.')
    }

    const discountPercent = poolDetails.coupon?.discountPercent ?? 0
    const effectiveRate = this.getEffectiveFeeRate(discountPercent)
    const prizeTotal = PrizeCalculation.calculatePrizeTotal(
      poolDetails.entryFee,
      poolDetails.memberCount,
      effectiveRate,
    )

    const ranking = await this.rankingRepo.getPoolRanking(input.poolId, input.userId)
    const winners = ranking.filter((r) => r.position === 1)
    const winnerCount = winners.length
    const winnerShare =
      winnerCount > 0 ? PrizeCalculation.calculateWinnerShare(prizeTotal, winnerCount) : null

    const isWinner = winners.some((w) => w.userId === input.userId)

    let withdrawal: WithdrawalOutput | null = null
    if (isWinner) {
      const existing = await this.prizeWithdrawalRepo.findByPoolAndUser(input.poolId, input.userId)
      if (existing) {
        withdrawal = {
          id: existing.id,
          amount: existing.amount,
          pixKeyType: existing.pixKeyType,
          pixKey: maskPixKey(existing.pixKey),
          status: existing.status,
          createdAt: existing.createdAt.toISOString(),
        }
      }
    }

    return {
      prizeTotal: prizeTotal.centavos,
      winnerCount,
      winnerShare: winnerShare?.centavos ?? 0,
      isWinner,
      withdrawal,
      winners: winners.map((w) => ({
        userId: w.userId,
        name: w.name,
        position: w.position,
        totalPoints: w.totalPoints,
        exactMatches: w.exactMatches,
      })),
    }
  }
}

function maskPixKey(key: string): string {
  if (key.length <= 4) return key
  return `${'*'.repeat(key.length - 4)}${key.slice(-4)}`
}
