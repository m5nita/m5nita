import { describe, expect, it, vi } from 'vitest'
import { DrizzlePoolRepository } from './DrizzlePoolRepository'

function createMockDb(rows: Array<Record<string, unknown>>) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(rows),
  }
  return { select: vi.fn().mockReturnValue(chain) }
}

describe('DrizzlePoolRepository.findUserPools', () => {
  it('maps_rowsFromSelect_includingNextMatchAtAndLastMatchAt', async () => {
    const nextDate = new Date('2026-05-01T12:00:00.000Z')
    const lastDate = new Date('2026-05-10T20:00:00.000Z')
    const db = createMockDb([
      {
        id: 'pool-1',
        name: 'Pool A',
        entryFee: 5000,
        status: 'active',
        competitionName: 'Copa',
        memberCount: 3,
        nextMatchAt: nextDate,
        lastMatchAt: lastDate,
      },
    ])
    const repo = new DrizzlePoolRepository(db as unknown as never)

    const result = await repo.findUserPools('user-1')

    expect(result).toEqual([
      {
        id: 'pool-1',
        name: 'Pool A',
        entryFee: 5000,
        status: 'active',
        competitionName: 'Copa',
        memberCount: 3,
        nextMatchAt: nextDate,
        lastMatchAt: lastDate,
        hasLiveMatch: false,
      },
    ])
  })

  it('maps_nullAggregates_whenPoolHasNoMatches', async () => {
    const db = createMockDb([
      {
        id: 'pool-2',
        name: 'Pool B',
        entryFee: 1000,
        status: 'active',
        competitionName: 'Liga',
        memberCount: 0,
        nextMatchAt: null,
        lastMatchAt: null,
      },
    ])
    const repo = new DrizzlePoolRepository(db as unknown as never)

    const [item] = await repo.findUserPools('user-2')

    expect(item?.nextMatchAt).toBeNull()
    expect(item?.lastMatchAt).toBeNull()
  })

  it('preserves_orderFromSelect', async () => {
    const db = createMockDb([
      {
        id: 'p-1',
        name: 'A',
        entryFee: 0,
        status: 'active',
        competitionName: 'X',
        memberCount: 0,
        nextMatchAt: null,
        lastMatchAt: null,
      },
      {
        id: 'p-2',
        name: 'B',
        entryFee: 0,
        status: 'active',
        competitionName: 'X',
        memberCount: 0,
        nextMatchAt: null,
        lastMatchAt: null,
      },
      {
        id: 'p-3',
        name: 'C',
        entryFee: 0,
        status: 'closed',
        competitionName: 'X',
        memberCount: 0,
        nextMatchAt: null,
        lastMatchAt: null,
      },
    ])
    const repo = new DrizzlePoolRepository(db as unknown as never)

    const result = await repo.findUserPools('user-3')

    expect(result.map((p) => p.id)).toEqual(['p-1', 'p-2', 'p-3'])
  })
})

describe('DrizzlePoolRepository.addMember', () => {
  function createInsertDb(returnedRows: Array<{ id: string }>) {
    const returning = vi.fn().mockResolvedValue(returnedRows)
    const onConflictDoNothing = vi.fn(() => ({ returning }))
    const values = vi.fn(() => ({ onConflictDoNothing }))
    const insert = vi.fn(() => ({ values }))
    return { insert, values, onConflictDoNothing }
  }

  it('returns true when the membership row is created', async () => {
    const db = createInsertDb([{ id: 'member-1' }])
    const repo = new DrizzlePoolRepository(db as unknown as never)

    await expect(repo.addMember('pool-1', 'user-1', 'pay-1')).resolves.toBe(true)

    expect(db.values).toHaveBeenCalledWith({
      poolId: 'pool-1',
      userId: 'user-1',
      paymentId: 'pay-1',
    })
    expect(db.onConflictDoNothing).toHaveBeenCalledTimes(1)
  })

  it('returns false when the user is already a member (conflict ignored)', async () => {
    const db = createInsertDb([])
    const repo = new DrizzlePoolRepository(db as unknown as never)

    await expect(repo.addMember('pool-1', 'user-1', 'pay-1')).resolves.toBe(false)
  })
})
