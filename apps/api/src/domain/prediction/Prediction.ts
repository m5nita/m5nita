import { Score } from '../scoring/Score'

export class Prediction {
  readonly id: string | null
  readonly userId: string
  readonly poolId: string
  readonly matchId: string
  readonly homeScore: number
  readonly awayScore: number
  private _points: number | null

  constructor(
    id: string | null,
    userId: string,
    poolId: string,
    matchId: string,
    homeScore: number,
    awayScore: number,
    points: number | null = null,
  ) {
    this.id = id
    this.userId = userId
    this.poolId = poolId
    this.matchId = matchId
    this.homeScore = homeScore
    this.awayScore = awayScore
    this._points = points
  }

  get points(): number | null {
    return this._points
  }

  calculatePoints(actualHome: number, actualAway: number): void {
    const score = Score.calculate(this.homeScore, this.awayScore, actualHome, actualAway)
    this._points = score.points
  }

  static canSubmit(matchDate: Date, now: Date): boolean {
    return matchDate > now
  }
}
