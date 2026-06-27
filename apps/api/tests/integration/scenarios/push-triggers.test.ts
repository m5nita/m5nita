import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotificationService } from '../../../src/application/ports/NotificationService.port'
import { resetContainer } from '../../../src/container'
import { sendPredictionReminders } from '../../../src/jobs/reminderJob'
import { buildTestApp } from '../support/app'
import { workerConnectionString } from '../support/db-utils'
import { makeCompetition } from '../support/fixtures/makeCompetition'
import { makeMatch } from '../support/fixtures/makeMatch'
import { TestClock } from '../support/TestClock'

/**
 * Web Push — trigger wiring against real Postgres.
 * - Reminder eligibility (D8): a push-only member (no phone, no verified email)
 *   becomes eligible for kickoff reminders via the push-subscription EXISTS branch.
 * - "Pontos conquistados" (FR-015/017): a finished match produces one dedupe row
 *   per (user, pool, match), at-most-once across re-runs.
 */
describe('Web Push — triggers', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  async function makeUser(
    id: string,
    opts: { email?: string | null; emailVerified?: boolean; phone?: string | null } = {},
  ): Promise<string> {
    await sql`
      INSERT INTO "user" (id, name, email, email_verified, phone_number)
      VALUES (${id}, ${`User ${id}`}, ${opts.email ?? null}, ${opts.emailVerified ?? false}, ${opts.phone ?? null})
    `
    return id
  }

  async function addPushSubscription(userId: string, endpoint: string): Promise<void> {
    await sql`
      INSERT INTO push_subscription (id, user_id, endpoint, p256dh, auth)
      VALUES (${crypto.randomUUID()}, ${userId}, ${endpoint}, 'p256dh', 'auth')
    `
  }

  async function makePoolRow(opts: {
    competitionId: string
    ownerId: string
    matchId?: string | null
  }): Promise<string> {
    const id = crypto.randomUUID()
    await sql`
      INSERT INTO "pool"
        (id, name, entry_fee, owner_id, invite_code, competition_id, match_id, status, is_open)
      VALUES
        (${id}, ${`Pool ${id.slice(0, 4)}`}, 10000, ${opts.ownerId}, ${`INV${id.slice(0, 8)}`},
         ${opts.competitionId}, ${opts.matchId ?? null}, 'active', true)
    `
    return id
  }

  async function addMember(poolId: string, userId: string): Promise<void> {
    const paymentId = crypto.randomUUID()
    await sql`
      INSERT INTO payment (id, user_id, pool_id, amount, platform_fee, type, status)
      VALUES (${paymentId}, ${userId}, ${poolId}, 10000, 1000, 'pool_entry', 'paid')
    `
    await sql`
      INSERT INTO pool_member (id, pool_id, user_id, payment_id)
      VALUES (${crypto.randomUUID()}, ${poolId}, ${userId}, ${paymentId})
    `
  }

  async function addPrediction(
    userId: string,
    poolId: string,
    matchId: string,
    points: number,
  ): Promise<void> {
    await sql`
      INSERT INTO prediction (id, user_id, pool_id, match_id, home_score, away_score, points)
      VALUES (${crypto.randomUUID()}, ${userId}, ${poolId}, ${matchId}, 1, 0, ${points})
    `
  }

  it('includes a push-only member (no phone, no verified email) in kickoff reminders', async () => {
    const reminderSpy = vi.fn(async () => {})
    const notificationService = {
      sendPredictionReminders: reminderSpy,
      notifyWinners: vi.fn(async () => {}),
      notifyMatchPoints: vi.fn(async () => {}),
      notifyAdminWithdrawalRequest: vi.fn(async () => {}),
    } as unknown as NotificationService
    resetContainer({ notificationService, clock: new TestClock('2026-06-20T12:00:00.000Z') })

    const comp = await makeCompetition(sql)
    const pushUser = await makeUser('push-only-1', {
      email: 'nope@example.com',
      emailVerified: false,
      phone: null,
    })
    await addPushSubscription(pushUser, 'https://push.example/only')
    const poolId = await makePoolRow({ competitionId: comp.id, ownerId: pushUser })
    await addMember(poolId, pushUser)
    // Upcoming match within the 1h reminder window, no prediction submitted.
    await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: new Date('2026-06-20T12:30:00.000Z'),
      status: 'scheduled',
      matchday: 1,
    })

    await sendPredictionReminders()

    expect(reminderSpy).toHaveBeenCalledTimes(1)
    const reminders = reminderSpy.mock.calls[0]?.[0] as Array<{ userId: string }>
    expect(reminders.some((r) => r.userId === pushUser)).toBe(true)

    resetContainer()
  })

  it('records one pontos notification per (user, pool, match), at-most-once', async () => {
    const { container } = buildTestApp()
    const comp = await makeCompetition(sql)
    const match = await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: new Date('2026-06-20T18:00:00.000Z'),
      status: 'finished',
      matchday: 1,
      homeScore: 2,
      awayScore: 1,
    })
    const owner = await makeUser('owner-pts')
    const better = await makeUser('better-pts')
    const poolId = await makePoolRow({ competitionId: comp.id, ownerId: owner, matchId: match.id })
    await addPrediction(owner, poolId, match.id, 10)
    await addPrediction(better, poolId, match.id, 1)

    await container.notifyMatchPointsUseCase.execute(match.id)

    const after = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM match_points_notified WHERE match_id = ${match.id}
    `
    expect(after[0]?.n).toBe(2)

    // Re-run (re-sync / restart): no duplicate notifications.
    await container.notifyMatchPointsUseCase.execute(match.id)
    const afterRerun = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM match_points_notified WHERE match_id = ${match.id}
    `
    expect(afterRerun[0]?.n).toBe(2)
  })
})
