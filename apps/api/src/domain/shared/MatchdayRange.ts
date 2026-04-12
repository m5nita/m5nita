export class MatchdayRange {
  readonly from: number
  readonly to: number

  private constructor(from: number, to: number) {
    this.from = from
    this.to = to
  }

  static create(from: number | null, to: number | null): MatchdayRange | null {
    if (from === null && to === null) {
      return null
    }
    if (from === null || to === null) {
      throw new Error('Both from and to must be provided together')
    }
    if (from > to) {
      throw new Error('from must be less than or equal to to')
    }
    return new MatchdayRange(from, to)
  }

  contains(matchday: number): boolean {
    return matchday >= this.from && matchday <= this.to
  }
}
