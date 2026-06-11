import { describe, expect, it, vi } from 'vitest'
import { Prediction } from '../../domain/prediction/Prediction'
import { DrizzlePredictionRepository } from './DrizzlePredictionRepository'

type ConflictConfig = { target: unknown[]; set: Record<string, unknown> }

describe('DrizzlePredictionRepository.save — insert branch', () => {
  function createInsertDb(returnedRow: Record<string, unknown>) {
    const returning = vi.fn().mockResolvedValue([returnedRow])
    const onConflictDoUpdate = vi.fn((_config: ConflictConfig) => ({ returning }))
    const values = vi.fn(() => ({ onConflictDoUpdate }))
    const insert = vi.fn(() => ({ values }))
    return { db: { insert }, insert, values, onConflictDoUpdate, returning }
  }

  it('upserts via onConflictDoUpdate on (userId, poolId, matchId) without clobbering points', async () => {
    const row = {
      id: 'pred-1',
      userId: 'user-1',
      poolId: 'pool-1',
      matchId: 'match-1',
      homeScore: 2,
      awayScore: 1,
      advancePick: null,
      points: null,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    }
    const { db, onConflictDoUpdate } = createInsertDb(row)
    const repo = new DrizzlePredictionRepository(db as unknown as never)

    // entity.id === null → insert branch
    const entity = new Prediction(null, 'user-1', 'pool-1', 'match-1', 2, 1, null, null)
    const saved = await repo.save(entity)

    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1)
    const arg = onConflictDoUpdate.mock.calls[0]?.[0]
    if (!arg) throw new Error('onConflictDoUpdate was not called with a config')
    // Targets the unique index columns.
    expect(arg.target).toHaveLength(3)
    // The SET must never include `points` — preserve the existing row's score on a lost race.
    expect(arg.set).not.toHaveProperty('points')
    // Original createdAt must not be overwritten.
    expect(arg.set).not.toHaveProperty('createdAt')
    expect(arg.set).toHaveProperty('homeScore')
    expect(arg.set).toHaveProperty('awayScore')
    expect(arg.set).toHaveProperty('advancePick')

    expect(saved.id).toBe('pred-1')
    expect(saved.homeScore).toBe(2)
    expect(saved.awayScore).toBe(1)
  })
})
