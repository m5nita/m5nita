import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp } from '../support/app'
import { signInViaPhoneOtp } from '../support/auth-helper'
import { workerConnectionString } from '../support/db-utils'
import { makeCompetition } from '../support/fixtures/makeCompetition'
import { makePool } from '../support/fixtures/makePool'
import { deliverInfinitePayPaidWebhook } from '../support/payments'

const BEFORE = new Date('2026-06-15T17:00:00.000Z')

describe('ranking ordering', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  async function seedPaidPool(phoneNumber: string) {
    const { app } = buildTestApp({ initialNow: BEFORE })
    const comp = await makeCompetition(sql)
    const admin = await signInViaPhoneOtp(app, { phoneNumber })
    const pool = await makePool({ admin, competitionId: comp.id, entryFeeCentavos: 10_000 })
    await deliverInfinitePayPaidWebhook(app, pool.paymentId)
    return { app, comp, admin, pool }
  }

  it('returns tied members in a stable, deterministic order across refreshes', async () => {
    // seedPaidPool creates the owner; give them a name that sorts last so the
    // tiebreaker (name asc) is observable.
    const { app, admin, pool } = await seedPaidPool('+5511933331001')
    await sql`update "user" set name = 'Carlos' where id = ${admin.id}`

    // Two more paid members, named to sort before the owner.
    for (const [phone, name] of [
      ['+5511933331002', 'Ana'],
      ['+5511933331003', 'Bruno'],
    ] as const) {
      const member = await signInViaPhoneOtp(app, { phoneNumber: phone })
      const joinResp = await member.fetch(`/api/pools/${pool.id}/join`, { method: 'POST' })
      const { payment } = (await joinResp.json()) as { payment: { id: string } }
      await deliverInfinitePayPaidWebhook(app, payment.id)
      await sql`update "user" set name = ${name} where id = ${member.id}`
    }

    const read = async () => {
      const res = await admin.fetch(`/api/pools/${pool.id}/ranking`)
      const body = (await res.json()) as {
        ranking: Array<{ name: string | null; position: number }>
      }
      return body.ranking.map((r) => r.name)
    }

    const first = await read()
    const second = await read()
    expect(first).toEqual(['Ana', 'Bruno', 'Carlos'])
    expect(second).toEqual(first) // deterministic across calls
  })
})
