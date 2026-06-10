type GoalPair = { home: number | null; away: number | null }

export interface ExternalMatch {
  id: number
  utcDate: string
  status: string
  stage: string
  group: string | null
  matchday: number | null
  homeTeam: { name: string; crest: string }
  awayTeam: { name: string; crest: string }
  score: {
    // HOME_TEAM | AWAY_TEAM | DRAW — present once the match is finished
    winner?: string | null
    // REGULAR | EXTRA_TIME | PENALTY_SHOOTOUT
    duration?: string | null
    // running/full-time score (may merge extra-time and even penalty goals — do NOT grade on this)
    fullTime: GoalPair
    // the 90-minute score (what predictions grade against); present for knockout/overtime matches
    regularTime?: GoalPair | null
    // extra-time-only goals; penalty-shootout tally
    extraTime?: GoalPair | null
    penalties?: GoalPair | null
  }
}

export interface FootballDataApi {
  fetchMatches(competitionExternalId: string, season: string): Promise<ExternalMatch[]>
  fetchLiveMatches(
    competitionExternalId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<ExternalMatch[]>
}
