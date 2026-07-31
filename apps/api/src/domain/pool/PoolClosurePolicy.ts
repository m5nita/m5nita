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
 */
export class PoolClosurePolicy {
  private constructor() {}

  static blocks(match: Match, now: Date): boolean {
    return match.status.isLive() || match.kickoffAt > now
  }
}
