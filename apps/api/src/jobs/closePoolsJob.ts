import { and, eq, gte, lte, ne, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { user } from '../db/schema/auth'
import { match } from '../db/schema/match'
import { pool } from '../db/schema/pool'
import { poolMember } from '../db/schema/poolMember'
import { notifyWinners } from '../lib/telegram'
import { getEffectiveFeeRate } from '../services/coupon'
import { getPoolRanking } from '../services/ranking'

export async function checkAndClosePools(): Promise<void> {
  // 1. Find all active pools (with competition and coupon relations)
  const activePools = await db.query.pool.findMany({
    where: eq(pool.status, 'active'),
    with: { competition: true, coupon: true },
  })

  if (activePools.length === 0) return

  let closedCount = 0

  // 2. Process each pool sequentially
  for (const p of activePools) {
    try {
      // Build conditions scoped to this pool's competition
      const conditions = [eq(match.competitionId, p.competitionId), ne(match.status, 'finished')]

      // If pool has matchday range, also filter by matchday
      if (p.matchdayFrom != null) {
        conditions.push(gte(match.matchday, p.matchdayFrom))
      }
      if (p.matchdayTo != null) {
        conditions.push(lte(match.matchday, p.matchdayTo))
      }

      // Check if there are any unfinished matches in scope
      const [unfinished] = await db
        .select({ id: match.id })
        .from(match)
        .where(and(...conditions))
        .limit(1)

      // If any unfinished match exists, skip this pool
      if (unfinished) continue

      // All matches in scope are finished — close this pool
      await db
        .update(pool)
        .set({ status: 'closed', isOpen: false, updatedAt: new Date() })
        .where(eq(pool.id, p.id))

      closedCount++

      console.log(`[ClosePoolsJob] Closed pool "${p.name}" (${p.id})`)

      // Notify winners
      await notifyWinnersForPool(p.id, p.name, p.entryFee, p.coupon?.discountPercent ?? 0)
    } catch (err) {
      console.error(`[ClosePoolsJob] Failed to process pool ${p.id}:`, err)
    }
  }

  if (closedCount > 0) {
    console.log(`[ClosePoolsJob] Done. Closed ${closedCount} pool(s).`)
  }
}

async function notifyWinnersForPool(
  poolId: string,
  poolName: string,
  entryFee: number,
  discountPercent: number,
) {
  const ranking = await getPoolRanking(poolId, '')
  const winnerEntries = ranking.filter((r) => r.position === 1)
  if (winnerEntries.length === 0) return

  const [memberCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(poolMember)
    .where(eq(poolMember.poolId, poolId))

  const effectiveRate = getEffectiveFeeRate(discountPercent)
  const prizeTotal = Math.floor(entryFee * (memberCount?.count ?? 0) * (1 - effectiveRate))
  const prizeShare = Math.floor(prizeTotal / winnerEntries.length)

  const winnersWithPhone = await Promise.all(
    winnerEntries.map(async (w) => {
      const userData = await db.query.user.findFirst({
        where: eq(user.id, w.userId),
      })
      return {
        userId: w.userId,
        name: w.name,
        phoneNumber: userData?.phoneNumber ?? null,
      }
    }),
  )

  await notifyWinners(poolName, winnersWithPhone, prizeShare)
}
