export type MatchData = {
  id: string
  externalId: string
  competitionId: string
  homeTeam: string
  awayTeam: string
  homeFlag: string
  awayFlag: string
  homeScore: number | null
  awayScore: number | null
  extraTimeHomeScore: number | null
  extraTimeAwayScore: number | null
  penaltyHomeScore: number | null
  penaltyAwayScore: number | null
  /** 'home' | 'away' | 'draw' — the advancing/winning side */
  winner: string | null
  /** 'regular' | 'extra_time' | 'penalty_shootout' */
  duration: string | null
  stage: string
  group: string | null
  matchday: number | null
  matchDate: Date
  status: string
}

export type MatchFilters = {
  status?: string
  stage?: string
  group?: string
  matchday?: number
}

export type UpsertMatchData = Omit<MatchData, 'id'>

/** Fields written when a match score changes / it finishes. Knockout fields are null until known. */
export type MatchResultUpdate = {
  homeScore: number
  awayScore: number
  status: string
  winner?: string | null
  duration?: string | null
  extraTimeHomeScore?: number | null
  extraTimeAwayScore?: number | null
  penaltyHomeScore?: number | null
  penaltyAwayScore?: number | null
}

import type { UnfinishedMatchesQuery } from '../pool/Pool'

export interface MatchRepository {
  findById(id: string): Promise<MatchData | null>
  findByCompetition(competitionId: string, filters?: MatchFilters): Promise<MatchData[]>
  findUpcomingByCompetition(competitionId: string, now: Date): Promise<MatchData[]>
  findLive(): Promise<MatchData[]>
  upsertMany(matches: UpsertMatchData[]): Promise<MatchData[]>
  updateScores(id: string, result: MatchResultUpdate): Promise<void>
  hasUnfinishedMatches(
    competitionId: string,
    matchdayFrom?: number | null,
    matchdayTo?: number | null,
  ): Promise<boolean>
  /**
   * Domain-anchored variant: takes the query the Pool aggregate emits.
   * Adapter handles single-match vs range internally so callers don't branch.
   */
  hasUnfinishedFor(query: UnfinishedMatchesQuery): Promise<boolean>
  /**
   * The pool's not-yet-started in-scope matches (kickoff in the future, not
   * finished/cancelled), ordered by kickoff. Adapter translates the Pool query
   * so callers never branch on scope.
   */
  findPendingFor(query: UnfinishedMatchesQuery, now: Date): Promise<MatchData[]>
}
