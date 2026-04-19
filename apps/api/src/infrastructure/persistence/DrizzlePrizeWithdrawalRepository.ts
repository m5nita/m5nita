import { and, eq } from 'drizzle-orm'
import type { db as dbClient } from '../../db/client'
import { payment } from '../../db/schema/payment'
import { prizeWithdrawal } from '../../db/schema/prizeWithdrawal'
import { PrizeWithdrawalError } from '../../domain/prize/PrizeWithdrawalError'
import type {
  CreateWithdrawalData,
  PrizeWithdrawal,
  PrizeWithdrawalRepository,
} from '../../domain/prize/PrizeWithdrawalRepository.port'

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505'
  )
}

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
    try {
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
    } catch (err) {
      // Race with a concurrent withdrawal request. The unique index on
      // (pool_id, user_id) rejected the second insert; the transaction
      // rolled back the orphan payment row automatically.
      if (isUniqueViolation(err)) {
        throw new PrizeWithdrawalError(
          'WITHDRAWAL_ALREADY_REQUESTED',
          'Você já solicitou a retirada do prêmio deste bolão.',
        )
      }
      throw err
    }
  }
}
