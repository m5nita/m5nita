export type MatchRow = {
  id: string
  competitionId: string
  externalId: number
  homeTeam: string
  awayTeam: string
  homeFlag: string | null
  awayFlag: string | null
  homeScore: number | null
  awayScore: number | null
  stage: string
  group: string | null
  matchday: number | null
  matchDate: Date
  status: string
  createdAt: Date
  updatedAt: Date
}

export type MatchData = {
  id: string
  competitionId: string
  externalId: number
  homeTeam: string
  awayTeam: string
  homeFlag: string | null
  awayFlag: string | null
  homeScore: number | null
  awayScore: number | null
  stage: string
  group: string | null
  matchday: number | null
  matchDate: Date
  status: string
}

const STATUS_MAP: Record<string, string> = {
  SCHEDULED: 'scheduled',
  TIMED: 'scheduled',
  IN_PLAY: 'live',
  PAUSED: 'live',
  FINISHED: 'finished',
  POSTPONED: 'postponed',
  CANCELLED: 'cancelled',
  SUSPENDED: 'cancelled',
  AWARDED: 'finished',
}

const STAGE_MAP: Record<string, string> = {
  GROUP_STAGE: 'group',
  LAST_32: 'round-of-32',
  ROUND_OF_32: 'round-of-32',
  LAST_16: 'round-of-16',
  ROUND_OF_16: 'round-of-16',
  QUARTER_FINALS: 'quarter',
  SEMI_FINALS: 'semi',
  THIRD_PLACE: 'third-place',
  FINAL: 'final',
  REGULAR_SEASON: 'league',
}

export function matchToData(row: MatchRow): MatchData {
  return {
    id: row.id,
    competitionId: row.competitionId,
    externalId: row.externalId,
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    homeFlag: row.homeFlag,
    awayFlag: row.awayFlag,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    stage: row.stage,
    group: row.group,
    matchday: row.matchday,
    matchDate: row.matchDate,
    status: row.status,
  }
}

export function mapStatus(apiStatus: string): string {
  return STATUS_MAP[apiStatus] || 'scheduled'
}

export function mapStage(apiStage: string, competitionType: string): string {
  if (competitionType === 'league') return 'league'
  return STAGE_MAP[apiStage] || 'group'
}

export function extractGroup(apiGroup: string | null): string | null {
  if (!apiGroup) return null
  const matched = apiGroup.match(/GROUP_([A-L])/i)
  return matched ? (matched[1]?.toUpperCase() ?? null) : null
}
