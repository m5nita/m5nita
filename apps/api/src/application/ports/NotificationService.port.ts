export interface WinnerInfo {
  name: string | null
  phoneNumber: string | null
}

export interface ReminderData {
  chatId: number
  poolName: string
  poolId: string
  matches: Array<{ homeTeam: string; awayTeam: string; minutesUntil: number }>
}

export interface NotificationService {
  notifyWinners(poolName: string, winners: WinnerInfo[], prizeShare: number): Promise<void>
  notifyAdminWithdrawalRequest(params: {
    userName: string
    poolName: string
    poolCode: string
    withdrawalId: string
    amount: number
    pixKeyType: string
    pixKey: string
  }): Promise<void>
  sendPredictionReminders(reminders: ReminderData[]): Promise<void>
}
