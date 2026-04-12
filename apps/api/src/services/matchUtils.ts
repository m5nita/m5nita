interface MatchScore {
  fullTime: { home: number | null; away: number | null }
}

const MATCH_MAX_DURATION_MS = 12 * 60 * 60 * 1000

export function mapStatus(apiStatus: string, score?: MatchScore, utcDate?: string): string {
  if (
    (apiStatus === 'IN_PLAY' || apiStatus === 'PAUSED') &&
    utcDate &&
    score?.fullTime.home !== null &&
    score?.fullTime.away !== null &&
    Date.now() - new Date(utcDate).getTime() > MATCH_MAX_DURATION_MS
  ) {
    return 'finished'
  }

  const statusMap: Record<string, string> = {
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
  return statusMap[apiStatus] || 'scheduled'
}

export function mapStage(stage: string): string {
  const stageMap: Record<string, string> = {
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
  return stageMap[stage] || 'group'
}

export function mapStageForCompetition(stage: string, competitionType: string): string {
  if (competitionType === 'league') return 'league'
  return mapStage(stage)
}

export function extractGroup(group: string | null): string | null {
  if (!group) return null
  const groupMatch = group.match(/GROUP_([A-L])/i)
  return groupMatch ? (groupMatch[1]?.toUpperCase() ?? null) : null
}
