import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockTransaction = vi.fn()
const mockPaymentQueryFindFirst = vi.fn()
const mockPoolQueryFindFirst = vi.fn()
const mockUpdatePaymentReturning = vi.fn()
const mockUpdatePoolReturning = vi.fn()
const mockInsertReturning = vi.fn()

type TxApi = {
  update: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  query: {
    pool: { findFirst: ReturnType<typeof vi.fn> }
    payment: { findFirst: ReturnType<typeof vi.fn> }
  }
}

function makeTxApi(): TxApi {
  return {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: mockUpdatePaymentReturning,
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: mockInsertReturning,
        })),
      })),
    })),
    query: {
      pool: { findFirst: mockPoolQueryFindFirst },
      payment: { findFirst: mockPaymentQueryFindFirst },
    },
  }
}

vi.mock('../db/client', () => ({
  db: {
    transaction: (cb: (tx: TxApi) => Promise<unknown>) => mockTransaction(cb),
  },
}))

vi.mock('@sentry/node', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

import { handleCheckoutCompleted } from './payment'

describe('handleCheckoutCompleted atomicity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTransaction.mockImplementation(async (cb: (tx: TxApi) => Promise<unknown>) => {
      const tx = makeTxApi()
      // Rewire update() so it always returns the payment-claim returning mock on first call
      // and the pool-update returning mock on second call.
      let updateCall = 0
      tx.update = vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: updateCall++ === 0 ? mockUpdatePaymentReturning : mockUpdatePoolReturning,
          })),
        })),
      })) as unknown as typeof tx.update
      return cb(tx)
    })
  })

  it('claims payment via CAS and inserts poolMember on first call', async () => {
    mockUpdatePaymentReturning.mockResolvedValue([
      {
        id: 'pay-1',
        poolId: 'pool-1',
        userId: 'user-1',
        type: 'entry',
        status: 'completed',
      },
    ])
    mockPoolQueryFindFirst.mockResolvedValue({ id: 'pool-1', status: 'pending' })
    mockUpdatePoolReturning.mockResolvedValue([])
    mockInsertReturning.mockResolvedValue([{ id: 'member-1' }])

    await handleCheckoutCompleted('pay-1')

    expect(mockUpdatePaymentReturning).toHaveBeenCalledTimes(1)
    expect(mockInsertReturning).toHaveBeenCalledTimes(1)
  })

  it('short-circuits on concurrent second call when CAS returns zero rows', async () => {
    mockUpdatePaymentReturning.mockResolvedValue([])
    mockPaymentQueryFindFirst.mockResolvedValue({ id: 'pay-1', status: 'completed' })

    await handleCheckoutCompleted('pay-1')

    expect(mockInsertReturning).not.toHaveBeenCalled()
    expect(mockPoolQueryFindFirst).not.toHaveBeenCalled()
  })

  it('logs and returns when payment record does not exist', async () => {
    mockUpdatePaymentReturning.mockResolvedValue([])
    mockPaymentQueryFindFirst.mockResolvedValue(undefined)

    await handleCheckoutCompleted('missing')

    expect(mockInsertReturning).not.toHaveBeenCalled()
  })

  it('skips pool/member side-effects for non-entry payment types', async () => {
    mockUpdatePaymentReturning.mockResolvedValue([
      {
        id: 'pay-prize',
        poolId: 'pool-1',
        userId: 'user-1',
        type: 'prize',
        status: 'completed',
      },
    ])

    await handleCheckoutCompleted('pay-prize')

    expect(mockPoolQueryFindFirst).not.toHaveBeenCalled()
    expect(mockInsertReturning).not.toHaveBeenCalled()
  })

  it('tolerates onConflictDoNothing returning empty (member already exists)', async () => {
    mockUpdatePaymentReturning.mockResolvedValue([
      {
        id: 'pay-1',
        poolId: 'pool-1',
        userId: 'user-1',
        type: 'entry',
        status: 'completed',
      },
    ])
    mockPoolQueryFindFirst.mockResolvedValue({ id: 'pool-1', status: 'active' })
    mockInsertReturning.mockResolvedValue([])

    await expect(handleCheckoutCompleted('pay-1')).resolves.toBeUndefined()
  })
})
