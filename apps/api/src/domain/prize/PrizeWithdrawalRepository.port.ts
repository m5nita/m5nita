export type PrizeWithdrawal = {
  id: string
  poolId: string
  userId: string
  paymentId: string
  amount: number
  pixKeyType: string
  pixKey: string
  status: string
  createdAt: Date
  updatedAt: Date
}

export type CreateWithdrawalData = {
  poolId: string
  userId: string
  amount: number
  pixKeyType: string
  pixKey: string
}

export interface PrizeWithdrawalRepository {
  findByPoolAndUser(poolId: string, userId: string): Promise<PrizeWithdrawal | null>
  createWithPayment(data: CreateWithdrawalData): Promise<PrizeWithdrawal>
  markAsCompleted(id: string): Promise<PrizeWithdrawal>
}
