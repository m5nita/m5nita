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

export interface MatchRepository {
  findById(id: string): Promise<MatchData | null>
  findByCompetition(competitionId: string, filters?: MatchFilters): Promise<MatchData[]>
  findLive(): Promise<MatchData[]>
  upsertMany(matches: UpsertMatchData[]): Promise<MatchData[]>
  updateScores(id: string, homeScore: number, awayScore: number, status: string): Promise<void>
}
