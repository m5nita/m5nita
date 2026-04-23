import { Score } from '../../domain/scoring/Score'

type PredictionScores = { homeScore: number; awayScore: number }
type MatchState = { status: string; homeScore: number | null; awayScore: number | null }

export function computeLivePoints(
  prediction: PredictionScores,
  match: MatchState,
  storedPoints: number | null,
): number | null {
  if (match.status !== 'live') return storedPoints
  if (match.homeScore === null || match.awayScore === null) return null
  return Score.calculate(
    prediction.homeScore,
    prediction.awayScore,
    match.homeScore,
    match.awayScore,
  ).points
}
