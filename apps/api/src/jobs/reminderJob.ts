import { and, eq, gt, isNotNull, isNull, lte } from 'drizzle-orm'
import { db } from '../db/client'
import { user } from '../db/schema/auth'
import { match } from '../db/schema/match'
import { poolMember } from '../db/schema/poolMember'
import { prediction } from '../db/schema/prediction'
import { bot, findChatIdByPhone } from '../lib/telegram'

// In-memory dedup: "userId:matchId" — prevents duplicate reminders per user per match.
// Grows monotonically (max ~64K entries for 64 matches x 1000 users ≈ 2MB).
// Resets on process restart, which may cause a single duplicate — acceptable tradeoff.
const sentReminders = new Set<string>()

export async function sendPredictionReminders(): Promise<void> {
  const now = new Date()
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000)

  const upcomingMatches = await db
    .select({
      id: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      matchDate: match.matchDate,
    })
    .from(match)
    .where(
      and(
        eq(match.status, 'scheduled'),
        gt(match.matchDate, now),
        lte(match.matchDate, oneHourLater),
      ),
    )

  if (upcomingMatches.length === 0) return

  for (const upcomingMatch of upcomingMatches) {
    // Find pool members without predictions for this match (one per user via distinctOn).
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
          eq(prediction.poolId, poolMember.poolId),
          eq(prediction.matchId, upcomingMatch.id),
        ),
      )
      .where(and(isNull(prediction.id), isNotNull(user.phoneNumber)))

    for (const u of usersToRemind) {
      const key = `${u.userId}:${upcomingMatch.id}`
      if (sentReminders.has(key)) continue

      const chatId = await findChatIdByPhone(u.phoneNumber as string)
      if (!chatId) continue

      const minutesUntil = Math.round((upcomingMatch.matchDate.getTime() - now.getTime()) / 60_000)
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
