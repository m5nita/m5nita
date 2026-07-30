import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import { StatsError } from '../../domain/stats/StatsError'
import type { StatsUnlockPrice } from '../../domain/stats/StatsUnlockPrice'
import type { StatsUnlockRepository } from '../../domain/stats/StatsUnlockRepository.port'
import type { CheckoutResult, PaymentGateway } from '../ports/PaymentGateway.port'

type Input = {
  userId: string
  poolId: string
}

type Output = {
  payment: CheckoutResult
  amount: number
}

/**
 * Creates a one-time checkout (Pix preferred) to unlock a pool's statistics.
 * 100% platform revenue — it does NOT call FeePolicy/PrizeCalculation and the
 * amount composes no prize pot. The entitlement is granted on payment
 * completion (idempotently, in the webhook tx).
 */
export class UnlockStatsUseCase {
  constructor(
    private readonly poolRepo: PoolRepository,
    private readonly statsUnlockRepo: StatsUnlockRepository,
    private readonly paymentGateway: PaymentGateway,
    private readonly price: StatsUnlockPrice,
  ) {}

  async execute(input: Input): Promise<Output> {
    const pool = await this.poolRepo.findById(input.poolId)
    if (!pool) throw new StatsError('NOT_FOUND', 'Bolão não encontrado')

    const isMember = await this.poolRepo.isMember(input.poolId, input.userId)
    if (!isMember) throw new StatsError('NOT_MEMBER', 'Você não participa deste bolão')

    if (await this.statsUnlockRepo.isUnlocked(input.userId, input.poolId)) {
      throw new StatsError('ALREADY_UNLOCKED', 'Estatísticas já desbloqueadas')
    }

    // No new purchases where the panel says nothing. Checked before the gateway
    // so an unsupported pool can never produce a charge or a payment row.
    if (!pool.supportsParticipantStats()) {
      throw new StatsError(
        'SCOPE_UNSUPPORTED',
        'Estatísticas estão disponíveis apenas em bolões de campeonato completo',
      )
    }

    const payment = await this.paymentGateway.createCheckoutSession({
      userId: input.userId,
      poolId: input.poolId,
      amount: this.price.centavos,
      platformFee: this.price.centavos,
      type: 'stats_unlock',
      description: 'Estatísticas do bolão',
    })

    return { payment, amount: this.price.centavos }
  }
}
