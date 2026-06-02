import type { Prediction } from '@m5nita/shared'

type ScoreChange = { matchId: string; homeScore: number; awayScore: number }

/**
 * Apply a just-saved score to the cached prediction list optimistically.
 * Updates the existing entry (clearing stale points — the new scores haven't
 * been scored yet) or inserts a new one when this is the member's first
 * prediction for the match. Pure: returns a new array, never mutates the input.
 *
 * Saves only ever target not-yet-started matches (the server rejects live /
 * finished), so points/category/bonus are always null here.
 */
export function upsertPrediction(list: Prediction[], change: ScoreChange): Prediction[] {
  const exists = list.some((p) => p.matchId === change.matchId)

  if (exists) {
    return list.map((p) =>
      p.matchId === change.matchId
        ? {
            ...p,
            homeScore: change.homeScore,
            awayScore: change.awayScore,
            points: null,
            category: null,
            bonus: null,
          }
        : p,
    )
  }

  const inserted: Prediction = {
    id: `optimistic-${change.matchId}`,
    matchId: change.matchId,
    homeScore: change.homeScore,
    awayScore: change.awayScore,
    points: null,
  }
  return [...list, inserted]
}
