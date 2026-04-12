import { describe, expect, it } from 'vitest'
import { Prediction } from '../Prediction'

function createPrediction(
  overrides: Partial<{
    id: string | null
    userId: string
    poolId: string
    matchId: string
    homeScore: number
    awayScore: number
    points: number | null
  }> = {},
) {
  return new Prediction(
    overrides.id ?? null,
    overrides.userId ?? 'user-1',
    overrides.poolId ?? 'pool-1',
    overrides.matchId ?? 'match-1',
    overrides.homeScore ?? 2,
    overrides.awayScore ?? 1,
    overrides.points ?? null,
  )
}

describe('Prediction', () => {
  it('returns null points before calculation', () => {
    const prediction = createPrediction()
    expect(prediction.points).toBeNull()
  })

  it('calculates 10 points for exact match', () => {
    const prediction = createPrediction({ homeScore: 2, awayScore: 1 })
    prediction.calculatePoints(2, 1)
    expect(prediction.points).toBe(10)
  })

  it('calculates 0 points for miss', () => {
    const prediction = createPrediction({ homeScore: 2, awayScore: 1 })
    prediction.calculatePoints(0, 3)
    expect(prediction.points).toBe(0)
  })

  it('canSubmit returns true for future date', () => {
    const future = new Date(Date.now() + 60_000)
    expect(Prediction.canSubmit(future)).toBe(true)
  })

  it('canSubmit returns false for past date', () => {
    const past = new Date(Date.now() - 60_000)
    expect(Prediction.canSubmit(past)).toBe(false)
  })
})
