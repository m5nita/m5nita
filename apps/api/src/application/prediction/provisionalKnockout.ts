import { knockoutContextFor, liveKnockoutContextFor } from '../../domain/match/KnockoutResult'
import type { KnockoutContext } from '../../domain/scoring/AdvanceBonus'

export type ProvisionalMatchState = {
  status: string
  stage: string
  duration: string | null
  winner: string | null
  home: number
  away: number
  extraHome: number | null
  extraAway: number | null
}

/**
 * The knockout context to use for a match still being scored "live" in the
 * ranking: the provisional extra-time leader while live, or the settled winner
 * once finished (covers the brief window before calcPoints persists points).
 */
export function provisionalKnockoutContext(
  m: ProvisionalMatchState,
  advancePick: 'home' | 'away' | null,
): KnockoutContext | undefined {
  if (m.status === 'live') {
    return liveKnockoutContextFor(
      {
        status: m.status,
        stage: m.stage,
        duration: m.duration,
        regHome: m.home,
        regAway: m.away,
        extraHome: m.extraHome,
        extraAway: m.extraAway,
      },
      advancePick,
    )
  }
  return knockoutContextFor({ stage: m.stage, winner: m.winner, duration: m.duration }, advancePick)
}
