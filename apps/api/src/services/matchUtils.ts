import { Match } from '../domain/match/Match'
import { MatchStatus } from '../domain/match/MatchStatus'

interface MatchScore {
  fullTime: { home: number | null; away: number | null }
}

/**
 * Pure translation from the upstream feed's status string to ours. The
 * "stale live → finished after 12h" business rule lives in
 * `domain/match/Match.deriveStatusFromApi`; this function just maps strings.
 */
function rawTranslate(apiStatus: string): MatchStatus {
  const statusMap: Record<string, MatchStatus> = {
    SCHEDULED: MatchStatus.Scheduled,
    TIMED: MatchStatus.Scheduled,
    IN_PLAY: MatchStatus.Live,
    PAUSED: MatchStatus.Live,
    FINISHED: MatchStatus.Finished,
    POSTPONED: MatchStatus.Postponed,
    CANCELLED: MatchStatus.Cancelled,
    SUSPENDED: MatchStatus.Cancelled,
    AWARDED: MatchStatus.Finished,
  }
  return statusMap[apiStatus] ?? MatchStatus.Scheduled
}

export function mapStatus(apiStatus: string, score?: MatchScore, utcDate?: string): string {
  const status = Match.deriveStatusFromApi({
    apiStatus,
    homeScore: score?.fullTime.home ?? null,
    awayScore: score?.fullTime.away ?? null,
    kickoffAt: utcDate ? new Date(utcDate) : new Date(),
    now: new Date(),
    rawTranslator: rawTranslate,
  })
  return status.value
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
