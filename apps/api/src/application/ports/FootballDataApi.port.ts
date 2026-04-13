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
    fullTime: { home: number | null; away: number | null }
  }
}

export interface FootballDataApi {
  fetchMatches(competitionExternalId: string, season: string): Promise<ExternalMatch[]>
  fetchLiveMatches(competitionExternalId: string, date: string): Promise<ExternalMatch[]>
}
