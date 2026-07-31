import { describe, expect, it, vi } from 'vitest'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import type { PrizeWithdrawalRepository } from '../../domain/prize/PrizeWithdrawalRepository.port'
import type { RankingRepository } from '../../domain/ranking/RankingRepository.port'
import { GetPrizeInfoUseCase } from './GetPrizeInfoUseCase'

const REQUESTED_AT = new Date('2026-07-30T14:32:00.000Z')
const PAID_AT = new Date('2026-07-31T09:10:00.000Z')

function makeWithdrawal(status: string) {
  return {
    id: 'w-1',
    poolId: 'pool-1',
    userId: 'user-1',
    paymentId: 'pay-1',
    amount: 14000,
    pixKeyType: 'cpf',
    pixKey: '12345678909',
    status,
    createdAt: REQUESTED_AT,
    updatedAt: status === 'completed' ? PAID_AT : REQUESTED_AT,
  }
}

function makeUseCase(withdrawalStatus: string | null) {
  const poolRepo = {
    findByIdWithDetails: vi.fn().mockResolvedValue({
      id: 'pool-1',
      name: 'Bolão Um',
      status: 'closed',
      entryFee: 5000,
      memberCount: 3,
      coupon: null,
    }),
  } as unknown as PoolRepository

  const rankingRepo = {
    getPoolRanking: vi
      .fn()
      .mockResolvedValue([
        { userId: 'user-1', name: 'Igor', position: 1, totalPoints: 30, exactMatches: 3 },
      ]),
  } as unknown as RankingRepository

  const prizeWithdrawalRepo = {
    findByPoolAndUser: vi
      .fn()
      .mockResolvedValue(withdrawalStatus ? makeWithdrawal(withdrawalStatus) : null),
  } as unknown as PrizeWithdrawalRepository

  return new GetPrizeInfoUseCase(poolRepo, prizeWithdrawalRepo, rankingRepo)
}

describe('GetPrizeInfoUseCase — paidAt', () => {
  it('returns paidAt null while the withdrawal is pending', async () => {
    const result = await makeUseCase('pending').execute({ poolId: 'pool-1', userId: 'user-1' })

    expect(result.withdrawal?.status).toBe('pending')
    expect(result.withdrawal?.paidAt).toBeNull()
    expect(result.withdrawal?.createdAt).toBe(REQUESTED_AT.toISOString())
  })

  it('returns paidAt from updatedAt once the withdrawal is completed', async () => {
    const result = await makeUseCase('completed').execute({ poolId: 'pool-1', userId: 'user-1' })

    expect(result.withdrawal?.paidAt).toBe(PAID_AT.toISOString())
  })

  it('masks the pix key so the raw value never leaves the use case', async () => {
    const result = await makeUseCase('pending').execute({ poolId: 'pool-1', userId: 'user-1' })

    expect(result.withdrawal?.pixKey).not.toContain('12345')
    expect(result.withdrawal?.pixKey.endsWith('8909')).toBe(true)
  })
})
