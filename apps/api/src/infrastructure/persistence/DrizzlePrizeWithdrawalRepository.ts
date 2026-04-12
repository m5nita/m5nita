import { and, eq } from 'drizzle-orm'
import type { db as dbClient } from '../../db/client'
import { payment } from '../../db/schema/payment'
import { prizeWithdrawal } from '../../db/schema/prizeWithdrawal'
import type {
  CreateWithdrawalData,
  PrizeWithdrawal,
  PrizeWithdrawalRepository,
} from '../../domain/prize/PrizeWithdrawalRepository.port'

export class DrizzlePrizeWithdrawalRepository implements PrizeWithdrawalRepository {
  constructor(private readonly db: typeof dbClient) {}

  async findByPoolAndUser(poolId: string, userId: string): Promise<PrizeWithdrawal | null> {
    const row = await this.db.query.prizeWithdrawal.findFirst({
      where: and(eq(prizeWithdrawal.poolId, poolId), eq(prizeWithdrawal.userId, userId)),
    })
    if (!row) return null

    return {
      id: row.id,
      poolId: row.poolId,
      userId: row.userId,
      paymentId: row.paymentId,
      amount: row.amount,
      pixKeyType: row.pixKeyType,
      pixKey: row.pixKey,
      status: row.status,
      createdAt: row.createdAt,
    }
  }

  async createWithPayment(data: CreateWithdrawalData): Promise<PrizeWithdrawal> {
    return await this.db.transaction(async (tx) => {
      const [prizePayment] = await tx
        .insert(payment)
        .values({
          userId: data.userId,
          poolId: data.poolId,
          amount: data.amount,
          platformFee: 0,
          type: 'prize',
          status: 'pending',
        })
        .returning()

      const paymentRecord = prizePayment as NonNullable<typeof prizePayment>

      const [withdrawal] = await tx
        .insert(prizeWithdrawal)
        .values({
          poolId: data.poolId,
          userId: data.userId,
          paymentId: paymentRecord.id,
          amount: data.amount,
          pixKeyType: data.pixKeyType,
          pixKey: data.pixKey,
        })
        .returning()

      const row = withdrawal as NonNullable<typeof withdrawal>

      return {
        id: row.id,
        poolId: row.poolId,
        userId: row.userId,
        paymentId: row.paymentId,
        amount: row.amount,
        pixKeyType: row.pixKeyType,
        pixKey: row.pixKey,
        status: row.status,
        createdAt: row.createdAt,
      }
    })
  }
}
