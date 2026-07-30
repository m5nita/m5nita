import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import type {
  PrizeWithdrawal,
  PrizeWithdrawalRepository,
} from '../../domain/prize/PrizeWithdrawalRepository.port'
import { PixKey } from '../../domain/shared/PixKey'
import type { NotificationService } from '../ports/NotificationService.port'

type Input = {
  withdrawalId: string
}

export class MarkWithdrawalPaidUseCase {
  constructor(
    private readonly prizeWithdrawalRepo: PrizeWithdrawalRepository,
    private readonly poolRepo: PoolRepository,
    private readonly notificationService: NotificationService,
  ) {}

  async execute(input: Input): Promise<PrizeWithdrawal> {
    const withdrawal = await this.prizeWithdrawalRepo.markAsCompleted(input.withdrawalId)

    // O dinheiro já saiu e a transação já commitou. Uma falha de notificação
    // não pode fazer o botão do admin no Telegram responder erro e induzi-lo a
    // clicar de novo — o segundo clique bateria em WITHDRAWAL_ALREADY_COMPLETED.
    try {
      await this.notifyWinner(withdrawal)
    } catch (error) {
      console.error(`[Withdrawal] Failed to notify winner of ${withdrawal.id}:`, error)
    }

    return withdrawal
  }

  private async notifyWinner(withdrawal: PrizeWithdrawal): Promise<void> {
    const pool = await this.poolRepo.findByIdWithDetails(withdrawal.poolId)
    if (!pool) return

    const members = await this.poolRepo.getMembersWithContact(withdrawal.poolId)
    const winner = members.find((m) => m.userId === withdrawal.userId)

    await this.notificationService.notifyWithdrawalPaid({
      userId: withdrawal.userId,
      userName: winner?.name ?? null,
      phoneNumber: winner?.phoneNumber ?? null,
      email: winner?.emailVerified && winner.email ? winner.email : null,
      poolId: withdrawal.poolId,
      poolName: pool.name,
      amount: withdrawal.amount,
      // Mascaramento mora no domínio (PixKey) — nunca redefinir aqui.
      pixKey: PixKey.mask(withdrawal.pixKey),
    })
  }
}
