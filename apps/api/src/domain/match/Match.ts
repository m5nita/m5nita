import { MatchStatus } from './MatchStatus'
import { StaleMatchPolicy } from './StaleMatchPolicy'

/**
 * Match aggregate. Wraps the temporal/business decisions that previously
 * leaked into `services/matchUtils.ts`, `CreatePoolUseCase`,
 * `UpsertPredictionUseCase`, and `closePoolsJob`.
 *
 * The persistence-side shape (`MatchData`) still travels through the
 * repository port. This class is used by application code to ask domain
 * questions — `canBePredicted`, `canBeTargetOfSingleMatchPool`, etc.
 */
export class Match {
  readonly id: string
  readonly competitionId: string
  readonly kickoffAt: Date
  readonly matchday: number | null
  readonly status: MatchStatus
  readonly homeScore: number | null
  readonly awayScore: number | null

  constructor(
    id: string,
    competitionId: string,
    kickoffAt: Date,
    matchday: number | null,
    status: MatchStatus,
    homeScore: number | null = null,
    awayScore: number | null = null,
  ) {
    this.id = id
    this.competitionId = competitionId
    this.kickoffAt = kickoffAt
    this.matchday = matchday
    this.status = status
    this.homeScore = homeScore
    this.awayScore = awayScore
  }

  /** Predictions are accepted up to kickoff. */
  canBePredicted(now: Date): boolean {
    return this.status.isScheduled() && this.kickoffAt > now
  }

  /** Only matches that haven't started are valid targets of a single-match pool. */
  canBeTargetOfSingleMatchPool(now: Date): boolean {
    return this.status.isScheduled() && this.kickoffAt > now
  }

  isFinished(): boolean {
    return this.status.isFinished()
  }

  hasScores(): boolean {
    return this.homeScore !== null && this.awayScore !== null
  }

  /**
   * Maps a raw status from the upstream feed (`SCHEDULED`/`IN_PLAY`/`FINISHED`/…)
   * to a domain `MatchStatus`, applying three rules:
   *
   * 1. **Stale live**: if the feed still reports IN_PLAY/PAUSED but we have scores
   *    and kickoff was more than `StaleMatchPolicy.maxLiveDurationMs` ago, the
   *    match would be treated as finished.
   * 2. **Winner gate**: a match is NEVER finished without a known winner. When the
   *    feed (or the stale rule) would finish a match that has scores but no
   *    `winner` yet, it is HELD as `live` (`heldForWinner: true`) until the winner
   *    arrives or an admin sets it. A plain translation with no scores still maps
   *    FINISHED→finished.
   * 3. **Decisive-duration gate**: a knockout that is level after regulation
   *    (`homeScore === awayScore`, the 90' score) yet reports a decisive winner
   *    (`home`/`away`) was settled in extra time / penalties. The feed populates
   *    `winner` BEFORE it consolidates `duration`/`penalties`, so finalizing at
   *    that instant would grade the base result WITHOUT the +2 advance bonus (the
   *    bonus needs `duration` = extra_time/penalty_shootout) and never re-score.
   *    Hold as `live` until the decisive `duration` arrives, so the match is
   *    scored exactly once — with the bonus. `homeScore`/`awayScore` MUST be the
   *    regulation-time (90') score for this check to be correct.
   */
  static deriveStatusFromApi(input: {
    apiStatus: string
    homeScore: number | null
    awayScore: number | null
    winner: string | null
    duration?: string | null
    kickoffAt: Date
    now: Date
    rawTranslator: (apiStatus: string) => MatchStatus
  }): { status: MatchStatus; heldForWinner: boolean } {
    const raw = input.rawTranslator(input.apiStatus)
    const isLiveByFeed = input.apiStatus === 'IN_PLAY' || input.apiStatus === 'PAUSED'
    const hasScores = input.homeScore !== null && input.awayScore !== null
    const staleFinish =
      isLiveByFeed && hasScores && StaleMatchPolicy.isStaleSinceKickoff(input.kickoffAt, input.now)
    const wantsFinish = raw.isFinished() || staleFinish
    if (wantsFinish && hasScores && input.winner === null) {
      return { status: MatchStatus.Live, heldForWinner: true }
    }
    const decidedPastRegulation =
      hasScores &&
      input.homeScore === input.awayScore &&
      (input.winner === 'home' || input.winner === 'away')
    const durationDecisive =
      input.duration === 'extra_time' || input.duration === 'penalty_shootout'
    if (wantsFinish && decidedPastRegulation && !durationDecisive) {
      return { status: MatchStatus.Live, heldForWinner: true }
    }
    if (staleFinish) return { status: MatchStatus.Finished, heldForWinner: false }
    return { status: raw, heldForWinner: false }
  }
}
