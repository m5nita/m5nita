import type { SQL } from 'drizzle-orm'
import { and, eq, gt, gte, isNotNull, isNull, lte, or } from 'drizzle-orm'
import type { ReminderData, ReminderMatch } from '../application/ports/NotificationService.port'
import { getContainer } from '../container'
import { db } from '../db/client'
import { user } from '../db/schema/auth'
import { match } from '../db/schema/match'
import { poolMember } from '../db/schema/poolMember'
import { prediction } from '../db/schema/prediction'
import type { ActivePoolInfo } from '../domain/pool/PoolRepository.port'

// In-memory dedup: "userId:poolId" — prevents duplicate reminders per user per pool per cycle.
// Grows monotonically (max ~64K entries for 64 pools x 1000 users ≈ 2MB).
// Resets on process restart, which may cause a single duplicate — acceptable tradeoff.
const sentReminders = new Set<string>()

type PendingReminder = {
  userId: string
  userName: string | null
  phoneNumber: string | null
  email: string | null
  poolId: string
  poolName: string
  matches: ReminderMatch[]
}

// Match-window conditions scoped to this pool's PoolScope (single-match takes
// priority over the matchday range when set).
function buildMatchConditions(activePool: ActivePoolInfo, now: Date, oneHourLater: Date): SQL[] {
  const conditions: SQL[] = [
    eq(match.status, 'scheduled'),
    gt(match.matchDate, now),
    lte(match.matchDate, oneHourLater),
  ]

  if (activePool.matchId != null) {
    conditions.push(eq(match.id, activePool.matchId))
    return conditions
  }

  conditions.push(eq(match.competitionId, activePool.competitionId))
  if (activePool.matchdayFrom != null) {
    conditions.push(gte(match.matchday, activePool.matchdayFrom))
  }
  if (activePool.matchdayTo != null) {
    conditions.push(lte(match.matchday, activePool.matchdayTo))
  }
  return conditions
}

// For one pool, find its upcoming matches and the members still missing a
// prediction, accumulating reminders grouped by userId+poolId. Candidates are
// reachable by Telegram (phone) or by verified email.
async function collectRemindersForPool(
  activePool: ActivePoolInfo,
  now: Date,
  oneHourLater: Date,
  pendingReminders: Map<string, PendingReminder>,
): Promise<void> {
  const matchConditions = buildMatchConditions(activePool, now, oneHourLater)

  const upcomingMatches = await db
    .select({
      id: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      matchDate: match.matchDate,
    })
    .from(match)
    .where(and(...matchConditions))

  if (upcomingMatches.length === 0) return

  for (const upcomingMatch of upcomingMatches) {
    const usersToRemind = await db
      .selectDistinctOn([poolMember.userId], {
        userId: poolMember.userId,
        name: user.name,
        phoneNumber: user.phoneNumber,
        email: user.email,
        emailVerified: user.emailVerified,
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
          or(isNotNull(user.phoneNumber), and(eq(user.emailVerified, true), isNotNull(user.email))),
        ),
      )

    const minutesUntil = Math.round((upcomingMatch.matchDate.getTime() - now.getTime()) / 60_000)

    for (const u of usersToRemind) {
      const groupKey = `${u.userId}:${activePool.id}`
      let entry = pendingReminders.get(groupKey)
      if (!entry) {
        entry = {
          userId: u.userId,
          userName: u.name,
          phoneNumber: u.phoneNumber,
          email: u.emailVerified && u.email ? u.email : null,
          poolId: activePool.id,
          poolName: activePool.name,
          matches: [],
        }
        pendingReminders.set(groupKey, entry)
      }
      entry.matches.push({
        homeTeam: upcomingMatch.homeTeam,
        awayTeam: upcomingMatch.awayTeam,
        minutesUntil,
      })
    }
  }
}

// Build channel-agnostic reminder data for the notification service, skipping
// anything already sent this cycle. Channel selection happens in the adapter.
function buildRemindersToSend(pendingReminders: Map<string, PendingReminder>): ReminderData[] {
  const remindersToSend: ReminderData[] = []

  for (const [groupKey, reminder] of pendingReminders) {
    if (sentReminders.has(groupKey)) continue

    remindersToSend.push({
      userName: reminder.userName,
      phoneNumber: reminder.phoneNumber,
      email: reminder.email,
      poolName: reminder.poolName,
      poolId: reminder.poolId,
      matches: reminder.matches,
    })

    sentReminders.add(groupKey)
  }

  return remindersToSend
}

export async function sendPredictionReminders(): Promise<void> {
  const { poolRepo, notificationService, clock } = getContainer()

  const now = clock.now()
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000)

  const activePools = await poolRepo.findAllActive()
  if (activePools.length === 0) return

  // Collect reminders grouped by userId+poolId to send one message per pool
  const pendingReminders = new Map<string, PendingReminder>()

  for (const activePool of activePools) {
    await collectRemindersForPool(activePool, now, oneHourLater, pendingReminders)
  }

  const remindersToSend = buildRemindersToSend(pendingReminders)

  if (remindersToSend.length > 0) {
    await notificationService.sendPredictionReminders(remindersToSend)
  }
}
