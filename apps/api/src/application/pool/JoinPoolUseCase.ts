import { PoolError } from '../../domain/pool/PoolError'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import type { CheckoutResult, PaymentGateway } from '../ports/PaymentGateway.port'

type Input = {
  userId: string
  poolId: string
}

type Output = {
  payment: CheckoutResult
  amount: number
}

export class JoinPoolUseCase {
  constructor(
    private readonly poolRepo: PoolRepository,
    private readonly paymentGateway: PaymentGateway,
  ) {}

  async execute(input: Input): Promise<Output> {
    const pool = await this.poolRepo.findById(input.poolId)
    if (!pool) throw new PoolError('NOT_FOUND', 'Bolão não encontrado')
    if (!pool.canJoin()) throw new PoolError('POOL_CLOSED', 'Este bolão não aceita novas entradas')

    const alreadyMember = await this.poolRepo.isMember(input.poolId, input.userId)
    if (alreadyMember) throw new PoolError('ALREADY_MEMBER', 'Você já participa deste bolão')

    const payment = await this.paymentGateway.createCheckoutSession({
      userId: input.userId,
      poolId: input.poolId,
      amount: pool.entryFee.value.centavos,
      platformFee: 0,
    })

    return { payment, amount: pool.entryFee.value.centavos }
  }
}
