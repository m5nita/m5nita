export interface WinnerInfo {
  name: string | null
  phoneNumber: string | null
  email: string | null
}

export interface ReminderMatch {
  homeTeam: string
  awayTeam: string
  minutesUntil: number
}

// Channel-agnostic reminder: carries the recipient's contacts so the notification
// adapter can pick a channel (Telegram if a chat resolves from the phone, else email).
export interface ReminderData {
  userName: string | null
  phoneNumber: string | null
  email: string | null
  poolName: string
  poolId: string
  matches: ReminderMatch[]
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

export interface NotificationService {
  notifyWinners(poolName: string, winners: WinnerInfo[], prizeShare: number): Promise<void>
  notifyAdminWithdrawalRequest(params: AdminWithdrawalRequestNotification): Promise<void>
  sendPredictionReminders(reminders: ReminderData[]): Promise<void>
}
