import { Score } from '../../domain/scoring/Score'
import { SingleMatchScore } from '../../domain/scoring/SingleMatchScore'

type PredictionScores = { homeScore: number; awayScore: number }
type MatchState = { status: string; homeScore: number | null; awayScore: number | null }
type Options = { isSingleMatchPool: boolean }

export type LivePoints = number | null | { total: number; category: number; bonus: number }

export function computeLivePoints(
  prediction: PredictionScores,
  match: MatchState,
  storedPoints: number | null,
  options: { isSingleMatchPool: true },
): { total: number; category: number; bonus: number } | null
export function computeLivePoints(
  prediction: PredictionScores,
  match: MatchState,
  storedPoints: number | null,
  options?: { isSingleMatchPool: false } | Options,
): number | null
export function computeLivePoints(
  prediction: PredictionScores,
  match: MatchState,
  storedPoints: number | null,
  options: Options = { isSingleMatchPool: false },
): LivePoints {
  if (match.status !== 'live') return storedPoints
  if (match.homeScore === null || match.awayScore === null) return null

  if (options.isSingleMatchPool) {
    const s = SingleMatchScore.calculate(
      prediction.homeScore,
      prediction.awayScore,
      match.homeScore,
      match.awayScore,
    )
    return { total: s.total, category: s.category, bonus: s.bonus }
  }

  return Score.calculate(
    prediction.homeScore,
    prediction.awayScore,
    match.homeScore,
    match.awayScore,
  ).points
}
