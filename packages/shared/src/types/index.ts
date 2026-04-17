export type PoolStatus = 'active' | 'closed' | 'cancelled'
export type PaymentStatus = 'pending' | 'completed' | 'refunded' | 'expired'
export type PaymentType = 'entry' | 'refund' | 'prize'
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
  isOpen: boolean
  status: PoolStatus
}

export interface PoolListItem {
  id: string
  name: string
  entryFee: number
  competitionName: string
  memberCount: number
  userPosition: number | null
  userPoints: number
  status: PoolStatus
  nextMatchAt: string | null
  lastMatchAt: string | null
}

export interface PoolDetail extends Pool {
  competitionName: string
  owner: { id: string; name: string | null }
  memberCount: number
  prizeTotal: number
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
  homeScore: number | null
  awayScore: number | null
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
  points: number | null
  match?: Match
}

export interface MatchPredictor {
  userId: string
  name: string | null
  homeScore: number
  awayScore: number
  points: number | null
}

export interface MatchNonPredictor {
  userId: string
  name: string | null
}

export interface MatchPredictionsResponse {
  matchId: string
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
