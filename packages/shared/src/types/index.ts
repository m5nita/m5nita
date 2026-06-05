export type PoolStatus = 'active' | 'closed' | 'cancelled'
export type PaymentStatus = 'pending' | 'completed' | 'refunded' | 'expired'
export type PaymentType = 'entry' | 'refund' | 'prize' | 'stats_unlock'
export type MatchStage =
  | 'group'
  | 'round-of-32'
  | 'round-of-16'
  | 'quarter'
  | 'semi'
  | 'third-place'
  | 'final'
  | 'league'

export type CompetitionType = 'cup' | 'league'
export type CompetitionStatus = 'active' | 'finished'

export interface Competition {
  id: string
  externalId: string
  name: string
  season: string
  type: CompetitionType
  status: CompetitionStatus
  featured: boolean
}
export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled'
export type MatchGroup = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L'
export type MatchWinner = 'home' | 'away' | 'draw'
export type MatchDuration = 'regular' | 'extra_time' | 'penalty_shootout'
export type AdvanceSide = 'home' | 'away'

export interface User {
  id: string
  name: string | null
  phoneNumber: string
}

export interface Pool {
  id: string
  name: string
  entryFee: number
  ownerId: string
  inviteCode: string
  competitionId: string
  matchdayFrom: number | null
  matchdayTo: number | null
  matchId: string | null
  isOpen: boolean
  status: PoolStatus
}

export interface PoolListItem {
  id: string
  name: string
  entryFee: number
  competitionName: string
  memberCount: number
  status: PoolStatus
  nextMatchAt: string | null
  lastMatchAt: string | null
  hasLiveMatch: boolean
}

export interface PoolDetail extends Pool {
  competitionName: string
  owner: { id: string; name: string | null }
  memberCount: number
  prizeTotal: number
  hasLiveMatch: boolean
  isMember: boolean
  userStats: {
    position: number | null
    totalPoints: number
    predictionsCount: number
    exactMatches: number
  } | null
}

export interface PoolInviteInfo {
  id: string
  name: string
  entryFee: number
  competitionName: string
  matchdayFrom: number | null
  matchdayTo: number | null
  matchId: string | null
  singleMatch: {
    id: string
    homeTeam: string
    awayTeam: string
    homeFlag: string
    awayFlag: string
    kickoffAt: string
    stage: string | null
    matchday: number | null
  } | null
  platformFee: number
  originalPlatformFee: number
  discountPercent: number
  owner: { name: string | null }
  memberCount: number
  prizeTotal: number
  isOpen: boolean
}

export interface CompetitionListItem extends Competition {
  seasonDisplay: string
  matchCount: number
  upcomingMatchCount: number
  matchdays: { min: number; max: number; nextMatchday: number } | null
}

export interface Match {
  id: string
  competitionId: string
  homeTeam: string
  awayTeam: string
  homeFlag: string | null
  awayFlag: string | null
  /** Graded scoreline = the regular-time (90') score (never extra time / penalties). */
  homeScore: number | null
  awayScore: number | null
  /** Knockout result detail (null for non-knockout or not-yet-settled). */
  extraTimeHomeScore?: number | null
  extraTimeAwayScore?: number | null
  penaltyHomeScore?: number | null
  penaltyAwayScore?: number | null
  winner?: MatchWinner | null
  duration?: MatchDuration | null
  stage: MatchStage
  group: MatchGroup | null
  matchday: number | null
  matchDate: string
  status: MatchStatus
}

export interface Prediction {
  id: string
  matchId: string
  homeScore: number
  awayScore: number
  /** Knockout only: which side the member picked to advance past regular time. */
  advancePick?: AdvanceSide | null
  points: number | null
  /** Single-match pools only: the category portion of `points` (0/5/7/8/10). */
  category?: number | null
  /** Single-match pools only: the proximity bonus portion of `points` (0-4). */
  bonus?: number | null
  /** The +2 advance bonus portion of `points` (knockout settled past regular time). */
  advanceBonus?: number | null
  match?: Match
}

export interface MatchPredictor {
  userId: string
  name: string | null
  homeScore: number
  awayScore: number
  points: number | null
  /** Single-match pools only: the category portion (0/5/7/8/10). */
  category?: number | null
  /** Single-match pools only: the proximity bonus portion (0-4). */
  bonus?: number | null
  /** The +2 advance bonus portion (knockout settled past regular time). */
  advanceBonus?: number | null
}

export interface MatchNonPredictor {
  userId: string
  name: string | null
}

export interface MatchPredictionsResponse {
  matchId: string
  matchStatus: MatchStatus
  isLocked: true
  totalMembers: number
  viewerIncluded: boolean
  viewerDidPredict: boolean
  predictors: MatchPredictor[]
  nonPredictors: MatchNonPredictor[]
}

export interface RankingEntry {
  position: number
  userId: string
  name: string | null
  totalPoints: number
  livePoints: number
  exactMatches: number
  isCurrentUser: boolean
}

export interface PaymentIntent {
  id: string
  clientSecret: string
  amount: number
}

export interface ApiError {
  error: string
  message: string
}

export type PixKeyType = 'cpf' | 'email' | 'phone' | 'random'
export type WithdrawalStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface PrizeWithdrawal {
  id: string
  poolId: string
  userId: string
  amount: number
  pixKeyType: PixKeyType
  pixKey: string
  status: WithdrawalStatus
  createdAt: string
}

export interface PrizeInfo {
  prizeTotal: number
  winnerCount: number
  winnerShare: number
  isWinner: boolean
  withdrawal: PrizeWithdrawal | null
  winners: {
    userId: string
    name: string | null
    position: number
    totalPoints: number
    exactMatches: number
  }[]
}

export interface PendingPrize {
  poolId: string
  poolName: string
  winnerShare: number
  winnerCount: number
}

export interface PendingPrizesResponse {
  items: PendingPrize[]
}
