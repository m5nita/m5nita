import { describe, expect, it, vi } from 'vitest'
import { DrizzlePaymentRepository } from './DrizzlePaymentRepository'

function createMockDb(opts: {
  claimedRows?: Array<Record<string, unknown>>
  foundRow?: Record<string, unknown> | undefined
}) {
  const returning = vi.fn().mockResolvedValue(opts.claimedRows ?? [])
  const where = vi.fn(() => ({ returning }))
  const set = vi.fn(() => ({ where }))
  const update = vi.fn(() => ({ set }))
  const findFirst = vi.fn().mockResolvedValue(opts.foundRow)
  return { db: { update, query: { payment: { findFirst } } }, set, findFirst }
}

describe('DrizzlePaymentRepository', () => {
  it('claimCompletion maps the claimed row to ClaimedPayment', async () => {
    const mock = createMockDb({
      claimedRows: [
        {
          id: 'pay-1',
          poolId: 'pool-1',
          userId: 'user-1',
          type: 'entry',
          status: 'completed',
          amount: 10000,
        },
      ],
    })
    const repo = new DrizzlePaymentRepository(mock.db as unknown as never)

    const claimed = await repo.claimCompletion('pay-1')

    expect(claimed).toEqual({ id: 'pay-1', poolId: 'pool-1', userId: 'user-1', type: 'entry' })
    expect(mock.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', updatedAt: expect.any(Date) }),
    )
  })

  it('claimCompletion returns null when the CAS matches no row', async () => {
    const mock = createMockDb({ claimedRows: [] })
    const repo = new DrizzlePaymentRepository(mock.db as unknown as never)

    await expect(repo.claimCompletion('pay-1')).resolves.toBeNull()
  })

  it('exists reflects whether the payment row is found', async () => {
    const found = createMockDb({ foundRow: { id: 'pay-1' } })
    const missing = createMockDb({ foundRow: undefined })

    await expect(
      new DrizzlePaymentRepository(found.db as unknown as never).exists('pay-1'),
    ).resolves.toBe(true)
    await expect(
      new DrizzlePaymentRepository(missing.db as unknown as never).exists('pay-1'),
    ).resolves.toBe(false)
  })
})
