import { and, eq, gt, gte, isNotNull, isNull, lte } from 'drizzle-orm'
import type { ReminderData } from '../application/ports/NotificationService.port'
import { getContainer } from '../container'
import { db } from '../db/client'
import { user } from '../db/schema/auth'
import { match } from '../db/schema/match'
import { poolMember } from '../db/schema/poolMember'
import { prediction } from '../db/schema/prediction'
import { findChatIdByPhone } from '../lib/telegram'

// In-memory dedup: "userId:poolId" — prevents duplicate reminders per user per pool per cycle.
// Grows monotonically (max ~64K entries for 64 pools x 1000 users ≈ 2MB).
// Resets on process restart, which may cause a single duplicate — acceptable tradeoff.
const sentReminders = new Set<string>()

export async function sendPredictionReminders(): Promise<void> {
  const { poolRepo, notificationService } = getContainer()

  const now = new Date()
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000)

  const activePools = await poolRepo.findAllActive()

  if (activePools.length === 0) return

  // Collect reminders grouped by userId+poolId to send one message per pool
  const pendingReminders = new Map<
    string,
    {
      userId: string
      phoneNumber: string
      poolId: string
      poolName: string
      matches: { homeTeam: string; awayTeam: string; minutesUntil: number }[]
    }
  >()

  for (const activePool of activePools) {
    // Find upcoming matches scoped to this pool's competition and matchday range
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

      const minutesUntil = Math.round((upcomingMatch.matchDate.getTime() - now.getTime()) / 60_000)

      for (const u of usersToRemind) {
        const groupKey = `${u.userId}:${activePool.id}`

        if (!pendingReminders.has(groupKey)) {
          pendingReminders.set(groupKey, {
            userId: u.userId,
            phoneNumber: u.phoneNumber as string,
            poolId: activePool.id,
            poolName: activePool.name,
            matches: [],
          })
        }

        pendingReminders.get(groupKey)!.matches.push({
          homeTeam: upcomingMatch.homeTeam,
          awayTeam: upcomingMatch.awayTeam,
          minutesUntil,
        })
      }
    }
  }

  // Resolve chat IDs and build reminder data for notification service
  const remindersToSend: ReminderData[] = []

  for (const [groupKey, reminder] of pendingReminders) {
    if (sentReminders.has(groupKey)) continue

    const chatId = await findChatIdByPhone(reminder.phoneNumber)
    if (!chatId) continue

    remindersToSend.push({
      chatId: Number(chatId),
      poolName: reminder.poolName,
      poolId: reminder.poolId,
      matches: reminder.matches,
    })

    sentReminders.add(groupKey)
  }

  if (remindersToSend.length > 0) {
    await notificationService.sendPredictionReminders(remindersToSend)
  }
}
