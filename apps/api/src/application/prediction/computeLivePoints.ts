import type { ScoringPolicy } from '../../domain/scoring/ScoringPolicy'

type PredictionScores = { homeScore: number; awayScore: number }
type MatchState = { status: string; homeScore: number | null; awayScore: number | null }

export type LiveBreakdown = { total: number; category: number; bonus: number }
export type LivePoints = number | null | LiveBreakdown

export function computeLivePoints(
  prediction: PredictionScores,
  match: MatchState,
  storedPoints: number | null,
  scoringPolicy: ScoringPolicy,
): LivePoints {
  if (match.status !== 'live') return storedPoints
  if (match.homeScore === null || match.awayScore === null) return null

  const score = scoringPolicy.score(
    prediction.homeScore,
    prediction.awayScore,
    match.homeScore,
    match.awayScore,
  )

  if (score.breakdown) {
    return {
      total: score.points,
      category: score.breakdown.category,
      bonus: score.breakdown.bonus,
    }
  }
  return score.points
}
