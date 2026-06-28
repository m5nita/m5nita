import { liveKnockoutContextFor } from '../../domain/match/KnockoutResult'
import type { AdvanceSide } from '../../domain/prediction/Prediction'
import type { ScoringPolicy } from '../../domain/scoring/ScoringPolicy'

type PredictionScores = { homeScore: number; awayScore: number; advancePick?: AdvanceSide | null }
type MatchState = {
  status: string
  homeScore: number | null
  awayScore: number | null
  stage?: string
  duration?: string | null
  extraTimeHomeScore?: number | null
  extraTimeAwayScore?: number | null
}

export type LiveBreakdown = { total: number; category: number; bonus: number; advanceBonus: number }
export type LivePoints = number | null | LiveBreakdown

export function computeLivePoints(
  prediction: PredictionScores,
  match: MatchState,
  storedPoints: number | null,
  scoringPolicy: ScoringPolicy,
): LivePoints {
  if (match.status !== 'live') return storedPoints
  if (match.homeScore === null || match.awayScore === null) return null

  const knockout = liveKnockoutContextFor(
    {
      status: match.status,
      stage: match.stage ?? '',
      duration: match.duration ?? null,
      regHome: match.homeScore,
      regAway: match.awayScore,
      extraHome: match.extraTimeHomeScore ?? null,
      extraAway: match.extraTimeAwayScore ?? null,
    },
    prediction.advancePick ?? null,
  )

  const score = scoringPolicy.score(
    prediction.homeScore,
    prediction.awayScore,
    match.homeScore,
    match.awayScore,
    knockout,
  )

  if (score.breakdown) {
    return {
      total: score.points,
      category: score.breakdown.category,
      bonus: score.breakdown.bonus,
      advanceBonus: score.breakdown.advanceBonus,
    }
  }
  return score.points
}
