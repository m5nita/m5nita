import { describe, expect, it, vi } from 'vitest'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import type { PrizeWithdrawalRepository } from '../../domain/prize/PrizeWithdrawalRepository.port'
import type { RankingRepository } from '../../domain/ranking/RankingRepository.port'
import type { NotificationService } from '../ports/NotificationService.port'
import { RequestWithdrawalUseCase } from './RequestWithdrawalUseCase'

function makeUseCase(overrides: { pool?: unknown; ranking?: unknown[]; existing?: unknown } = {}) {
  const createWithPayment = vi.fn().mockResolvedValue({
    id: 'w-1',
    poolId: 'pool-1',
    userId: 'user-1',
    paymentId: 'pay-1',
    amount: 3800,
    pixKeyType: 'cpf',
    pixKey: 'enc',
    status: 'pending',
    createdAt: new Date('2026-04-20T12:00:00.000Z'),
  })
  const notifyAdminWithdrawalRequest = vi.fn().mockResolvedValue(undefined)

  const poolRepo = {
    findByIdWithDetails: vi.fn().mockResolvedValue(
      overrides.pool ?? {
        id: 'pool-1',
        name: 'Final',
        entryFee: 1000,
        ownerId: 'owner-1',
        inviteCode: 'ABCD1234',
        competitionId: 'comp-1',
        matchdayFrom: null,
        matchdayTo: null,
        matchId: 'match-1',
        status: 'closed',
        isOpen: false,
        couponId: null,
        owner: { id: 'owner-1', name: 'Owner' },
        competitionName: 'Comp',
        coupon: null,
        memberCount: 4,
        prizeTotal: 3800,
        hasLiveMatch: false,
      },
    ),
  } as unknown as PoolRepository

  const rankingRepo = {
    getPoolRanking: vi
      .fn()
      .mockResolvedValue(overrides.ranking ?? [{ userId: 'user-1', position: 1, name: 'Alice' }]),
  } as unknown as RankingRepository

  const prizeWithdrawalRepo = {
    findByPoolAndUser: vi.fn().mockResolvedValue(overrides.existing ?? null),
    createWithPayment,
    markAsCompleted: vi.fn(),
  } as unknown as PrizeWithdrawalRepository

  const notificationService = {
    notifyAdminWithdrawalRequest,
  } as unknown as NotificationService

  const useCase = new RequestWithdrawalUseCase(
    poolRepo,
    prizeWithdrawalRepo,
    rankingRepo,
    notificationService,
  )
  return { useCase, createWithPayment, notifyAdminWithdrawalRequest }
}

describe('RequestWithdrawalUseCase — PIX key validation', () => {
  it('rejects an invalid CPF with INVALID_PIX_KEY (clean 400, not a 500) and creates no withdrawal', async () => {
    const { useCase, createWithPayment } = makeUseCase()

    await expect(
      useCase.execute({
        poolId: 'pool-1',
        userId: 'user-1',
        pixKeyType: 'cpf',
        pixKey: '12345678901', // 11 digits, invalid check digits
      }),
    ).rejects.toMatchObject({ name: 'PrizeWithdrawalError', code: 'INVALID_PIX_KEY' })

    expect(createWithPayment).not.toHaveBeenCalled()
  })

  it('accepts a valid CPF and creates the withdrawal', async () => {
    const { useCase, createWithPayment } = makeUseCase()

    await useCase.execute({
      poolId: 'pool-1',
      userId: 'user-1',
      pixKeyType: 'cpf',
      pixKey: '12345678909', // valid CPF
    })

    expect(createWithPayment).toHaveBeenCalledTimes(1)
  })
})
