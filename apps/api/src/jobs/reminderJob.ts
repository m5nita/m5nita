import { and, eq, gt, gte, isNotNull, isNull, lte } from 'drizzle-orm'
import { db } from '../db/client'
import { user } from '../db/schema/auth'
import { match } from '../db/schema/match'
import { pool } from '../db/schema/pool'
import { poolMember } from '../db/schema/poolMember'
import { prediction } from '../db/schema/prediction'
import { bot, findChatIdByPhone } from '../lib/telegram'

// In-memory dedup: "userId:matchId:poolId" — prevents duplicate reminders per user per match per pool.
// Grows monotonically (max ~64K entries for 64 matches x 1000 users ≈ 2MB).
// Resets on process restart, which may cause a single duplicate — acceptable tradeoff.
const sentReminders = new Set<string>()

export async function sendPredictionReminders(): Promise<void> {
  const now = new Date()
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000)

  // 1. Find all active pools with their competition scope
  const activePools = await db.query.pool.findMany({
    where: eq(pool.status, 'active'),
  })

  if (activePools.length === 0) return

  for (const activePool of activePools) {
    // 2. Find upcoming matches scoped to this pool's competition and matchday range
    const matchConditions = [
      eq(match.competitionId, activePool.competitionId),
      eq(match.status, 'scheduled'),
      gt(match.matchDate, now),
      lte(match.matchDate, oneHourLater),
    ]

    if (activePool.matchdayFrom != null) {
      matchConditions.push(gte(match.matchday, activePool.matchdayFrom))
    }
    if (activePool.matchdayTo != null) {
      matchConditions.push(lte(match.matchday, activePool.matchdayTo))
    }

    const upcomingMatches = await db
      .select({
        id: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        matchDate: match.matchDate,
      })
      .from(match)
      .where(and(...matchConditions))

    if (upcomingMatches.length === 0) continue

    for (const upcomingMatch of upcomingMatches) {
      // Find pool members without predictions for this match in this pool.
      // Intentional N+1 on findChatIdByPhone — acceptable at expected scale (~hundreds of users).
      // See research.md R-005 for rationale.
      const usersToRemind = await db
        .selectDistinctOn([poolMember.userId], {
          userId: poolMember.userId,
          phoneNumber: user.phoneNumber,
        })
        .from(poolMember)
        .innerJoin(user, eq(user.id, poolMember.userId))
        .leftJoin(
          prediction,
          and(
            eq(prediction.userId, poolMember.userId),
            eq(prediction.poolId, activePool.id),
            eq(prediction.matchId, upcomingMatch.id),
          ),
        )
        .where(
          and(
            eq(poolMember.poolId, activePool.id),
            isNull(prediction.id),
            isNotNull(user.phoneNumber),
          ),
        )

      for (const u of usersToRemind) {
        const key = `${u.userId}:${upcomingMatch.id}:${activePool.id}`
        if (sentReminders.has(key)) continue

        const chatId = await findChatIdByPhone(u.phoneNumber as string)
        if (!chatId) continue

        const minutesUntil = Math.round(
          (upcomingMatch.matchDate.getTime() - now.getTime()) / 60_000,
        )
        const message = `Jogo em ${minutesUntil} min!\n\n*${upcomingMatch.homeTeam} x ${upcomingMatch.awayTeam}*\n\nVoce ainda nao fez seu palpite. Acesse o app agora!`

        try {
          await bot.api.sendMessage(Number(chatId), message, { parse_mode: 'Markdown' })
          sentReminders.add(key)
        } catch (err) {
          console.error(`[Reminder] Failed to send to chatId ${chatId}:`, err)
        }
      }
    }
  }
}
