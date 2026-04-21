import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp } from '../support/app'
import { signInViaPhoneOtp } from '../support/auth-helper'
import { workerConnectionString } from '../support/db-utils'
import { makeCompetition } from '../support/fixtures/makeCompetition'
import { makeCoupon } from '../support/fixtures/makeCoupon'
import { infinitePayStub } from '../support/stubs'

describe('pool creation — gateway failure side-effects', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  it('leaves no orphan pool when InfinitePay /checkout/links returns 502', async () => {
    const { app } = buildTestApp()
    const comp = await makeCompetition(sql)
    const admin = await signInViaPhoneOtp(app, { phoneNumber: '+5511955550001' })

    infinitePayStub.queueCheckoutFailure({ status: 502 })

    const resp = await admin.fetch('/api/pools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Pool That Should Not Persist',
        entryFee: 10_000,
        competitionId: comp.id,
      }),
    })
    expect(resp.status).toBeGreaterThanOrEqual(500)

    const poolRows = await sql`SELECT id, name FROM "pool" WHERE owner_id = ${admin.id}`
    expect(poolRows).toHaveLength(0)

    const paymentRows = await sql`SELECT id FROM "payment" WHERE user_id = ${admin.id}`
    expect(paymentRows).toHaveLength(0)
  })

  it('does not increment coupon usage when gateway fails', async () => {
    const { app } = buildTestApp()
    const comp = await makeCompetition(sql)
    const admin = await signInViaPhoneOtp(app, { phoneNumber: '+5511955550011' })
    const coupon = await makeCoupon(sql, { discountPercent: 50 })

    infinitePayStub.queueCheckoutFailure({ status: 502 })

    const resp = await admin.fetch('/api/pools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Pool With Coupon',
        entryFee: 10_000,
        competitionId: comp.id,
        couponCode: coupon.code,
      }),
    })
    expect(resp.status).toBeGreaterThanOrEqual(500)

    const couponRows = await sql`SELECT use_count FROM "coupon" WHERE id = ${coupon.id}`
    expect(couponRows).toMatchObject([{ use_count: 0 }])

    const poolRows = await sql`SELECT id FROM "pool" WHERE coupon_id = ${coupon.id}`
    expect(poolRows).toHaveLength(0)
  })

  it('allows the user to retry successfully after a transient gateway failure', async () => {
    const { app } = buildTestApp()
    const comp = await makeCompetition(sql)
    const admin = await signInViaPhoneOtp(app, { phoneNumber: '+5511955550021' })

    infinitePayStub.queueCheckoutFailure({ status: 502 })

    const firstAttempt = await admin.fetch('/api/pools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Retry Pool', entryFee: 10_000, competitionId: comp.id }),
    })
    expect(firstAttempt.status).toBeGreaterThanOrEqual(500)

    // No retry queued → the gateway now succeeds.
    const secondAttempt = await admin.fetch('/api/pools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Retry Pool', entryFee: 10_000, competitionId: comp.id }),
    })
    expect(secondAttempt.status).toBe(201)

    const poolRows = await sql`SELECT name FROM "pool" WHERE owner_id = ${admin.id}`
    expect(poolRows).toMatchObject([{ name: 'Retry Pool' }])
  })
})
