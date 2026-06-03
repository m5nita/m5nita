import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp } from '../support/app'
import { signInViaPhoneOtp } from '../support/auth-helper'
import { workerConnectionString } from '../support/db-utils'
import { makeCompetition } from '../support/fixtures/makeCompetition'
import { makePool } from '../support/fixtures/makePool'
import { deliverInfinitePayPaidWebhook } from '../support/payments'

/**
 * US1 — statistics unlock + server-side gate. Covers tasks T012 (gate),
 * T013 (idempotent unlock), T014 (prize invariance). PAYMENT_GATEWAY=infinitepay
 * in the harness, so unlock goes through the real adapter + webhook.
 */
describe('US1 — stats unlock + gate', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  async function setupPaidOwner(app: ReturnType<typeof buildTestApp>['app'], phone: string) {
    const comp = await makeCompetition(sql)
    const owner = await signInViaPhoneOtp(app, { phoneNumber: phone })
    const pool = await makePool({ admin: owner, competitionId: comp.id, entryFeeCentavos: 10_000 })
    const webhook = await deliverInfinitePayPaidWebhook(app, pool.paymentId)
    expect(webhook.status).toBe(200)
    return { owner, pool }
  }

  async function unlock(
    owner: Awaited<ReturnType<typeof signInViaPhoneOtp>>,
    poolId: string,
  ): Promise<string> {
    const resp = await owner.fetch(`/api/pools/${poolId}/stats/unlock`, { method: 'POST' })
    expect(resp.status).toBe(201)
    const body = (await resp.json()) as { payment: { id: string } }
    return body.payment.id
  }

  // T012 — gate
  it('non_member_gets_404', async () => {
    const { app } = buildTestApp()
    const { pool } = await setupPaidOwner(app, '+5511933330001')

    const stranger = await signInViaPhoneOtp(app, { phoneNumber: '+5511933330002' })
    const resp = await stranger.fetch(`/api/pools/${pool.id}/stats`)
    expect(resp.status).toBe(404)
  })

  it('member_without_entitlement_sees_only_teaser_and_price', async () => {
    const { app } = buildTestApp()
    const { owner, pool } = await setupPaidOwner(app, '+5511933330011')

    const resp = await owner.fetch(`/api/pools/${pool.id}/stats`)
    expect(resp.status).toBe(200)
    const body = (await resp.json()) as Record<string, unknown>
    expect(body.unlocked).toBe(false)
    expect((body.price as { centavos: number }).centavos).toBe(199)
    expect((body.price as { formatted: string }).formatted).toContain('1,99')
    expect(body.teaser).toBeDefined()
    // No computed statistic is present in the locked payload.
    expect(body).not.toHaveProperty('blocks')
  })

  it('member_with_entitlement_sees_unlocked', async () => {
    const { app } = buildTestApp()
    const { owner, pool } = await setupPaidOwner(app, '+5511933330021')

    const paymentId = await unlock(owner, pool.id)
    expect((await deliverInfinitePayPaidWebhook(app, paymentId)).status).toBe(200)

    const resp = await owner.fetch(`/api/pools/${pool.id}/stats`)
    expect(resp.status).toBe(200)
    const body = (await resp.json()) as { unlocked: boolean }
    expect(body.unlocked).toBe(true)
  })

  // T013 — idempotency (SC-002)
  it('duplicate_completion_charges_once_and_grants_one_entitlement', async () => {
    const { app } = buildTestApp()
    const { owner, pool } = await setupPaidOwner(app, '+5511944440001')

    const paymentId = await unlock(owner, pool.id)
    const first = await deliverInfinitePayPaidWebhook(app, paymentId)
    const second = await deliverInfinitePayPaidWebhook(app, paymentId)
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)

    const unlockRows = await sql`
      SELECT id FROM "stats_unlock" WHERE pool_id = ${pool.id} AND user_id = ${owner.id}
    `
    expect(unlockRows.length).toBe(1)
    const payRows = await sql`SELECT status FROM "payment" WHERE id = ${paymentId}`
    expect(payRows[0]?.status).toBe('completed')
  })

  // T014 — prize invariance (SC-003, FR-008/009)
  it('unlock_leaves_prize_and_membership_untouched', async () => {
    const { app } = buildTestApp()
    const { owner, pool } = await setupPaidOwner(app, '+5511955550001')

    const membersBefore = await sql`
      SELECT count(*)::int AS n FROM "pool_member" WHERE pool_id = ${pool.id}
    `
    const prizeBefore = (
      (await (await owner.fetch(`/api/pools/${pool.id}/ranking`)).json()) as { prizeTotal: number }
    ).prizeTotal

    const paymentId = await unlock(owner, pool.id)
    await deliverInfinitePayPaidWebhook(app, paymentId)

    const membersAfter = await sql`
      SELECT count(*)::int AS n FROM "pool_member" WHERE pool_id = ${pool.id}
    `
    const prizeAfter = (
      (await (await owner.fetch(`/api/pools/${pool.id}/ranking`)).json()) as { prizeTotal: number }
    ).prizeTotal

    expect(membersAfter[0]?.n).toBe(membersBefore[0]?.n)
    expect(prizeAfter).toBe(prizeBefore)
    const payRows = await sql`SELECT type FROM "payment" WHERE id = ${paymentId}`
    expect(payRows[0]?.type).toBe('stats_unlock')
  })
})
