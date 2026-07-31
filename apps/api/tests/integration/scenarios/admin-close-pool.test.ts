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
 * A pool whose remaining matches were postponed. The repository must hand back
 * those rows so the admin path can tell a stranded match from a blocking one.
 */
describe('Admin close pool — reading the unfinished matches', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  it('returns the postponed match and omits the finished one', async () => {
    const { app, container } = buildTestApp()
    const comp = await makeCompetition(sql)
    const owner = await signInViaPhoneOtp(app, { phoneNumber: '+5511977700001' })
    const pool = await makePool({
      admin: owner,
      competitionId: comp.id,
      entryFeeCentavos: 100,
      matchdayFrom: 21,
      matchdayTo: 21,
    })
    expect((await deliverInfinitePayPaidWebhook(app, pool.paymentId)).status).toBe(200)

    await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: new Date('2026-07-29T22:30:00Z'),
      matchday: 21,
      status: 'finished',
      homeTeam: 'SC Internacional',
      awayTeam: 'CR Flamengo',
      homeScore: 1,
      awayScore: 1,
    })
    const postponed = await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: new Date('2026-07-29T00:00:00Z'),
      matchday: 21,
      status: 'postponed',
      homeTeam: 'São Paulo FC',
      awayTeam: 'Santos FC',
    })
    await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: new Date('2026-07-29T00:00:00Z'),
      matchday: 22,
      status: 'postponed',
      homeTeam: 'Fora do escopo',
      awayTeam: 'Outra rodada',
    })

    const rows = await container.matchRepo.findUnfinishedFor({
      kind: 'range',
      competitionId: comp.id,
      matchdayFrom: 21,
      matchdayTo: 21,
    })

    expect(rows.map((r) => r.id)).toEqual([postponed.id])
    expect(rows[0]?.homeTeam).toBe('São Paulo FC')
    expect(rows[0]?.status).toBe('postponed')
  })

  it('returns an empty list once every in-scope match is terminal', async () => {
    const { app, container } = buildTestApp()
    const comp = await makeCompetition(sql)
    const owner = await signInViaPhoneOtp(app, { phoneNumber: '+5511977700002' })
    const pool = await makePool({
      admin: owner,
      competitionId: comp.id,
      entryFeeCentavos: 100,
      matchdayFrom: 30,
      matchdayTo: 30,
    })
    expect((await deliverInfinitePayPaidWebhook(app, pool.paymentId)).status).toBe(200)

    await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: new Date('2026-07-29T22:30:00Z'),
      matchday: 30,
      status: 'finished',
      homeScore: 0,
      awayScore: 0,
    })
    await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: new Date('2026-07-29T22:30:00Z'),
      matchday: 30,
      status: 'cancelled',
    })

    const rows = await container.matchRepo.findUnfinishedFor({
      kind: 'range',
      competitionId: comp.id,
      matchdayFrom: 30,
      matchdayTo: 30,
    })

    expect(rows).toEqual([])
  })
})
