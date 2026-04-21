import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp } from '../support/app'
import { signInViaPhoneOtp } from '../support/auth-helper'
import { workerConnectionString } from '../support/db-utils'
import { makeCompetition } from '../support/fixtures/makeCompetition'
import { makePool } from '../support/fixtures/makePool'
import { deliverInfinitePayPaidWebhook } from '../support/payments'
import { infinitePayStub } from '../support/stubs'

describe('US2 — pool lifecycle', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  it('scenario 1 — admin creates pool; pool + invite + pending payment exist', async () => {
    const { app } = buildTestApp()
    const comp = await makeCompetition(sql)
    const admin = await signInViaPhoneOtp(app, { phoneNumber: '+5511922220001' })

    const pool = await makePool({
      admin,
      competitionId: comp.id,
      name: 'Bolão Teste',
      entryFeeCentavos: 10_000,
    })

    expect(pool.id).toBeTypeOf('string')
    expect(pool.inviteCode).toMatch(/^[A-Z0-9]+$/i)
    expect(pool.entryFeeCentavos).toBe(10_000)
    expect(pool.ownerId).toBe(admin.id)

    const poolRows =
      await sql`SELECT id, owner_id, invite_code, status FROM "pool" WHERE id = ${pool.id}`
    expect(poolRows).toMatchObject([
      { id: pool.id, owner_id: admin.id, invite_code: pool.inviteCode, status: 'pending' },
    ])

    const paymentRows = await sql`
      SELECT id, user_id, status, type, pool_id, amount FROM "payment" WHERE pool_id = ${pool.id}
    `
    expect(paymentRows).toMatchObject([
      {
        id: pool.paymentId,
        user_id: admin.id,
        status: 'pending',
        type: 'entry',
        amount: 10_000,
      },
    ])

    expect(infinitePayStub.checkouts().some((c) => c.orderNsu === pool.paymentId)).toBe(true)
  })

  it('scenario 2 — full pay flow: admin + 2nd user become paid members, prize pool reflects 5% fee', async () => {
    const { app } = buildTestApp()
    const comp = await makeCompetition(sql)

    const admin = await signInViaPhoneOtp(app, { phoneNumber: '+5511922220011' })
    const entryFee = 10_000
    const pool = await makePool({ admin, competitionId: comp.id, entryFeeCentavos: entryFee })

    const adminWebhook = await deliverInfinitePayPaidWebhook(app, pool.paymentId)
    expect(adminWebhook.status).toBe(200)

    const poolAfterAdminPays = await sql`SELECT status FROM "pool" WHERE id = ${pool.id}`
    expect(poolAfterAdminPays).toMatchObject([{ status: 'active' }])

    const membersAfterAdmin = await sql`
      SELECT user_id FROM "pool_member" WHERE pool_id = ${pool.id} ORDER BY joined_at
    `
    expect(membersAfterAdmin).toMatchObject([{ user_id: admin.id }])

    const player = await signInViaPhoneOtp(app, { phoneNumber: '+5511922220012' })
    const joinResp = await player.fetch(`/api/pools/${pool.id}/join`, { method: 'POST' })
    expect(joinResp.status).toBe(201)
    const joinBody = (await joinResp.json()) as { payment: { id: string; amount: number } }
    expect(joinBody.payment.amount).toBe(entryFee)

    const playerWebhook = await deliverInfinitePayPaidWebhook(app, joinBody.payment.id)
    expect(playerWebhook.status).toBe(200)

    const membersAfterPlayer = await sql`
      SELECT user_id FROM "pool_member" WHERE pool_id = ${pool.id} ORDER BY joined_at
    `
    expect(membersAfterPlayer).toMatchObject([{ user_id: admin.id }, { user_id: player.id }])

    const paymentsFinal = await sql`
      SELECT status FROM "payment" WHERE pool_id = ${pool.id}
    `
    expect(paymentsFinal).toHaveLength(2)
    expect(paymentsFinal.every((p: { status: string }) => p.status === 'completed')).toBe(true)

    const platformFeeRate = 0.05
    const expectedPrizePool = Math.floor(entryFee * 2 * (1 - platformFeeRate))
    const memberCount = membersAfterPlayer.length
    expect(memberCount * entryFee * (1 - platformFeeRate)).toBe(expectedPrizePool)
  })

  it('scenario 3 — admin closes pool; further join attempts are rejected', async () => {
    const { app } = buildTestApp()
    const comp = await makeCompetition(sql)

    const admin = await signInViaPhoneOtp(app, { phoneNumber: '+5511922220021' })
    const pool = await makePool({ admin, competitionId: comp.id, entryFeeCentavos: 10_000 })
    await deliverInfinitePayPaidWebhook(app, pool.paymentId)

    const closeResp = await admin.fetch(`/api/pools/${pool.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isOpen: false }),
    })
    expect(closeResp.status).toBe(200)

    const poolAfterClose = await sql`SELECT is_open FROM "pool" WHERE id = ${pool.id}`
    expect(poolAfterClose).toMatchObject([{ is_open: false }])

    const latecomer = await signInViaPhoneOtp(app, { phoneNumber: '+5511922220022' })
    const inviteLookup = await latecomer.fetch(`/api/pools/invite/${pool.inviteCode}`)
    expect(inviteLookup.status).toBe(409)

    const joinResp = await latecomer.fetch(`/api/pools/${pool.id}/join`, { method: 'POST' })
    expect(joinResp.status).toBeGreaterThanOrEqual(400)
    expect(joinResp.status).toBeLessThan(500)

    const members = await sql`SELECT user_id FROM "pool_member" WHERE pool_id = ${pool.id}`
    expect(members).toHaveLength(1)
  })

  it('scenario 4 — malformed webhook body is rejected and no state changes', async () => {
    const { app } = buildTestApp()
    const comp = await makeCompetition(sql)
    const admin = await signInViaPhoneOtp(app, { phoneNumber: '+5511922220031' })
    const pool = await makePool({ admin, competitionId: comp.id, entryFeeCentavos: 10_000 })

    const malformed = await app.fetch(
      new Request('http://localhost/api/webhooks/infinitepay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: 'http://localhost:5173' },
        body: '{not-valid-json',
      }),
    )
    expect(malformed.status).toBe(400)

    const missingNsu = await app.fetch(
      new Request('http://localhost/api/webhooks/infinitepay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: 'http://localhost:5173' },
        body: JSON.stringify({ invoice_slug: 'x' }),
      }),
    )
    // Missing order_nsu is accepted (logged + received:true) but must not mutate state.
    expect(missingNsu.status).toBe(200)

    const unknownOrder = await app.fetch(
      new Request('http://localhost/api/webhooks/infinitepay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: 'http://localhost:5173' },
        body: JSON.stringify({ order_nsu: crypto.randomUUID(), invoice_slug: 'x' }),
      }),
    )
    // Unknown order_nsu → payment_not_found; responds 200 but no state change.
    expect(unknownOrder.status).toBe(200)

    const paymentRows = await sql`SELECT status FROM "payment" WHERE pool_id = ${pool.id}`
    expect(paymentRows).toMatchObject([{ status: 'pending' }])

    const members = await sql`SELECT user_id FROM "pool_member" WHERE pool_id = ${pool.id}`
    expect(members).toHaveLength(0)

    const poolRows = await sql`SELECT status FROM "pool" WHERE id = ${pool.id}`
    expect(poolRows).toMatchObject([{ status: 'pending' }])
  })
})
