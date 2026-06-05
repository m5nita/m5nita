import type { Match } from '../match/Match'
import { Score } from '../scoring/Score'

export type AdvanceSide = 'home' | 'away'

export class Prediction {
  readonly id: string | null
  readonly userId: string
  readonly poolId: string
  readonly matchId: string
  readonly homeScore: number
  readonly awayScore: number
  /** Knockout only: which side the member thinks advances past regular time. */
  readonly advancePick: AdvanceSide | null
  private _points: number | null

  constructor(
    id: string | null,
    userId: string,
    poolId: string,
    matchId: string,
    homeScore: number,
    awayScore: number,
    points: number | null = null,
    advancePick: AdvanceSide | null = null,
  ) {
    this.id = id
    this.userId = userId
    this.poolId = poolId
    this.matchId = matchId
    this.homeScore = homeScore
    this.awayScore = awayScore
    this.advancePick = advancePick
    this._points = points
  }

  get points(): number | null {
    return this._points
  }

  calculatePoints(actualHome: number, actualAway: number): void {
    const score = Score.calculate(this.homeScore, this.awayScore, actualHome, actualAway)
    this._points = score.points
  }

  /**
   * @deprecated use `Prediction.canSubmitFor(match, now)`. Kept as a thin
   * delegate for tests that exercise the deadline rule with a raw Date.
   */
  static canSubmit(matchDate: Date, now: Date): boolean {
    return matchDate > now
  }

  /** Domain-anchored: predictions are open while the match still accepts them. */
  static canSubmitFor(match: Match, now: Date): boolean {
    return match.canBePredicted(now)
  }
}
