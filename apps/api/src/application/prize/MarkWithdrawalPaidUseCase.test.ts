import { describe, expect, it, vi } from 'vitest'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import { PrizeWithdrawalError } from '../../domain/prize/PrizeWithdrawalError'
import type { PrizeWithdrawalRepository } from '../../domain/prize/PrizeWithdrawalRepository.port'
import type { NotificationService } from '../ports/NotificationService.port'
import { MarkWithdrawalPaidUseCase } from './MarkWithdrawalPaidUseCase'

const COMPLETED = {
  id: 'w-1',
  poolId: 'pool-1',
  userId: 'user-1',
  paymentId: 'pay-1',
  amount: 9500,
  pixKeyType: 'cpf',
  pixKey: '12345678909',
  status: 'completed',
  createdAt: new Date('2026-04-20T12:00:00.000Z'),
  updatedAt: new Date('2026-04-21T08:00:00.000Z'),
}

function makeRepo(overrides: Partial<PrizeWithdrawalRepository> = {}): PrizeWithdrawalRepository {
  return {
    findByPoolAndUser: vi.fn(),
    createWithPayment: vi.fn(),
    markAsCompleted: vi.fn().mockResolvedValue(COMPLETED),
    ...overrides,
  }
}

function makePoolRepo(): PoolRepository {
  return {
    findByIdWithDetails: vi.fn().mockResolvedValue({ id: 'pool-1', name: 'Bolão Um' }),
    getMembersWithContact: vi.fn().mockResolvedValue([
      {
        userId: 'user-1',
        name: 'Igor',
        phoneNumber: '+5511999999999',
        email: 'igor@test.local',
        emailVerified: true,
      },
      {
        userId: 'user-2',
        name: 'Maria',
        phoneNumber: null,
        email: 'maria@test.local',
        emailVerified: true,
      },
    ]),
  } as unknown as PoolRepository
}

function makeNotifications(): NotificationService {
  return { notifyWithdrawalPaid: vi.fn(async () => {}) } as unknown as NotificationService
}

describe('MarkWithdrawalPaidUseCase', () => {
  it('delegates to repo.markAsCompleted and returns the updated withdrawal', async () => {
    const repo = makeRepo()
    const useCase = new MarkWithdrawalPaidUseCase(repo, makePoolRepo(), makeNotifications())

    const result = await useCase.execute({ withdrawalId: 'w-1' })

    expect(repo.markAsCompleted).toHaveBeenCalledWith('w-1')
    expect(result).toBe(COMPLETED)
  })

  it('notifies the winner with a masked pix key', async () => {
    const notifications = makeNotifications()
    const useCase = new MarkWithdrawalPaidUseCase(makeRepo(), makePoolRepo(), notifications)

    await useCase.execute({ withdrawalId: 'w-1' })

    expect(notifications.notifyWithdrawalPaid).toHaveBeenCalledWith({
      userId: 'user-1',
      userName: 'Igor',
      phoneNumber: '+5511999999999',
      email: 'igor@test.local',
      poolId: 'pool-1',
      poolName: 'Bolão Um',
      amount: 9500,
      pixKey: '*******8909',
    })
  })

  it('omits an unverified email so the fallback never reaches an unconfirmed address', async () => {
    const poolRepo = {
      findByIdWithDetails: vi.fn().mockResolvedValue({ id: 'pool-1', name: 'Bolão Um' }),
      getMembersWithContact: vi.fn().mockResolvedValue([
        {
          userId: 'user-1',
          name: 'Igor',
          phoneNumber: null,
          email: 'igor@test.local',
          emailVerified: false,
        },
      ]),
    } as unknown as PoolRepository
    const notifications = makeNotifications()
    const useCase = new MarkWithdrawalPaidUseCase(makeRepo(), poolRepo, notifications)

    await useCase.execute({ withdrawalId: 'w-1' })

    expect(notifications.notifyWithdrawalPaid).toHaveBeenCalledWith(
      expect.objectContaining({ email: null }),
    )
  })

  it('still completes when the notification throws — the money already moved', async () => {
    const notifications = {
      notifyWithdrawalPaid: vi.fn().mockRejectedValue(new Error('push down')),
    } as unknown as NotificationService
    const useCase = new MarkWithdrawalPaidUseCase(makeRepo(), makePoolRepo(), notifications)

    const result = await useCase.execute({ withdrawalId: 'w-1' })

    expect(result).toBe(COMPLETED)
  })

  it('propagates WITHDRAWAL_ALREADY_COMPLETED and never notifies', async () => {
    const repo = makeRepo({
      markAsCompleted: vi
        .fn()
        .mockRejectedValue(
          new PrizeWithdrawalError('WITHDRAWAL_ALREADY_COMPLETED', 'already paid'),
        ),
    })
    const notifications = makeNotifications()
    const useCase = new MarkWithdrawalPaidUseCase(repo, makePoolRepo(), notifications)

    await expect(useCase.execute({ withdrawalId: 'w-1' })).rejects.toMatchObject({
      name: 'PrizeWithdrawalError',
      code: 'WITHDRAWAL_ALREADY_COMPLETED',
    })
    expect(notifications.notifyWithdrawalPaid).not.toHaveBeenCalled()
  })

  it('propagates WITHDRAWAL_NOT_FOUND from the repo', async () => {
    const repo = makeRepo({
      markAsCompleted: vi
        .fn()
        .mockRejectedValue(new PrizeWithdrawalError('WITHDRAWAL_NOT_FOUND', 'not found')),
    })
    const useCase = new MarkWithdrawalPaidUseCase(repo, makePoolRepo(), makeNotifications())

    await expect(useCase.execute({ withdrawalId: 'missing' })).rejects.toMatchObject({
      name: 'PrizeWithdrawalError',
      code: 'WITHDRAWAL_NOT_FOUND',
    })
  })
})
