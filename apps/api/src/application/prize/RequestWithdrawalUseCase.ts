import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import { PrizeCalculation } from '../../domain/prize/PrizeCalculation'
import { PrizeWithdrawalError } from '../../domain/prize/PrizeWithdrawalError'
import type {
  PrizeWithdrawal,
  PrizeWithdrawalRepository,
} from '../../domain/prize/PrizeWithdrawalRepository.port'
import type { RankingRepository } from '../../domain/ranking/RankingRepository.port'
import { PixKey } from '../../domain/shared/PixKey'
import type { NotificationService } from '../ports/NotificationService.port'

type Input = {
  poolId: string
  userId: string
  pixKeyType: string
  pixKey: string
}

export class RequestWithdrawalUseCase {
  constructor(
    private readonly poolRepo: PoolRepository,
    private readonly prizeWithdrawalRepo: PrizeWithdrawalRepository,
    private readonly rankingRepo: RankingRepository,
    private readonly notificationService: NotificationService,
    private readonly getEffectiveFeeRate: (discountPercent: number) => number,
  ) {}

  async execute(input: Input): Promise<PrizeWithdrawal> {
    const poolDetails = await this.poolRepo.findByIdWithDetails(input.poolId)
    if (!poolDetails) {
      throw new PrizeWithdrawalError('NOT_FOUND', 'Bolão não encontrado')
    }

    if (poolDetails.status !== 'closed') {
      throw new PrizeWithdrawalError('POOL_NOT_CLOSED', 'O bolão ainda não foi finalizado.')
    }

    const ranking = await this.rankingRepo.getPoolRanking(input.poolId, input.userId)
    const winners = ranking.filter((r) => r.position === 1)
    const isWinner = winners.some((w) => w.userId === input.userId)

    if (!isWinner) {
      throw new PrizeWithdrawalError(
        'NOT_A_WINNER',
        'Apenas o vencedor pode solicitar a retirada do prêmio.',
      )
    }

    const existing = await this.prizeWithdrawalRepo.findByPoolAndUser(input.poolId, input.userId)
    if (existing) {
      throw new PrizeWithdrawalError(
        'WITHDRAWAL_ALREADY_REQUESTED',
        'Você já solicitou a retirada do prêmio deste bolão.',
      )
    }

    const pixKey = PixKey.create(input.pixKeyType, input.pixKey)

    const discountPercent = poolDetails.coupon?.discountPercent ?? 0
    const effectiveRate = this.getEffectiveFeeRate(discountPercent)
    const prizeTotal = PrizeCalculation.calculatePrizeTotal(
      poolDetails.entryFee,
      poolDetails.memberCount,
      effectiveRate,
    )
    const winnerShare = PrizeCalculation.calculateWinnerShare(prizeTotal, winners.length)

    const withdrawal = await this.prizeWithdrawalRepo.createWithPayment({
      poolId: input.poolId,
      userId: input.userId,
      amount: winnerShare.centavos,
      pixKeyType: pixKey.type,
      pixKey: pixKey.value,
    })

    const winner = winners.find((w) => w.userId === input.userId)
    await this.notificationService.notifyAdminWithdrawalRequest(
      winner?.name ?? 'Usuário',
      poolDetails.name,
      winnerShare.centavos,
      pixKey.type,
      pixKey.value,
    )

    return withdrawal
  }
}
