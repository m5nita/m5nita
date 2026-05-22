import { MatchdayRange } from './MatchdayRange'

export type PoolScopeKind = 'whole-competition' | 'range' | 'single-match'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class PoolScope {
  readonly kind: PoolScopeKind
  readonly range: MatchdayRange | null
  readonly matchId: string | null

  private constructor(kind: PoolScopeKind, range: MatchdayRange | null, matchId: string | null) {
    this.kind = kind
    this.range = range
    this.matchId = matchId
  }

  static wholeCompetition(): PoolScope {
    return new PoolScope('whole-competition', null, null)
  }

  static fromRange(range: MatchdayRange): PoolScope {
    return new PoolScope('range', range, null)
  }

  static singleMatch(matchId: string): PoolScope {
    if (!matchId || !UUID_RE.test(matchId)) {
      throw new Error('matchId must be a valid UUID')
    }
    return new PoolScope('single-match', null, matchId)
  }

  static fromRow(args: {
    matchdayFrom: number | null
    matchdayTo: number | null
    matchId: string | null
  }): PoolScope {
    const hasMatchId = args.matchId !== null
    const hasRange = args.matchdayFrom !== null || args.matchdayTo !== null
    if (hasMatchId && hasRange) {
      throw new Error('PoolScope cannot have both matchId and matchday range')
    }
    if (hasMatchId) {
      return PoolScope.singleMatch(args.matchId as string)
    }
    const range = MatchdayRange.create(args.matchdayFrom, args.matchdayTo)
    return range === null ? PoolScope.wholeCompetition() : PoolScope.fromRange(range)
  }

  contains(match: { id: string; matchday: number | null }): boolean {
    if (this.kind === 'whole-competition') return true
    if (this.kind === 'single-match') return match.id === this.matchId
    if (match.matchday === null) return false
    return (this.range as MatchdayRange).contains(match.matchday)
  }

  singleMatchIdOrNull(): string | null {
    return this.matchId
  }
}
