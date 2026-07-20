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
   * to a domain `MatchStatus`, applying these rules:
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
   * 4. **Knockout draw gate**: a knockout is never drawn. A `winner: 'draw'` on a
   *    knockout (`isKnockout`) is a premature end-of-regulation snapshot before
   *    extra time / penalties resolve; hold as `live` until a decisive winner
   *    lands, so a 0-0 "draw" is never graded in a final and its pools never
   *    close early. A group/league match legitimately finishes drawn.
   * 5. **ET-inflation gate**: a knockout the feed shows went past regulation
   *    (`wentPastRegulation` — its extra-time clock or ET/penalty sub-scores) but
   *    whose 90' score is not yet authoritative (`regulationScoreKnown` false →
   *    `homeScore`/`awayScore` are full-time, which merges the extra-time goal)
   *    and whose `duration` is not yet decisive. Hold until it settles, so the
   *    base result grades on the true 90' line with the advance bonus — even when
   *    the inflated full-time score is not level (which rule 3 would miss).
   */
  static deriveStatusFromApi(input: DeriveStatusInput): {
    status: MatchStatus
    heldForWinner: boolean
  } {
    const raw = input.rawTranslator(input.apiStatus)
    const isLiveByFeed = input.apiStatus === 'IN_PLAY' || input.apiStatus === 'PAUSED'
    const hasScores = input.homeScore !== null && input.awayScore !== null
    const staleFinish =
      isLiveByFeed && hasScores && StaleMatchPolicy.isStaleSinceKickoff(input.kickoffAt, input.now)
    const wantsFinish = raw.isFinished() || staleFinish
    if (wantsFinish && heldWhenFinishing(input, hasScores)) {
      return { status: MatchStatus.Live, heldForWinner: true }
    }
    if (staleFinish) return { status: MatchStatus.Finished, heldForWinner: false }
    return { status: raw, heldForWinner: false }
  }
}

type DeriveStatusInput = {
  apiStatus: string
  homeScore: number | null
  awayScore: number | null
  winner: string | null
  duration?: string | null
  isKnockout?: boolean
  wentPastRegulation?: boolean
  regulationScoreKnown?: boolean
  kickoffAt: Date
  now: Date
  rawTranslator: (apiStatus: string) => MatchStatus
}

/**
 * Whether a match the feed would finish must instead be HELD as live — a match is
 * never finished without a settled result. The gates (see `deriveStatusFromApi`):
 * no winner yet; a knockout reported as a draw; a knockout past regulation whose
 * 90' score / decisive duration hasn't consolidated (full-time still merges the
 * extra-time goal); and a level-regulation knockout awaiting its decisive duration.
 */
function heldWhenFinishing(input: DeriveStatusInput, hasScores: boolean): boolean {
  if (hasScores && input.winner === null) return true
  if (input.isKnockout && input.winner === 'draw') return true
  const durationDecisive = input.duration === 'extra_time' || input.duration === 'penalty_shootout'
  if (
    input.isKnockout &&
    input.wentPastRegulation &&
    !input.regulationScoreKnown &&
    !durationDecisive
  ) {
    return true
  }
  const decidedPastRegulation =
    hasScores &&
    input.homeScore === input.awayScore &&
    (input.winner === 'home' || input.winner === 'away')
  return decidedPastRegulation && !durationDecisive
}
