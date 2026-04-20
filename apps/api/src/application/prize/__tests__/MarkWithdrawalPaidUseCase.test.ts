import { describe, expect, it, vi } from 'vitest'
import { PrizeWithdrawalError } from '../../../domain/prize/PrizeWithdrawalError'
import type { PrizeWithdrawalRepository } from '../../../domain/prize/PrizeWithdrawalRepository.port'
import { MarkWithdrawalPaidUseCase } from '../MarkWithdrawalPaidUseCase'

function makeRepo(overrides: Partial<PrizeWithdrawalRepository> = {}): PrizeWithdrawalRepository {
  return {
    findByPoolAndUser: vi.fn(),
    createWithPayment: vi.fn(),
    markAsCompleted: vi.fn(),
    ...overrides,
  }
}

describe('MarkWithdrawalPaidUseCase', () => {
  it('delegates to repo.markAsCompleted and returns the updated withdrawal', async () => {
    const completed = {
      id: 'w-1',
      poolId: 'pool-1',
      userId: 'user-1',
      paymentId: 'pay-1',
      amount: 9500,
      pixKeyType: 'cpf',
      pixKey: '12345678909',
      status: 'completed',
      createdAt: new Date('2026-04-20T12:00:00.000Z'),
    }
    const markAsCompleted = vi.fn().mockResolvedValue(completed)
    const repo = makeRepo({ markAsCompleted })

    const useCase = new MarkWithdrawalPaidUseCase(repo)
    const result = await useCase.execute({ withdrawalId: 'w-1' })

    expect(markAsCompleted).toHaveBeenCalledWith('w-1')
    expect(result).toBe(completed)
  })

  it('propagates WITHDRAWAL_NOT_FOUND from the repo', async () => {
    const markAsCompleted = vi
      .fn()
      .mockRejectedValue(new PrizeWithdrawalError('WITHDRAWAL_NOT_FOUND', 'not found'))
    const repo = makeRepo({ markAsCompleted })

    const useCase = new MarkWithdrawalPaidUseCase(repo)

    await expect(useCase.execute({ withdrawalId: 'missing' })).rejects.toMatchObject({
      name: 'PrizeWithdrawalError',
      code: 'WITHDRAWAL_NOT_FOUND',
    })
  })

  it('propagates WITHDRAWAL_ALREADY_COMPLETED from the repo', async () => {
    const markAsCompleted = vi
      .fn()
      .mockRejectedValue(new PrizeWithdrawalError('WITHDRAWAL_ALREADY_COMPLETED', 'already paid'))
    const repo = makeRepo({ markAsCompleted })

    const useCase = new MarkWithdrawalPaidUseCase(repo)

    await expect(useCase.execute({ withdrawalId: 'w-1' })).rejects.toMatchObject({
      name: 'PrizeWithdrawalError',
      code: 'WITHDRAWAL_ALREADY_COMPLETED',
    })
  })
})
