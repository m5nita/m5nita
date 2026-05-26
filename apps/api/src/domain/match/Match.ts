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
   * to a domain `MatchStatus`, applying the "stale live" rule: if the feed
   * still reports IN_PLAY/PAUSED but we have scores and kickoff was more than
   * `StaleMatchPolicy.maxLiveDurationMs` ago, we treat the match as finished.
   *
   * The pure string-to-string translation stays in `services/matchUtils.ts`;
   * this method adds the temporal decision on top.
   */
  static deriveStatusFromApi(input: {
    apiStatus: string
    homeScore: number | null
    awayScore: number | null
    kickoffAt: Date
    now: Date
    rawTranslator: (apiStatus: string) => MatchStatus
  }): MatchStatus {
    const isLiveByFeed = input.apiStatus === 'IN_PLAY' || input.apiStatus === 'PAUSED'
    const hasScores = input.homeScore !== null && input.awayScore !== null
    if (
      isLiveByFeed &&
      hasScores &&
      StaleMatchPolicy.isStaleSinceKickoff(input.kickoffAt, input.now)
    ) {
      return MatchStatus.Finished
    }
    return input.rawTranslator(input.apiStatus)
  }
}
