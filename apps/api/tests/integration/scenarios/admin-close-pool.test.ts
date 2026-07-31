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

describe('Admin close pool — end to end', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  it('closes a pool stranded by postponed matches, and the close is final', async () => {
    const baseline = new Date('2026-07-31T12:00:00Z')
    const { app, container, clock } = buildTestApp({ initialNow: baseline })
    const comp = await makeCompetition(sql)
    const owner = await signInViaPhoneOtp(app, { phoneNumber: '+5511977700010' })
    const pool = await makePool({
      admin: owner,
      competitionId: comp.id,
      entryFeeCentavos: 100,
      matchdayFrom: 21,
      matchdayTo: 21,
    })
    expect((await deliverInfinitePayPaidWebhook(app, pool.paymentId)).status).toBe(200)

    // Played and scored before the admin steps in.
    await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: new Date('2026-07-29T22:30:00Z'),
      matchday: 21,
      status: 'finished',
      homeScore: 1,
      awayScore: 1,
    })
    // Never kicked off; still holding the pool open.
    const postponed = await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: new Date('2026-07-29T00:00:00Z'),
      matchday: 21,
      status: 'postponed',
      homeTeam: 'São Paulo FC',
      awayTeam: 'Santos FC',
    })

    const result = await container.closePoolUseCase.execute({
      inviteCode: pool.inviteCode,
      force: false,
    })

    expect(result.outcome).toBe('closed')
    if (result.outcome !== 'closed') return
    expect(result.stranded.map((m) => m.id)).toEqual([postponed.id])

    // notifyPoolWinners ran: the sole paid member comes back as the winner,
    // sharing the pot minus the platform fee (floor(100 × 1 × 0.95) = 95
    // centavos, one winner). No prediction was ever submitted, so 0 points —
    // being the only member is enough to hold first place.
    expect(result.winners).toEqual([{ userId: owner.id, name: owner.phoneNumber, totalPoints: 0 }])
    expect(result.prizeShare).toBe(95)

    const [row] = await sql`SELECT status FROM pool WHERE id = ${pool.id}`
    expect(row?.status).toBe('closed')

    // The postponed match is untouched — no status was rewritten to force this.
    const [stillPostponed] = await sql`SELECT status FROM "match" WHERE id = ${postponed.id}`
    expect(stillPostponed?.status).toBe('postponed')

    // The reason the close must be final: a reschedule must not reopen predictions.
    clock.setNow(new Date('2026-08-01T12:00:00Z'))
    await sql`
      UPDATE "match"
      SET status = 'scheduled', match_date = ${new Date('2026-08-10T21:30:00Z')}
      WHERE id = ${postponed.id}
    `
    const late = await owner.fetch(`/api/pools/${pool.id}/predictions/${postponed.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 3, awayScore: 0 }),
    })
    expect(late.status).toBe(409)
    expect(((await late.json()) as { error: string }).error).toBe('POOL_CLOSED')
  })

  it('refuses a pool whose next match has not kicked off yet', async () => {
    const baseline = new Date('2026-07-31T12:00:00Z')
    const { app, container } = buildTestApp({ initialNow: baseline })
    const comp = await makeCompetition(sql)
    const owner = await signInViaPhoneOtp(app, { phoneNumber: '+5511977700011' })
    const pool = await makePool({
      admin: owner,
      competitionId: comp.id,
      entryFeeCentavos: 100,
      matchdayFrom: 40,
      matchdayTo: 40,
    })
    expect((await deliverInfinitePayPaidWebhook(app, pool.paymentId)).status).toBe(200)

    await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: new Date('2026-08-09T21:30:00Z'),
      matchday: 40,
      status: 'scheduled',
      homeTeam: 'CR Flamengo',
      awayTeam: 'CR Vasco da Gama',
    })

    const refused = await container.closePoolUseCase.execute({
      inviteCode: pool.inviteCode,
      force: false,
    })
    expect(refused.outcome).toBe('blocked')

    const [stillActive] = await sql`SELECT status FROM pool WHERE id = ${pool.id}`
    expect(stillActive?.status).toBe('active')

    const forced = await container.closePoolUseCase.execute({
      inviteCode: pool.inviteCode,
      force: true,
    })
    expect(forced.outcome).toBe('closed')

    const [nowClosed] = await sql`SELECT status FROM pool WHERE id = ${pool.id}`
    expect(nowClosed?.status).toBe('closed')
  })
})
