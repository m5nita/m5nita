import type { Match } from '../match/Match'

/**
 * Whether an unfinished in-scope match still stands between a pool and closing.
 *
 * A match blocks while it can still be played or predicted: it is live, or its
 * kickoff has not arrived. Anything else is *stranded* — postponed with no new
 * date, or scheduled for a kickoff that came and went without the feed ever
 * starting it. A stranded match can neither take a prediction
 * (`Match.canBePredicted` requires `scheduled` AND a future kickoff) nor produce
 * points, so it must not keep a pool — and its prize — open indefinitely.
 *
 * Terminal matches never reach here: the repository read that feeds this policy
 * already excludes `MatchStatus.TERMINAL_VALUES`.
 *
 * This is the ADMIN threshold. The automatic job (`closePoolsJob`) keeps its own,
 * stricter rule: it closes only when nothing unfinished is left at all.
 *
 * A stranded match with no predictions is harmless to leave behind: nobody
 * bet on it, so it can never move the ranking. But a stranded match that DOES
 * carry a prediction — the pool was created (or the match postponed) after
 * someone already called it — is not harmless. Closing a pool only stops
 * *new* predictions (`PoolStatus.canAcceptPredictions`); it does not freeze
 * the ranking. If the match is later rescheduled and played, the scoring job
 * (`calcPointsForMatch`) scores every existing prediction on it and
 * recomputes standings for the pool regardless of pool status — including a
 * closed one — so a pre-existing prediction can still change who is in first
 * place after the pool was declared settled. `blocksOnPredictions` is
 * deliberately NOT gated on `calcPoints`: correcting a mis-scored match via
 * `FinalizeMatchUseCase` must keep working in closed pools too. The fix lives
 * here instead, at admission to closing.
 */
export class PoolClosurePolicy {
  private constructor() {}

  static blocks(match: Match, now: Date): boolean {
    return match.status.isLive() || match.kickoffAt > now
  }

  /**
   * Whether a stranded match's existing predictions still require an explicit
   * `force` to close past. Zero predictions means nobody could be affected by
   * the match ever being rescheduled and played, so it is safe to ignore.
   */
  static blocksOnPredictions(predictionCount: number): boolean {
    return predictionCount > 0
  }
}
