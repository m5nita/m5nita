import { describe, expect, it } from 'vitest'
import type { ParticipantStatsRow } from './StatsRepository.port'
import { SuggestionPolicy } from './SuggestionPolicy'

function viewer(over: Partial<ParticipantStatsRow> = {}): ParticipantStatsRow {
  return {
    finishedCount: 20,
    exactCount: 4,
    resultCount: 12,
    pointsTotal: 80,
    homeCorrect: 0,
    homeTotal: 0,
    awayCorrect: 0,
    awayTotal: 0,
    lowGoalsCorrect: 0,
    lowGoalsTotal: 0,
    highGoalsCorrect: 0,
    highGoalsTotal: 0,
    position: 1,
    prevPosition: 1,
    ...over,
  }
}

describe('SuggestionPolicy.suggest', () => {
  it('suggests_home_strength_when_home_accuracy_dominates', () => {
    const s = SuggestionPolicy.suggest(
      viewer({ homeCorrect: 8, homeTotal: 10, awayCorrect: 2, awayTotal: 10 }),
    )
    expect(s.some((x) => x.kind === 'home_strength')).toBe(true)
    expect(s.every((x) => x.basis === 'own_history')).toBe(true)
  })

  it('suggests_away_strength_when_away_accuracy_dominates', () => {
    const s = SuggestionPolicy.suggest(
      viewer({ homeCorrect: 2, homeTotal: 10, awayCorrect: 9, awayTotal: 10 }),
    )
    expect(s.some((x) => x.kind === 'away_strength')).toBe(true)
  })

  it('suggests_low_goals_strength_when_it_dominates', () => {
    const s = SuggestionPolicy.suggest(
      viewer({ lowGoalsCorrect: 9, lowGoalsTotal: 10, highGoalsCorrect: 3, highGoalsTotal: 10 }),
    )
    expect(s.some((x) => x.kind === 'low_goals_strength')).toBe(true)
  })

  it('returns_empty_when_not_enough_history', () => {
    // Below MIN_SAMPLES on each side → no claim.
    expect(SuggestionPolicy.suggest(viewer({ homeCorrect: 2, homeTotal: 2 }))).toEqual([])
  })

  it('returns_empty_when_no_clear_tendency', () => {
    // Enough samples but the gap is under the margin.
    const s = SuggestionPolicy.suggest(
      viewer({
        homeCorrect: 5,
        homeTotal: 10,
        awayCorrect: 5,
        awayTotal: 10,
        lowGoalsCorrect: 5,
        lowGoalsTotal: 10,
        highGoalsCorrect: 5,
        highGoalsTotal: 10,
      }),
    )
    expect(s).toEqual([])
  })
})
