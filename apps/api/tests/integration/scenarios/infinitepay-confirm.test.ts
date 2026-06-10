import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp } from '../support/app'
import { signInViaPhoneOtp } from '../support/auth-helper'
import { workerConnectionString } from '../support/db-utils'
import { makeCompetition } from '../support/fixtures/makeCompetition'
import { makePool } from '../support/fixtures/makePool'
import { deliverInfinitePayPaidWebhook } from '../support/payments'
import { infinitePayStub } from '../support/stubs'

// POST /api/payments/infinitepay/confirm is the fallback the client calls when
// the webhook is late: it re-checks the payment status server-side and grants
// paid membership. It had no test despite deciding whether a user becomes a
// paying member.
describe('US5 — InfinitePay confirm fallback', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  it('marks the payment completed, activates the pool and creates membership when payment_check says paid', async () => {
    const { app } = buildTestApp()
    const comp = await makeCompetition(sql)
    const admin = await signInViaPhoneOtp(app, { phoneNumber: '+5511966660031' })
    const pool = await makePool({ admin, competitionId: comp.id, entryFeeCentavos: 10_000 })

    // Webhook never arrives; the gateway reports the order as paid when polled.
    infinitePayStub.setStatus(pool.paymentId, 'paid')

    const resp = await admin.fetch('/api/payments/infinitepay/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderNsu: pool.paymentId }),
    })
    expect(resp.status).toBe(200)

    const payments = await sql`SELECT status FROM "payment" WHERE id = ${pool.paymentId}`
    expect(payments).toMatchObject([{ status: 'completed' }])
    const poolRows = await sql`SELECT status FROM "pool" WHERE id = ${pool.id}`
    expect(poolRows).toMatchObject([{ status: 'active' }])
    const members = await sql`SELECT user_id FROM "pool_member" WHERE pool_id = ${pool.id}`
    expect(members).toHaveLength(1)
  })

  it('is idempotent with a late webhook arriving after confirm (no duplicate member/payment)', async () => {
    const { app } = buildTestApp()
    const comp = await makeCompetition(sql)
    const admin = await signInViaPhoneOtp(app, { phoneNumber: '+5511966660041' })
    const pool = await makePool({ admin, competitionId: comp.id, entryFeeCentavos: 10_000 })

    infinitePayStub.setStatus(pool.paymentId, 'paid')
    const confirmResp = await admin.fetch('/api/payments/infinitepay/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderNsu: pool.paymentId }),
    })
    expect(confirmResp.status).toBe(200)

    // The webhook lands afterwards — must be a no-op.
    const webhookResp = await deliverInfinitePayPaidWebhook(app, pool.paymentId)
    expect(webhookResp.status).toBe(200)

    const members = await sql`SELECT user_id FROM "pool_member" WHERE pool_id = ${pool.id}`
    expect(members).toHaveLength(1)
    const payments = await sql`SELECT id, status FROM "payment" WHERE pool_id = ${pool.id}`
    expect(payments).toMatchObject([{ id: pool.paymentId, status: 'completed' }])
  })

  it('returns 404 for an order with no local payment', async () => {
    const { app } = buildTestApp()
    await makeCompetition(sql)
    const admin = await signInViaPhoneOtp(app, { phoneNumber: '+5511966660051' })

    const resp = await admin.fetch('/api/payments/infinitepay/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderNsu: '00000000-0000-4000-8000-000000000999' }),
    })
    expect(resp.status).toBe(404)
  })

  it('requires authentication', async () => {
    const { app } = buildTestApp()
    const comp = await makeCompetition(sql)
    const admin = await signInViaPhoneOtp(app, { phoneNumber: '+5511966660061' })
    const pool = await makePool({ admin, competitionId: comp.id, entryFeeCentavos: 10_000 })

    const resp = await app.fetch(
      new Request('http://localhost/api/payments/infinitepay/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: 'http://localhost:5173' },
        body: JSON.stringify({ orderNsu: pool.paymentId }),
      }),
    )
    expect(resp.status).toBe(401)
  })
})
