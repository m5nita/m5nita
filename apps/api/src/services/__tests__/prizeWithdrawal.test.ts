import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockPoolFindFirst = vi.fn()
const mockWithdrawalFindFirst = vi.fn()
const mockSelect = vi.fn()
const mockTransaction = vi.fn()

vi.mock('../../db/client', () => ({
  db: {
    query: {
      pool: { findFirst: (...args: unknown[]) => mockPoolFindFirst(...args) },
      prizeWithdrawal: {
        findFirst: (...args: unknown[]) => mockWithdrawalFindFirst(...args),
      },
    },
    select: (...args: unknown[]) => mockSelect(...args),
    transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}))

vi.mock('../ranking', () => ({
  getPoolRanking: vi.fn(),
}))

vi.mock('@m5nita/shared', async () => {
  const actual = await vi.importActual<typeof import('@m5nita/shared')>('@m5nita/shared')
  return {
    ...actual,
    validatePixKey: vi.fn(() => ({ success: true })),
  }
})

import { PrizeWithdrawalError, requestWithdrawal } from '../prizeWithdrawal'
import { getPoolRanking } from '../ranking'

const mockGetPoolRanking = vi.mocked(getPoolRanking)

function setupWinnerScenario() {
  mockPoolFindFirst.mockResolvedValue({
    id: 'pool-1',
    status: 'closed',
    entryFee: 1000,
    coupon: null,
  })
  mockWithdrawalFindFirst.mockResolvedValue(undefined)
  mockSelect.mockReturnValue({
    from: () => ({
      where: () => Promise.resolve([{ count: 10 }]),
    }),
  })
  mockGetPoolRanking.mockResolvedValue([
    {
      userId: 'user-1',
      name: 'Winner',
      position: 1,
      totalPoints: 100,
      exactMatches: 5,
      // biome-ignore lint/suspicious/noExplicitAny: test fixture
    } as any,
  ])
}

describe('requestWithdrawal idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('translates unique-constraint race (23505) into WITHDRAWAL_ALREADY_REQUESTED', async () => {
    setupWinnerScenario()
    const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' })
    mockTransaction.mockRejectedValue(uniqueViolation)

    await expect(
      requestWithdrawal('pool-1', 'user-1', 'cpf', '123.456.789-09'),
    ).rejects.toMatchObject({
      name: 'PrizeWithdrawalError',
      code: 'WITHDRAWAL_ALREADY_REQUESTED',
    })
  })

  it('rejects a second request when an existing withdrawal is already persisted', async () => {
    setupWinnerScenario()
    mockWithdrawalFindFirst.mockResolvedValue({
      id: 'w-1',
      poolId: 'pool-1',
      userId: 'user-1',
    })

    await expect(
      requestWithdrawal('pool-1', 'user-1', 'cpf', '123.456.789-09'),
    ).rejects.toBeInstanceOf(PrizeWithdrawalError)
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('runs the insert inside a transaction on the happy path', async () => {
    setupWinnerScenario()
    mockTransaction.mockResolvedValue({ id: 'w-new', amount: 9500 })

    const result = await requestWithdrawal('pool-1', 'user-1', 'cpf', '123.456.789-09')

    expect(mockTransaction).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ id: 'w-new', amount: 9500 })
  })

  it('rethrows non-unique-constraint errors', async () => {
    setupWinnerScenario()
    mockTransaction.mockRejectedValue(new Error('connection lost'))

    await expect(requestWithdrawal('pool-1', 'user-1', 'cpf', '123.456.789-09')).rejects.toThrow(
      'connection lost',
    )
  })
})
