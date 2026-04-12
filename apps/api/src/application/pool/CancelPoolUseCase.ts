import { PoolError } from '../../domain/pool/PoolError'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import type { PaymentGateway } from '../ports/PaymentGateway.port'

type CompletedPayment = { id: string; userId: string; amount: number }

type Input = {
  userId: string
  poolId: string
}

type RefundResult = { userId: string; amount: number; status: 'pending' | 'error' }

type Output = {
  refunds: RefundResult[]
}

export class CancelPoolUseCase {
  constructor(
    private readonly poolRepo: PoolRepository,
    private readonly paymentGateway: PaymentGateway,
    private readonly hasPrizePayments: (poolId: string) => Promise<boolean>,
    private readonly getCompletedEntryPayments: (poolId: string) => Promise<CompletedPayment[]>,
  ) {}

  async execute(input: Input): Promise<Output> {
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

    const payments = await this.getCompletedEntryPayments(input.poolId)
    const refunds: RefundResult[] = []

    for (const p of payments) {
      try {
        await this.paymentGateway.refund(p.id)
        refunds.push({ userId: p.userId, amount: p.amount, status: 'pending' })
      } catch {
        refunds.push({ userId: p.userId, amount: p.amount, status: 'error' })
      }
    }

    pool.cancel()
    await this.poolRepo.updateStatus(pool.id, pool.status)

    return { refunds }
  }
}
