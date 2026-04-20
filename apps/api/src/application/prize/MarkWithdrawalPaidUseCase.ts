import type {
  PrizeWithdrawal,
  PrizeWithdrawalRepository,
} from '../../domain/prize/PrizeWithdrawalRepository.port'

type Input = {
  withdrawalId: string
}

export class MarkWithdrawalPaidUseCase {
  constructor(private readonly prizeWithdrawalRepo: PrizeWithdrawalRepository) {}

  async execute(input: Input): Promise<PrizeWithdrawal> {
    return await this.prizeWithdrawalRepo.markAsCompleted(input.withdrawalId)
  }
}
