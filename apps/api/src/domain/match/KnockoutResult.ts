import type { KnockoutContext } from '../scoring/AdvanceBonus'
import { isKnockout } from './MatchStage'

export type MatchDuration = 'regular' | 'extra_time' | 'penalty_shootout'
export type MatchWinner = 'home' | 'away' | 'draw'

type GoalPair = { home: number | null; away: number | null }

type SubScores = {
  fullTime: GoalPair
  regularTime?: GoalPair | null
}

/**
 * The scoreline used for grading: the **regular-time** (90-minute) score only.
 * Extra-time and shootout goals never count toward the scoreline — they are
 * rewarded separately via the advance bonus. For a match that never left
 * regular time, `regularTime` may be absent, so we fall back to full-time
 * (which equals the 90-minute score). Returns nulls when the match isn't
 * finished.
 */
export function gradedScoreline(s: SubScores): GoalPair {
  return {
    home: s.regularTime?.home ?? s.fullTime.home,
    away: s.regularTime?.away ?? s.fullTime.away,
  }
}

type FinishedKnockout = {
  stage: string
  winner: string | null
  duration: string | null
}

/**
 * Builds the knockout scoring context for a finished match, or `undefined` when
 * the match isn't a knockout or has no decisive winner (e.g. data not settled).
 * `pastRegularTime` is true when the match is in or past regular time —
 * settled in overtime, OR live in extra time.
 */
export function knockoutContextFor(
  match: FinishedKnockout,
  predictedAdvance: 'home' | 'away' | null,
): KnockoutContext | undefined {
  if (!isKnockout(match.stage)) return undefined
  if (match.winner !== 'home' && match.winner !== 'away') return undefined
  return {
    pastRegularTime: match.duration === 'extra_time' || match.duration === 'penalty_shootout',
    advancingSide: match.winner === 'home' ? 'home' : 'away',
    predictedAdvance,
  }
}
