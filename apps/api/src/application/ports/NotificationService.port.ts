export interface WinnerInfo {
  userId: string
  name: string | null
  phoneNumber: string | null
  email: string | null
}

export interface ReminderMatch {
  homeTeam: string
  awayTeam: string
  minutesUntil: number
}

// Channel-agnostic reminder: carries the recipient's id + contacts so the
// notification adapter can pick a channel (Web Push first, then Telegram if a
// chat resolves from the phone, else verified email).
export interface ReminderData {
  userId: string
  userName: string | null
  phoneNumber: string | null
  email: string | null
  poolName: string
  poolId: string
  matches: ReminderMatch[]
}

// "Pontos conquistados ao final de cada jogo" — one per (user, pool) for a
// finished match. Push-only in v1 (no Telegram/email fallback).
export interface MatchPointsData {
  userId: string
  poolId: string
  poolName: string
  matchId: string
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
  points: number
  position: number
}

export interface AdminWithdrawalRequestNotification {
  userName: string
  poolName: string
  poolCode: string
  withdrawalId: string
  amount: number
  pixKeyType: string
  pixKey: string
}

// Admin alert: a match the feed reports finished but with no winner, held as
// live until resolved. Carries what the alert renders + the buttons need.
export interface AdminMatchNeedsWinnerNotification {
  matchId: string
  homeTeam: string
  awayTeam: string
  stage: string
  homeScore: number | null
  awayScore: number | null
  penaltyHomeScore: number | null
  penaltyAwayScore: number | null
}

export interface NotificationService {
  notifyWinners(
    poolId: string,
    poolName: string,
    winners: WinnerInfo[],
    prizeShare: number,
  ): Promise<void>
  notifyAdminWithdrawalRequest(params: AdminWithdrawalRequestNotification): Promise<void>
  notifyAdminMatchNeedsWinner(params: AdminMatchNeedsWinnerNotification): Promise<void>
  sendPredictionReminders(reminders: ReminderData[]): Promise<void>
  notifyMatchPoints(items: MatchPointsData[]): Promise<void>
}
