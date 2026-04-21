import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp } from '../support/app'
import { signInViaPhoneOtp } from '../support/auth-helper'
import { workerConnectionString } from '../support/db-utils'
import { makeCompetition } from '../support/fixtures/makeCompetition'
import { makePool } from '../support/fixtures/makePool'
import { deliverInfinitePayFailedWebhook, deliverInfinitePayPaidWebhook } from '../support/payments'
import { infinitePayStub } from '../support/stubs'

describe('US5 — InfinitePay gateway edge cases', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  it('scenario 1 — duplicated paid webhook is idempotent: no duplicate member or payment rows', async () => {
    const { app } = buildTestApp()
    const comp = await makeCompetition(sql)
    const admin = await signInViaPhoneOtp(app, { phoneNumber: '+5511966660001' })
    const pool = await makePool({ admin, competitionId: comp.id, entryFeeCentavos: 10_000 })

    // First delivery activates the pool and adds the admin as a member.
    const first = await deliverInfinitePayPaidWebhook(app, pool.paymentId)
    expect(first.status).toBe(200)

    const membersAfterFirst = await sql`
      SELECT user_id FROM "pool_member" WHERE pool_id = ${pool.id}
    `
    expect(membersAfterFirst).toHaveLength(1)

    // Second delivery of the exact same event must be a no-op.
    const second = await deliverInfinitePayPaidWebhook(app, pool.paymentId)
    expect(second.status).toBe(200)

    const membersAfterSecond = await sql`
      SELECT user_id FROM "pool_member" WHERE pool_id = ${pool.id}
    `
    expect(membersAfterSecond).toHaveLength(1)

    const paymentsFinal = await sql`
      SELECT id, status FROM "payment" WHERE pool_id = ${pool.id}
    `
    expect(paymentsFinal).toHaveLength(1)
    expect(paymentsFinal).toMatchObject([{ id: pool.paymentId, status: 'completed' }])

    // A third delivery after the payment is already completed stays a no-op.
    const third = await deliverInfinitePayPaidWebhook(app, pool.paymentId)
    expect(third.status).toBe(200)
    const membersFinal = await sql`SELECT user_id FROM "pool_member" WHERE pool_id = ${pool.id}`
    expect(membersFinal).toHaveLength(1)
  })

  it('scenario 2 — rejected-payment webhook marks payment as expired without creating a member', async () => {
    const { app } = buildTestApp()
    const comp = await makeCompetition(sql)
    const admin = await signInViaPhoneOtp(app, { phoneNumber: '+5511966660011' })
    const pool = await makePool({ admin, competitionId: comp.id, entryFeeCentavos: 10_000 })

    const resp = await deliverInfinitePayFailedWebhook(app, pool.paymentId)
    expect(resp.status).toBe(200)

    const paymentRows = await sql`
      SELECT status FROM "payment" WHERE id = ${pool.paymentId}
    `
    expect(paymentRows).toMatchObject([{ status: 'expired' }])

    const members = await sql`SELECT user_id FROM "pool_member" WHERE pool_id = ${pool.id}`
    expect(members).toHaveLength(0)

    // Pool stays in its initial 'pending' state — payment never confirmed.
    const poolRows = await sql`SELECT status FROM "pool" WHERE id = ${pool.id}`
    expect(poolRows).toMatchObject([{ status: 'pending' }])
  })

  it('scenario 3 — only the active gateway (InfinitePay) receives outbound traffic', async () => {
    // MSW's `onUnhandledRequest: 'error'` (configured in per-worker-setup)
    // guarantees the suite fails loudly if any MercadoPago/Stripe URL is hit.
    // A full happy-path run through here is the strongest proof that the
    // configured gateway is the only one called.

    const { app } = buildTestApp()
    const comp = await makeCompetition(sql)
    const admin = await signInViaPhoneOtp(app, { phoneNumber: '+5511966660021' })
    const pool = await makePool({ admin, competitionId: comp.id, entryFeeCentavos: 10_000 })
    await deliverInfinitePayPaidWebhook(app, pool.paymentId)

    const infinitePayCalls = infinitePayStub.callLog()
    expect(infinitePayCalls.length).toBeGreaterThan(0)
    expect(infinitePayCalls.every((c) => c.provider === 'infinitepay')).toBe(true)

    // Sanity: the InfinitePay adapter actually reached the stub for both the
    // checkout-link creation AND the webhook's payment_check callback.
    expect(infinitePayCalls.some((c) => c.summary.includes('/checkout/links'))).toBe(true)
    expect(infinitePayCalls.some((c) => c.summary.includes('/payment_check'))).toBe(true)
  })
})
