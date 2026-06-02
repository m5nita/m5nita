import type { Prediction } from '@m5nita/shared'
import { describe, expect, it } from 'vitest'
import { upsertPrediction } from './optimisticPredictions'

const base: Prediction = {
  id: 'p1',
  matchId: 'm1',
  homeScore: 1,
  awayScore: 0,
  points: 3,
}

describe('upsertPrediction', () => {
  it('updates the scores of an existing prediction and clears stale points', () => {
    const result = upsertPrediction([base], { matchId: 'm1', homeScore: 2, awayScore: 2 })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ matchId: 'm1', homeScore: 2, awayScore: 2, points: null })
  })

  it('inserts a new prediction when none exists for the match', () => {
    const result = upsertPrediction([base], { matchId: 'm2', homeScore: 0, awayScore: 1 })

    expect(result).toHaveLength(2)
    const added = result.find((p) => p.matchId === 'm2')
    expect(added).toMatchObject({ matchId: 'm2', homeScore: 0, awayScore: 1, points: null })
  })

  it('leaves other predictions untouched', () => {
    const other: Prediction = { id: 'p2', matchId: 'm2', homeScore: 0, awayScore: 0, points: 1 }
    const result = upsertPrediction([base, other], { matchId: 'm1', homeScore: 5, awayScore: 5 })

    expect(result.find((p) => p.matchId === 'm2')).toEqual(other)
  })

  it('does not mutate the input array', () => {
    const input = [base]
    upsertPrediction(input, { matchId: 'm1', homeScore: 9, awayScore: 9 })

    expect(input[0]).toEqual(base)
  })
})
