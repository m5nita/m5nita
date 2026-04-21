import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { calcPointsForMatch } from '../../../src/jobs/calcPoints'
import { buildTestApp } from '../support/app'
import { signInViaPhoneOtp } from '../support/auth-helper'
import { workerConnectionString } from '../support/db-utils'
import { makeCompetition } from '../support/fixtures/makeCompetition'
import { finishMatch, makeMatch } from '../support/fixtures/makeMatch'
import { makePool } from '../support/fixtures/makePool'
import { deliverInfinitePayPaidWebhook } from '../support/payments'

const KICKOFF = new Date('2026-06-15T18:00:00.000Z')
const BEFORE = new Date('2026-06-15T17:00:00.000Z')
const AFTER = new Date('2026-06-15T19:00:00.000Z')

describe('US3 — predictions and scoring', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  async function seedPaidPool(phoneNumber: string) {
    const { app, clock, container } = buildTestApp({ initialNow: BEFORE })
    const comp = await makeCompetition(sql)
    const admin = await signInViaPhoneOtp(app, { phoneNumber })
    const pool = await makePool({ admin, competitionId: comp.id, entryFeeCentavos: 10_000 })
    await deliverInfinitePayPaidWebhook(app, pool.paymentId)
    return { app, clock, container, comp, admin, pool }
  }

  it('scenario 1 — paid member submits prediction before kickoff; persisted and readable', async () => {
    const { admin, pool, comp } = await seedPaidPool('+5511933330001')

    const match = await makeMatch(sql, { competitionId: comp.id, matchDate: KICKOFF })

    const putResp = await admin.fetch(`/api/pools/${pool.id}/predictions/${match.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 2, awayScore: 1 }),
    })
    expect(putResp.status).toBe(200)

    const predRows = await sql`
      SELECT user_id, home_score, away_score FROM "prediction"
      WHERE user_id = ${admin.id} AND pool_id = ${pool.id} AND match_id = ${match.id}
    `
    expect(predRows).toMatchObject([{ user_id: admin.id, home_score: 2, away_score: 1 }])

    const listResp = await admin.fetch(`/api/pools/${pool.id}/predictions`)
    expect(listResp.status).toBe(200)
    const listBody = (await listResp.json()) as { predictions: Array<{ matchId: string }> }
    expect(listBody.predictions.some((p) => p.matchId === match.id)).toBe(true)
  })

  it('scenario 2 — prediction rejected after kickoff; no row created or modified', async () => {
    const { clock, admin, pool, comp } = await seedPaidPool('+5511933330011')

    const match = await makeMatch(sql, { competitionId: comp.id, matchDate: KICKOFF })

    const ok = await admin.fetch(`/api/pools/${pool.id}/predictions/${match.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 1, awayScore: 0 }),
    })
    expect(ok.status).toBe(200)

    clock.setNow(AFTER)

    const editResp = await admin.fetch(`/api/pools/${pool.id}/predictions/${match.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 3, awayScore: 3 }),
    })
    expect(editResp.status).toBeGreaterThanOrEqual(400)
    expect(editResp.status).toBeLessThan(500)

    const rows = await sql`
      SELECT home_score, away_score FROM "prediction"
      WHERE user_id = ${admin.id} AND match_id = ${match.id}
    `
    expect(rows).toMatchObject([{ home_score: 1, away_score: 0 }])
  })

  it('scenario 3 — scoring + ranking: exact match vs miss, tie-breakers deterministic', async () => {
    const { app, clock, admin, pool, comp } = await seedPaidPool('+5511933330021')

    // Second paid member (wins the exact-match tie-breaker later).
    const player = await signInViaPhoneOtp(app, { phoneNumber: '+5511933330022' })
    const joinResp = await player.fetch(`/api/pools/${pool.id}/join`, { method: 'POST' })
    const joinBody = (await joinResp.json()) as { payment: { id: string } }
    await deliverInfinitePayPaidWebhook(app, joinBody.payment.id)

    const matchA = await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: KICKOFF,
      stage: 'GROUP_STAGE',
      matchday: 1,
    })
    const matchB = await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: new Date(KICKOFF.getTime() + 2 * 60 * 60 * 1000),
      stage: 'ROUND_OF_16',
      matchday: 9,
    })

    // Admin predicts exact on A (2-1), miss on B (3-0).
    // Player predicts miss on A (0-0), exact on B (1-1).
    await admin.fetch(`/api/pools/${pool.id}/predictions/${matchA.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 2, awayScore: 1 }),
    })
    await admin.fetch(`/api/pools/${pool.id}/predictions/${matchB.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 3, awayScore: 0 }),
    })
    await player.fetch(`/api/pools/${pool.id}/predictions/${matchA.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 0, awayScore: 0 }),
    })
    await player.fetch(`/api/pools/${pool.id}/predictions/${matchB.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 1, awayScore: 1 }),
    })

    // Lock + finish both matches with the real scores, then score.
    clock.setNow(AFTER)
    await finishMatch(sql, matchA.id, 2, 1)
    await finishMatch(sql, matchB.id, 1, 1)

    await calcPointsForMatch(matchA.id)
    await calcPointsForMatch(matchB.id)

    const adminPoints = await sql`
      SELECT points FROM "prediction" WHERE user_id = ${admin.id} ORDER BY match_id
    `
    const playerPoints = await sql`
      SELECT points FROM "prediction" WHERE user_id = ${player.id} ORDER BY match_id
    `

    // Admin: match A exact (10) + match B miss (0) → 10, 1 exact.
    // Player: match A miss (0) + match B exact (10) → 10, 1 exact.
    const adminTotal = adminPoints.reduce(
      (s: number, r: { points: number | null }) => s + (r.points ?? 0),
      0,
    )
    const playerTotal = playerPoints.reduce(
      (s: number, r: { points: number | null }) => s + (r.points ?? 0),
      0,
    )
    expect(adminTotal).toBe(10)
    expect(playerTotal).toBe(10)

    const rankingResp = await admin.fetch(`/api/pools/${pool.id}/ranking`)
    expect(rankingResp.status).toBe(200)
    const rankingBody = (await rankingResp.json()) as {
      ranking: Array<{
        position: number
        userId: string
        totalPoints: number
        exactMatches: number
      }>
    }

    // Both users have the same total + same exact count → shared position 1.
    expect(rankingBody.ranking).toHaveLength(2)
    expect(rankingBody.ranking.every((r) => r.position === 1)).toBe(true)
    expect(rankingBody.ranking.every((r) => r.totalPoints === 10)).toBe(true)
    expect(rankingBody.ranking.every((r) => r.exactMatches === 1)).toBe(true)
  })

  it('scenario 4 — view others’ predictions is blocked until kickoff, allowed after', async () => {
    const { app, clock, admin, pool, comp } = await seedPaidPool('+5511933330031')
    const player = await signInViaPhoneOtp(app, { phoneNumber: '+5511933330032' })
    const joinResp = await player.fetch(`/api/pools/${pool.id}/join`, { method: 'POST' })
    const joinBody = (await joinResp.json()) as { payment: { id: string } }
    await deliverInfinitePayPaidWebhook(app, joinBody.payment.id)

    const match = await makeMatch(sql, { competitionId: comp.id, matchDate: KICKOFF })

    await admin.fetch(`/api/pools/${pool.id}/predictions/${match.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 2, awayScore: 1 }),
    })
    await player.fetch(`/api/pools/${pool.id}/predictions/${match.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 0, awayScore: 0 }),
    })

    // Before kickoff — viewing the match's predictions is blocked.
    const blocked = await admin.fetch(`/api/pools/${pool.id}/matches/${match.id}/predictions`)
    expect(blocked.status).toBe(409)

    // Advance past kickoff — now the viewer can see everyone's predictions.
    clock.setNow(AFTER)
    const ok = await admin.fetch(`/api/pools/${pool.id}/matches/${match.id}/predictions`)
    expect(ok.status).toBe(200)
    const body = (await ok.json()) as {
      predictors: Array<{ userId: string; homeScore: number; awayScore: number }>
      viewerDidPredict: boolean
    }
    expect(body.viewerDidPredict).toBe(true)
    const playerPrediction = body.predictors.find((p) => p.userId === player.id)
    expect(playerPrediction).toMatchObject({ homeScore: 0, awayScore: 0 })
  })
})
