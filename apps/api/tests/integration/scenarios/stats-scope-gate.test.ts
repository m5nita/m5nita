import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp } from '../support/app'
import { signInViaPhoneOtp } from '../support/auth-helper'
import { workerConnectionString } from '../support/db-utils'
import { makeCompetition } from '../support/fixtures/makeCompetition'
import { makeMatch } from '../support/fixtures/makeMatch'
import { makePool } from '../support/fixtures/makePool'
import { deliverInfinitePayPaidWebhook } from '../support/payments'

/**
 * Statistics are offered only where they say something (whole-competition
 * pools), with one deliberate exception: whoever already paid for an unlock keeps
 * access on a shorter pool. That exception is the reason this scenario exists —
 * it is the outcome the change must not break.
 */
describe('Statistics scope gate', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  async function paidPool(
    app: ReturnType<typeof buildTestApp>['app'],
    phone: string,
    scope: { matchdayFrom?: number; matchdayTo?: number } = {},
  ) {
    const comp = await makeCompetition(sql)
    const owner = await signInViaPhoneOtp(app, { phoneNumber: phone })
    const pool = await makePool({
      admin: owner,
      competitionId: comp.id,
      entryFeeCentavos: 10_000,
      ...scope,
    })
    expect((await deliverInfinitePayPaidWebhook(app, pool.paymentId)).status).toBe(200)
    return { owner, pool, comp }
  }

  /** Grants the entitlement directly — dev/test must never hit a real gateway. */
  async function grantUnlock(userId: string, poolId: string): Promise<void> {
    const paymentId = crypto.randomUUID()
    await sql`
      INSERT INTO payment (id, user_id, pool_id, amount, platform_fee, type, status)
      VALUES (${paymentId}, ${userId}, ${poolId}, 199, 199, 'stats_unlock', 'completed')
    `
    await sql`
      INSERT INTO stats_unlock (id, user_id, pool_id, payment_id)
      VALUES (${crypto.randomUUID()}, ${userId}, ${poolId}, ${paymentId})
    `
  }

  async function addMemberDirectly(poolId: string, userId: string): Promise<void> {
    const paymentId = crypto.randomUUID()
    await sql`
      INSERT INTO payment (id, user_id, pool_id, amount, platform_fee, type, status)
      VALUES (${paymentId}, ${userId}, ${poolId}, 10000, 500, 'entry', 'completed')
    `
    await sql`
      INSERT INTO pool_member (id, pool_id, user_id, payment_id)
      VALUES (${crypto.randomUUID()}, ${poolId}, ${userId}, ${paymentId})
    `
  }

  async function poolDetail(
    user: Awaited<ReturnType<typeof signInViaPhoneOtp>>,
    poolId: string,
  ): Promise<{ statsAvailable: boolean }> {
    const resp = await user.fetch(`/api/pools/${poolId}`)
    expect(resp.status).toBe(200)
    return (await resp.json()) as { statsAvailable: boolean }
  }

  describe('whole-competition pool (unchanged)', () => {
    it('offers statistics and still sells the unlock', async () => {
      const { app } = buildTestApp()
      const { owner, pool } = await paidPool(app, '+5511944440001')

      expect((await poolDetail(owner, pool.id)).statsAvailable).toBe(true)

      const read = await owner.fetch(`/api/pools/${pool.id}/stats`)
      expect(read.status).toBe(200)
      expect((await read.json()) as { unlocked: boolean }).toMatchObject({ unlocked: false })

      const buy = await owner.fetch(`/api/pools/${pool.id}/stats/unlock`, { method: 'POST' })
      expect(buy.status).toBe(201)
    })
  })

  describe('matchday-range pool', () => {
    it('offers nothing and refuses both endpoints for a member with no unlock', async () => {
      const { app } = buildTestApp()
      const { owner, pool } = await paidPool(app, '+5511944440011', {
        matchdayFrom: 5,
        matchdayTo: 8,
      })

      expect((await poolDetail(owner, pool.id)).statsAvailable).toBe(false)

      const read = await owner.fetch(`/api/pools/${pool.id}/stats`)
      expect(read.status).toBe(404)
      expect((await read.json()) as { error: string }).toMatchObject({
        error: 'SCOPE_UNSUPPORTED',
      })

      const buy = await owner.fetch(`/api/pools/${pool.id}/stats/unlock`, { method: 'POST' })
      expect(buy.status).toBe(404)

      // No charge may exist for a pool that does not offer statistics.
      const charges = await sql`
        SELECT 1 FROM payment WHERE pool_id = ${pool.id} AND type = 'stats_unlock'
      `
      expect(charges).toHaveLength(0)
    })

    it('keeps access for someone who already paid, and only for them', async () => {
      const { app } = buildTestApp()
      const { owner, pool } = await paidPool(app, '+5511944440021', {
        matchdayFrom: 5,
        matchdayTo: 8,
      })
      const other = await signInViaPhoneOtp(app, { phoneNumber: '+5511944440022' })
      await addMemberDirectly(pool.id, other.id)
      await grantUnlock(owner.id, pool.id)

      expect((await poolDetail(owner, pool.id)).statsAvailable).toBe(true)
      const holderRead = await owner.fetch(`/api/pools/${pool.id}/stats`)
      expect(holderRead.status).toBe(200)
      expect((await holderRead.json()) as { unlocked: boolean }).toMatchObject({ unlocked: true })

      expect((await poolDetail(other, pool.id)).statsAvailable).toBe(false)
      const otherRead = await other.fetch(`/api/pools/${pool.id}/stats`)
      expect(otherRead.status).toBe(404)

      // Nothing about the paid entitlement was altered.
      const unlocks = await sql`
        SELECT 1 FROM stats_unlock WHERE user_id = ${owner.id} AND pool_id = ${pool.id}
      `
      expect(unlocks).toHaveLength(1)
    })
  })

  describe('single-fixture pool', () => {
    it('offers nothing, by the same rule that covers matchday ranges', async () => {
      const { app } = buildTestApp()
      const comp = await makeCompetition(sql)
      const owner = await signInViaPhoneOtp(app, { phoneNumber: '+5511944440031' })
      const match = await makeMatch(sql, {
        competitionId: comp.id,
        matchDate: new Date('2026-08-15T18:00:00.000Z'),
        homeTeam: 'Flamengo',
        awayTeam: 'Palmeiras',
        status: 'scheduled',
      })
      const pool = await makePool({ admin: owner, competitionId: comp.id, matchId: match.id })
      expect((await deliverInfinitePayPaidWebhook(app, pool.paymentId)).status).toBe(200)

      expect((await poolDetail(owner, pool.id)).statsAvailable).toBe(false)
      expect((await owner.fetch(`/api/pools/${pool.id}/stats`)).status).toBe(404)
    })
  })
})
