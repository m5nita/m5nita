import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('calcPointsForMatch', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('stores SingleMatchScore total for predictions in single-match pools and Score points for range pools', async () => {
    const matchId = 'm1'
    const updates: Array<{ id: string; points: number }> = []

    vi.doMock('../container', () => ({
      getContainer: () => ({
        matchRepo: {
          findById: async () => ({
            id: matchId,
            status: 'finished',
            homeScore: 2,
            awayScore: 1,
          }),
        },
        predictionRepo: {
          findByMatch: async () => [
            { id: 'p1', poolId: 'pool-single', homeScore: 3, awayScore: 2 },
            { id: 'p2', poolId: 'pool-range', homeScore: 3, awayScore: 2 },
            { id: 'p3', poolId: 'pool-single', homeScore: 2, awayScore: 1 }, // exact
          ],
          updatePoints: async (id: string, points: number) => {
            updates.push({ id, points })
          },
        },
        poolRepo: {
          findById: async (poolId: string) => {
            const { RangeScoringPolicy, SingleMatchScoringPolicy } = await import(
              '../domain/scoring/ScoringPolicy'
            )
            const isSingle = poolId === 'pool-single'
            return {
              id: poolId,
              scope: { kind: isSingle ? 'single-match' : 'whole-competition' },
              scoringPolicy: () => (isSingle ? SingleMatchScoringPolicy : RangeScoringPolicy),
            }
          },
        },
        rankingRepo: { recomputeStandings: async () => {} },
      }),
    }))

    const { calcPointsForMatch } = await import('./calcPoints')
    await calcPointsForMatch(matchId)

    // p1: single-match, real 2x1, pred 3x2 → category 7, dist 2, bonus 2, total 9
    expect(updates).toContainEqual({ id: 'p1', points: 9 })
    // p2: range pool, real 2x1, pred 3x2 → legacy Score winner+diff = 7
    expect(updates).toContainEqual({ id: 'p2', points: 7 })
    // p3: single-match, exact match → 10 + 4 = 14
    expect(updates).toContainEqual({ id: 'p3', points: 14 })
  })

  it('skips update when match is not finished', async () => {
    const updates: Array<{ id: string; points: number }> = []
    vi.doMock('../container', () => ({
      getContainer: () => ({
        matchRepo: {
          findById: async () => ({
            id: 'm1',
            status: 'scheduled',
            homeScore: null,
            awayScore: null,
          }),
        },
        predictionRepo: {
          findByMatch: async () => [],
          updatePoints: async (id: string, p: number) => updates.push({ id, points: p }),
        },
        poolRepo: { findById: async () => null },
        rankingRepo: { recomputeStandings: async () => {} },
      }),
    }))
    const { calcPointsForMatch } = await import('./calcPoints')
    await calcPointsForMatch('m1')
    expect(updates).toEqual([])
  })
})
