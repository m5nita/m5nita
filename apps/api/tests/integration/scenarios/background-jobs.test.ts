import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { calcPointsForMatch } from '../../../src/jobs/calcPoints'
import { checkAndClosePools } from '../../../src/jobs/closePoolsJob'
import { sendPredictionReminders } from '../../../src/jobs/reminderJob'
import { buildTestApp } from '../support/app'
import { signInViaPhoneOtp } from '../support/auth-helper'
import { workerConnectionString } from '../support/db-utils'
import { linkTelegramChat } from '../support/fixtures/linkTelegramChat'
import { makeCompetition } from '../support/fixtures/makeCompetition'
import { finishMatch, makeMatch } from '../support/fixtures/makeMatch'
import { makePool } from '../support/fixtures/makePool'
import { deliverInfinitePayPaidWebhook } from '../support/payments'
import { telegramStub } from '../support/stubs'

const BASELINE = new Date('2026-06-15T12:00:00.000Z')

describe('US6 — background jobs', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  it('scenario 1 — reminder job enqueues a Telegram message once, then dedups', async () => {
    const { app, clock } = buildTestApp({ initialNow: BASELINE })

    const comp = await makeCompetition(sql)
    const admin = await signInViaPhoneOtp(app, { phoneNumber: '+5511944440001' })
    const pool = await makePool({
      admin,
      competitionId: comp.id,
      entryFeeCentavos: 10_000,
      matchdayFrom: 1,
      matchdayTo: 1,
    })
    await deliverInfinitePayPaidWebhook(app, pool.paymentId)
    await linkTelegramChat(sql, admin.phoneNumber ?? '')

    // Match kicks off in 30 min — inside the 1-hour reminder window.
    await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: new Date(BASELINE.getTime() + 30 * 60 * 1000),
      matchday: 1,
    })

    // Admin is a paid member with no prediction yet → should be reminded.
    await sendPredictionReminders()
    expect(telegramStub.sends()).toHaveLength(1)
    expect(telegramStub.sends()[0]?.text).toContain('palpite')

    // Second invocation at the same clock — dedup set should skip.
    await sendPredictionReminders()
    expect(telegramStub.sends()).toHaveLength(1)

    // Clock unchanged — the only way to get another send is a new match
    // outside the dedup window, which is covered by the job's unit tests.
    expect(clock.now().toISOString()).toBe(BASELINE.toISOString())
  })

  it('scenario 2 — closePoolsJob closes a pool whose matches are all finished and notifies the winner', async () => {
    const { app, clock } = buildTestApp({ initialNow: BASELINE })

    const comp = await makeCompetition(sql)
    const admin = await signInViaPhoneOtp(app, { phoneNumber: '+5511944440011' })
    const pool = await makePool({
      admin,
      competitionId: comp.id,
      entryFeeCentavos: 10_000,
      matchdayFrom: 1,
      matchdayTo: 1,
    })
    await deliverInfinitePayPaidWebhook(app, pool.paymentId)
    await linkTelegramChat(sql, admin.phoneNumber ?? '')

    const player = await signInViaPhoneOtp(app, { phoneNumber: '+5511944440012' })
    const joinResp = await player.fetch(`/api/pools/${pool.id}/join`, { method: 'POST' })
    const joinBody = (await joinResp.json()) as { payment: { id: string } }
    await deliverInfinitePayPaidWebhook(app, joinBody.payment.id)

    // One match in matchday 1 — both users predict; the admin nails it.
    const match = await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: new Date(BASELINE.getTime() + 60 * 60 * 1000),
      matchday: 1,
    })
    await admin.fetch(`/api/pools/${pool.id}/predictions/${match.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 2, awayScore: 1 }),
    })
    await player.fetch(`/api/pools/${pool.id}/predictions/${match.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 0, awayScore: 0 }),
    })

    // Advance past kickoff, mark the match finished, score it.
    clock.setNow(new Date(BASELINE.getTime() + 3 * 60 * 60 * 1000))
    await finishMatch(sql, match.id, 2, 1)
    await calcPointsForMatch(match.id)

    // Baseline: no Telegram sends so far from the reminder path (telemetry
    // for this scenario lives entirely in the close-pool notification).
    telegramStub.reset()

    await checkAndClosePools()

    const poolAfter = await sql`SELECT status FROM "pool" WHERE id = ${pool.id}`
    expect(poolAfter).toMatchObject([{ status: 'closed' }])

    const winnerSends = telegramStub.sends()
    expect(winnerSends.length).toBeGreaterThanOrEqual(1)
    expect(winnerSends.some((s) => s.text.includes('Parabéns'))).toBe(true)

    // Further joins should now be impossible via the HTTP surface.
    const latecomer = await signInViaPhoneOtp(app, { phoneNumber: '+5511944440013' })
    const joinAfter = await latecomer.fetch(`/api/pools/${pool.id}/join`, { method: 'POST' })
    expect(joinAfter.status).toBeGreaterThanOrEqual(400)
  })

  it('scenario 3 — calcPointsForMatch assigns points for every prediction on a finished match', async () => {
    const { app, clock } = buildTestApp({ initialNow: BASELINE })

    const comp = await makeCompetition(sql)
    const admin = await signInViaPhoneOtp(app, { phoneNumber: '+5511944440021' })
    const pool = await makePool({ admin, competitionId: comp.id, entryFeeCentavos: 10_000 })
    await deliverInfinitePayPaidWebhook(app, pool.paymentId)

    const player = await signInViaPhoneOtp(app, { phoneNumber: '+5511944440022' })
    const joinResp = await player.fetch(`/api/pools/${pool.id}/join`, { method: 'POST' })
    const joinBody = (await joinResp.json()) as { payment: { id: string } }
    await deliverInfinitePayPaidWebhook(app, joinBody.payment.id)

    const match = await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: new Date(BASELINE.getTime() + 60 * 60 * 1000),
    })

    await admin.fetch(`/api/pools/${pool.id}/predictions/${match.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 2, awayScore: 1 }), // exact → 10
    })
    await player.fetch(`/api/pools/${pool.id}/predictions/${match.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 1, awayScore: 0 }), // winner+diff(1) → 7
    })

    clock.setNow(new Date(BASELINE.getTime() + 3 * 60 * 60 * 1000))
    await finishMatch(sql, match.id, 2, 1)

    await calcPointsForMatch(match.id)

    const rows = await sql`
      SELECT user_id, points FROM "prediction" WHERE match_id = ${match.id}
      ORDER BY points DESC
    `
    expect(rows).toMatchObject([
      { user_id: admin.id, points: 10 },
      { user_id: player.id, points: 7 },
    ])

    // Re-running the job must be idempotent (same points, no error thrown).
    await calcPointsForMatch(match.id)
    const rowsAgain = await sql`
      SELECT points FROM "prediction" WHERE match_id = ${match.id} ORDER BY points DESC
    `
    expect(rowsAgain).toMatchObject([{ points: 10 }, { points: 7 }])
  })
})
