import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrizeWithdrawalError } from '../../../domain/prize/PrizeWithdrawalError'
import { resetPixKeyCache } from '../../../lib/pixKeyCrypto'
import { DrizzlePrizeWithdrawalRepository } from '../DrizzlePrizeWithdrawalRepository'

const ORIGINAL_KEY = process.env.PIX_ENCRYPTION_KEY

beforeAll(() => {
  process.env.PIX_ENCRYPTION_KEY = randomBytes(32).toString('base64')
  resetPixKeyCache()
})

afterAll(() => {
  process.env.PIX_ENCRYPTION_KEY = ORIGINAL_KEY
  resetPixKeyCache()
})

const mockTransaction = vi.fn()

function createRepo() {
  const db = { transaction: mockTransaction } as unknown as never
  return new DrizzlePrizeWithdrawalRepository(db)
}

const payload = {
  poolId: 'pool-1',
  userId: 'user-1',
  amount: 9500,
  pixKeyType: 'cpf',
  pixKey: '12345678909',
}

describe('DrizzlePrizeWithdrawalRepository.createWithPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('translates unique-constraint race (23505) into WITHDRAWAL_ALREADY_REQUESTED', async () => {
    const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' })
    mockTransaction.mockRejectedValue(uniqueViolation)

    await expect(createRepo().createWithPayment(payload)).rejects.toMatchObject({
      name: 'PrizeWithdrawalError',
      code: 'WITHDRAWAL_ALREADY_REQUESTED',
    })
  })

  it('rethrows non-unique-constraint errors untouched', async () => {
    mockTransaction.mockRejectedValue(new Error('connection lost'))

    await expect(createRepo().createWithPayment(payload)).rejects.toThrow('connection lost')
    await expect(createRepo().createWithPayment(payload)).rejects.not.toBeInstanceOf(
      PrizeWithdrawalError,
    )
  })

  it('returns the mapped row on the happy path', async () => {
    const createdAt = new Date('2026-04-19T12:00:00.000Z')
    mockTransaction.mockResolvedValueOnce({
      id: 'w-1',
      poolId: 'pool-1',
      userId: 'user-1',
      paymentId: 'pay-1',
      amount: 9500,
      pixKeyType: 'cpf',
      pixKey: '12345678909',
      status: 'pending',
      createdAt,
    })

    const result = await createRepo().createWithPayment(payload)

    expect(result).toEqual({
      id: 'w-1',
      poolId: 'pool-1',
      userId: 'user-1',
      paymentId: 'pay-1',
      amount: 9500,
      pixKeyType: 'cpf',
      pixKey: '12345678909',
      status: 'pending',
      createdAt,
    })
  })
})
