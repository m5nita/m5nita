import type { MyPerformanceResponse } from '@m5nita/shared'
import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { calcPointsForMatch } from '../../../src/jobs/calcPoints'
import { checkAndClosePools } from '../../../src/jobs/closePoolsJob'
import { buildTestApp } from '../support/app'
import { signInViaPhoneOtp, type TestUser } from '../support/auth-helper'
import { workerConnectionString } from '../support/db-utils'
import { makeCompetition } from '../support/fixtures/makeCompetition'
import { finishMatch, makeMatch } from '../support/fixtures/makeMatch'
import { makePool } from '../support/fixtures/makePool'
import { deliverInfinitePayPaidWebhook } from '../support/payments'

const ONE_HOUR = 60 * 60 * 1000

type World = {
  hero: TestUser
  poolAId: string // hero wins (2 members → prize 19000)
}

describe('033 — global performance ("Meu desempenho")', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  async function joinPaid(
    app: Awaited<ReturnType<typeof buildTestApp>>['app'],
    user: TestUser,
    poolId: string,
  ): Promise<void> {
    const resp = await user.fetch(`/api/pools/${poolId}/join`, { method: 'POST' })
    const body = (await resp.json()) as { payment: { id: string } }
    await deliverInfinitePayPaidWebhook(app, body.payment.id)
  }

  async function predict(
    user: TestUser,
    poolId: string,
    matchId: string,
    homeScore: number,
    awayScore: number,
  ): Promise<void> {
    await user.fetch(`/api/pools/${poolId}/predictions/${matchId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore, awayScore }),
    })
  }

  // Hero: WINS pool A (md1), LOSES pool B (md2), still IN PROGRESS in pool C (md3).
  // Entry 10000 each → gastei 30000. Pool A has 2 members → prize 19000 (single
  // winner). saldo = 19000 - 30000 = -11000.
  async function seedWorld(): Promise<World> {
    const baseline = new Date('2026-06-15T12:00:00.000Z')
    const kickoff = new Date(baseline.getTime() + ONE_HOUR)
    const { app, clock } = buildTestApp({ initialNow: baseline })

    const comp = await makeCompetition(sql)
    const admin = await signInViaPhoneOtp(app, { phoneNumber: '+5511988800001' })
    const hero = await signInViaPhoneOtp(app, { phoneNumber: '+5511988800002' })
    const winnerB = await signInViaPhoneOtp(app, { phoneNumber: '+5511988800003' })

    const poolA = await makePool({
      admin,
      competitionId: comp.id,
      entryFeeCentavos: 10_000,
      matchdayFrom: 1,
      matchdayTo: 1,
    })
    await deliverInfinitePayPaidWebhook(app, poolA.paymentId)
    await joinPaid(app, hero, poolA.id)

    const poolB = await makePool({
      admin,
      competitionId: comp.id,
      entryFeeCentavos: 10_000,
      matchdayFrom: 2,
      matchdayTo: 2,
    })
    await deliverInfinitePayPaidWebhook(app, poolB.paymentId)
    await joinPaid(app, hero, poolB.id)
    await joinPaid(app, winnerB, poolB.id)

    const poolC = await makePool({
      admin,
      competitionId: comp.id,
      entryFeeCentavos: 10_000,
      matchdayFrom: 3,
      matchdayTo: 3,
    })
    await deliverInfinitePayPaidWebhook(app, poolC.paymentId)
    await joinPaid(app, hero, poolC.id)

    const matchA = await makeMatch(sql, { competitionId: comp.id, matchDate: kickoff, matchday: 1 })
    const matchB = await makeMatch(sql, { competitionId: comp.id, matchDate: kickoff, matchday: 2 })
    // Pool C keeps an unfinished (scheduled) match so it stays em andamento.
    await makeMatch(sql, { competitionId: comp.id, matchDate: kickoff, matchday: 3 })

    await predict(hero, poolA.id, matchA.id, 2, 1) // exact → wins A
    await predict(hero, poolB.id, matchB.id, 0, 0) // wrong → loses B
    await predict(winnerB, poolB.id, matchB.id, 2, 1) // exact → wins B

    clock.setNow(new Date(baseline.getTime() + 3 * ONE_HOUR))
    await finishMatch(sql, matchA.id, 2, 1)
    await finishMatch(sql, matchB.id, 2, 1)
    await calcPointsForMatch(matchA.id)
    await calcPointsForMatch(matchB.id)
    await checkAndClosePools()

    return { hero, poolAId: poolA.id }
  }

  it('aggregates saldo, record and money across all pools, and reconciles', async () => {
    const { hero } = await seedWorld()

    const resp = await hero.fetch('/api/users/me/performance')
    expect(resp.status).toBe(200)
    const body = (await resp.json()) as MyPerformanceResponse

    expect(body.participei).toBe(3)
    expect(body.vitorias).toBe(1)
    expect(body.derrotas).toBe(1)
    expect(body.emAndamento).toBe(1)
    expect(body.aproveitamento).toBe(0.5)
    expect(body.gasteiCentavos).toBe(30_000)
    expect(body.premiosConquistadosCentavos).toBe(19_000)
    expect(body.aSacarCentavos).toBe(19_000)
    expect(body.saldoCentavos).toBe(-11_000)
    expect(body.maiorPremioCentavos).toBe(19_000)
    expect(body.evolucao).toHaveLength(3)

    // Reconciliation invariants (SC-003 / SC-005).
    expect(body.saldoCentavos).toBe(body.premiosConquistadosCentavos - body.gasteiCentavos)
    expect(body.vitorias + body.derrotas).toBe(2)
  })

  it('drops a sacar to zero after a withdrawal but keeps prêmios and saldo', async () => {
    const { hero, poolAId } = await seedWorld()

    const withdraw = await hero.fetch(`/api/pools/${poolAId}/prize/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pixKeyType: 'cpf', pixKey: '123.456.789-09' }),
    })
    expect(withdraw.status).toBe(201)

    const perfResp = await hero.fetch('/api/users/me/performance')
    const body = (await perfResp.json()) as MyPerformanceResponse
    expect(body.aSacarCentavos).toBe(0)
    expect(body.premiosConquistadosCentavos).toBe(19_000)
    expect(body.saldoCentavos).toBe(-11_000)
  })

  it('returns an empty, non-error summary for a user with no pools', async () => {
    const { app } = buildTestApp({ initialNow: '2026-06-15T12:00:00.000Z' })
    const fresh = await signInViaPhoneOtp(app, { phoneNumber: '+5511988800009' })

    const resp = await fresh.fetch('/api/users/me/performance')
    expect(resp.status).toBe(200)
    const body = (await resp.json()) as MyPerformanceResponse

    expect(body.participei).toBe(0)
    expect(body.vitorias).toBe(0)
    expect(body.derrotas).toBe(0)
    expect(body.emAndamento).toBe(0)
    expect(body.aproveitamento).toBeNull()
    expect(body.gasteiCentavos).toBe(0)
    expect(body.saldoCentavos).toBe(0)
    expect(body.maiorPremioCentavos).toBeNull()
    expect(body.evolucao).toEqual([])
  })

  it('requires authentication (no paywall, but not public)', async () => {
    const { app } = buildTestApp({ initialNow: '2026-06-15T12:00:00.000Z' })
    const resp = await app.fetch(
      new Request('http://localhost/api/users/me/performance', {
        headers: { origin: process.env.ALLOWED_ORIGIN || 'http://localhost:5173' },
      }),
    )
    expect(resp.status).toBe(401)
  })
})
