import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getContainer } from '../../../src/container'
import { calcPointsForMatch } from '../../../src/jobs/calcPoints'
import { checkAndClosePools } from '../../../src/jobs/closePoolsJob'
import { decryptPixKey, isEncryptedPixKey } from '../../../src/lib/pixKeyCrypto'
import { buildTestApp } from '../support/app'
import { signInViaPhoneOtp, type TestUser } from '../support/auth-helper'
import { workerConnectionString } from '../support/db-utils'
import { makeCompetition } from '../support/fixtures/makeCompetition'
import { finishMatch, makeMatch } from '../support/fixtures/makeMatch'
import { makePool } from '../support/fixtures/makePool'
import { deliverInfinitePayPaidWebhook } from '../support/payments'
import { telegramStub } from '../support/stubs'

type Seeded = {
  app: Awaited<ReturnType<typeof buildTestApp>>['app']
  clock: Awaited<ReturnType<typeof buildTestApp>>['clock']
  admin: TestUser
  player: TestUser
  poolId: string
  exactPredictor: TestUser
  loser: TestUser
  compId: string
}

describe('US4 — prize withdrawal', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  async function seedClosedPoolWithWinner(seq: number): Promise<Seeded> {
    const baseline = new Date('2026-06-15T12:00:00.000Z')
    const { app, clock } = buildTestApp({ initialNow: baseline })

    const comp = await makeCompetition(sql)
    const admin = await signInViaPhoneOtp(app, { phoneNumber: `+551199900${seq}001` })
    const pool = await makePool({
      admin,
      competitionId: comp.id,
      entryFeeCentavos: 10_000,
      matchdayFrom: 1,
      matchdayTo: 1,
    })
    await deliverInfinitePayPaidWebhook(app, pool.paymentId)

    const exactPredictor = await signInViaPhoneOtp(app, {
      phoneNumber: `+551199900${seq}002`,
    })
    const joinA = await exactPredictor.fetch(`/api/pools/${pool.id}/join`, { method: 'POST' })
    const joinABody = (await joinA.json()) as { payment: { id: string } }
    await deliverInfinitePayPaidWebhook(app, joinABody.payment.id)

    const loser = await signInViaPhoneOtp(app, {
      phoneNumber: `+551199900${seq}003`,
    })
    const joinB = await loser.fetch(`/api/pools/${pool.id}/join`, { method: 'POST' })
    const joinBBody = (await joinB.json()) as { payment: { id: string } }
    await deliverInfinitePayPaidWebhook(app, joinBBody.payment.id)

    const match = await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: new Date(baseline.getTime() + 60 * 60 * 1000),
      matchday: 1,
    })
    // Exact prediction wins; other predictions miss.
    await exactPredictor.fetch(`/api/pools/${pool.id}/predictions/${match.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 2, awayScore: 1 }),
    })
    await loser.fetch(`/api/pools/${pool.id}/predictions/${match.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 0, awayScore: 0 }),
    })
    // Admin forgets to predict entirely (totalPoints = 0).

    clock.setNow(new Date(baseline.getTime() + 3 * 60 * 60 * 1000))
    await finishMatch(sql, match.id, 2, 1)
    await calcPointsForMatch(match.id)
    await checkAndClosePools()

    // Reset Telegram captures so the withdrawal-specific assertions are clean.
    telegramStub.reset()

    return {
      app,
      clock,
      admin,
      player: exactPredictor,
      exactPredictor,
      loser,
      poolId: pool.id,
      compId: comp.id,
    }
  }

  it('scenario 1 — winner submits PIX: row created, key encrypted at rest, admin notified', async () => {
    const { exactPredictor, poolId } = await seedClosedPoolWithWinner(1)

    const rawPix = 'alice-prize@test.local'
    const resp = await exactPredictor.fetch(`/api/pools/${poolId}/prize/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pixKeyType: 'email', pixKey: rawPix }),
    })
    expect(resp.status).toBe(201)

    const rows = await sql<
      { id: string; status: string; amount: number; pix_key: string; pix_key_type: string }[]
    >`
      SELECT id, status, amount, pix_key, pix_key_type FROM "prize_withdrawal"
      WHERE pool_id = ${poolId} AND user_id = ${exactPredictor.id}
    `
    expect(rows).toHaveLength(1)
    const stored = rows[0]
    if (!stored) throw new Error('prize_withdrawal row not found')

    expect(stored.status).toBe('pending')
    expect(stored.pix_key_type).toBe('email')
    // Raw value must NEVER land on disk.
    expect(stored.pix_key).not.toBe(rawPix)
    expect(isEncryptedPixKey(stored.pix_key)).toBe(true)
    expect(decryptPixKey(stored.pix_key)).toBe(rawPix)

    // Raw PIX not found anywhere in prize_withdrawal rows for this pool.
    const rawLeak = await sql`
      SELECT id FROM "prize_withdrawal" WHERE pool_id = ${poolId} AND pix_key = ${rawPix}
    `
    expect(rawLeak).toHaveLength(0)

    // Admin notification carries the raw PIX (for admin use) via Telegram —
    // the stub captured exactly one outbound sendMessage, to the admin chat.
    const sends = telegramStub.sends()
    expect(sends).toHaveLength(1)
    expect(sends[0]?.text).toContain('retirada')
  })

  it('scenario 2 — admin marks the withdrawal paid: status transitions to completed', async () => {
    const { exactPredictor, poolId } = await seedClosedPoolWithWinner(2)

    const requestResp = await exactPredictor.fetch(`/api/pools/${poolId}/prize/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pixKeyType: 'cpf', pixKey: '12345678901' }),
    })
    expect(requestResp.status).toBe(201)
    const requestBody = (await requestResp.json()) as { id: string }

    // Simulate the admin pressing the "mark as paid" button in Telegram.
    await getContainer().markWithdrawalPaidUseCase.execute({ withdrawalId: requestBody.id })

    const rows = await sql`
      SELECT status FROM "prize_withdrawal" WHERE id = ${requestBody.id}
    `
    expect(rows).toMatchObject([{ status: 'completed' }])

    // The underlying prize-payment row transitions too.
    const paymentRows = await sql`
      SELECT status, type FROM "payment" WHERE pool_id = ${poolId} AND type = 'prize'
    `
    expect(paymentRows).toMatchObject([{ status: 'completed', type: 'prize' }])
  })

  it('scenario 3 — non-winner attempt is rejected; no prize_withdrawal row created', async () => {
    const { loser, poolId } = await seedClosedPoolWithWinner(3)

    const resp = await loser.fetch(`/api/pools/${poolId}/prize/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pixKeyType: 'email', pixKey: 'loser@test.local' }),
    })
    expect(resp.status).toBe(403)
    const body = (await resp.json()) as { error: string }
    expect(body.error).toBe('NOT_A_WINNER')

    const rows = await sql`
      SELECT id FROM "prize_withdrawal" WHERE pool_id = ${poolId}
    `
    expect(rows).toHaveLength(0)

    // No admin notification fired for the rejected attempt.
    expect(telegramStub.sends()).toHaveLength(0)
  })
})
