import { describe, expect, it } from 'vitest'
import { CallBudget } from '../../domain/shared/CallBudget'
import { createLiveSyncCompetitionProvider } from './liveSyncCompetitionProvider'
import type { CompetitionInfo } from './SyncLiveScoresUseCase'

const comp = (id: string): CompetitionInfo => ({ id, externalId: `x-${id}`, name: id })
const clock = (ms: number) => ({ now: () => new Date(ms) })

describe('createLiveSyncCompetitionProvider', () => {
  it('returns only active competitions that are live/imminent', async () => {
    const provider = createLiveSyncCompetitionProvider({
      listActive: async () => [comp('a'), comp('b'), comp('c')],
      findLiveOrImminentCompetitionIds: async () => ['b'],
      budget: new CallBudget(10, () => 0),
      clock: clock(0),
    })
    const result = await provider()
    expect(result.map((c) => c.id)).toEqual(['b'])
  })

  it('returns empty (and spends no budget) when nothing is live/imminent', async () => {
    const budget = new CallBudget(10, () => 0)
    const provider = createLiveSyncCompetitionProvider({
      listActive: async () => [comp('a')],
      findLiveOrImminentCompetitionIds: async () => [],
      budget,
      clock: clock(0),
    })
    expect(await provider()).toEqual([])
    expect(budget.available()).toBe(10)
  })

  it('caps the returned list to the remaining budget and consumes it', async () => {
    const budget = new CallBudget(2, () => 0)
    const provider = createLiveSyncCompetitionProvider({
      listActive: async () => [comp('a'), comp('b'), comp('c')],
      findLiveOrImminentCompetitionIds: async () => ['a', 'b', 'c'],
      budget,
      clock: clock(0),
    })
    const result = await provider()
    expect(result).toHaveLength(2)
    expect(budget.available()).toBe(0)
  })

  it('round-robins under a persistent cap so every competition gets served', async () => {
    let t = 0
    // Budget of 2/min, 3 live competitions, ticking every 30s.
    const budget = new CallBudget(2, () => t)
    const provider = createLiveSyncCompetitionProvider({
      listActive: async () => [comp('a'), comp('b'), comp('c')],
      findLiveOrImminentCompetitionIds: async () => ['a', 'b', 'c'],
      budget,
      clock: { now: () => new Date(t) },
    })
    const served = new Set<string>()
    for (let i = 0; i < 4; i++) {
      const picked = await provider()
      for (const c of picked) served.add(c.id)
      t += 30_000
    }
    expect(served).toEqual(new Set(['a', 'b', 'c'])) // none starved
  })
})
