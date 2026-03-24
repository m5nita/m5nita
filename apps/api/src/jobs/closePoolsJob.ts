import { eq, ne, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { user } from '../db/schema/auth'
import { match } from '../db/schema/match'
import { pool } from '../db/schema/pool'
import { poolMember } from '../db/schema/poolMember'
import { notifyWinners } from '../lib/telegram'
import { getEffectiveFeeRate } from '../services/coupon'
import { getPoolRanking } from '../services/ranking'

export async function closePoolsIfAllMatchesFinished(): Promise<void> {
  // 1. Check if ANY match is not finished (single cheap query)
  const [unfinished] = await db
    .select({ id: match.id })
    .from(match)
    .where(ne(match.status, 'finished'))
    .limit(1)

  if (unfinished) return

  // 2. Find all active pools to close (batch)
  const activePools = await db.query.pool.findMany({
    where: eq(pool.status, 'active'),
    with: { coupon: true },
  })

  if (activePools.length === 0) return

  console.log(
    `[ClosePoolsJob] All matches finished. Closing ${activePools.length} active pool(s)...`,
  )

  // 3. Bulk update all active pools to closed
  await db
    .update(pool)
    .set({ status: 'closed', isOpen: false, updatedAt: new Date() })
    .where(eq(pool.status, 'active'))

  // 4. Notify winners for each pool (sequentially to avoid overload)
  for (const p of activePools) {
    try {
      await notifyWinnersForPool(p.id, p.name, p.entryFee, p.coupon?.discountPercent ?? 0)
    } catch (err) {
      console.error(`[ClosePoolsJob] Failed to notify winners for pool ${p.id}:`, err)
    }
  }

  console.log(`[ClosePoolsJob] Done. Closed ${activePools.length} pool(s).`)
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
