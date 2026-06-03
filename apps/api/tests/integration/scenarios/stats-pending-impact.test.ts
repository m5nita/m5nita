import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp } from '../support/app'
import { signInViaPhoneOtp } from '../support/auth-helper'
import { workerConnectionString } from '../support/db-utils'
import { makeCompetition } from '../support/fixtures/makeCompetition'
import { makeMatch } from '../support/fixtures/makeMatch'
import { makePool } from '../support/fixtures/makePool'
import { deliverInfinitePayPaidWebhook } from '../support/payments'

const NOW = new Date('2026-06-01T12:00:00Z')
const K1 = new Date('2026-06-05T15:00:00Z')
const K2 = new Date('2026-06-06T15:00:00Z')

const EXPECTED_KEYS = [
  'action',
  'awayTeam',
  'hasPrediction',
  'homeTeam',
  'impact',
  'kickoff',
  'matchId',
  'pointsAtStake',
  'reachableRivals',
].sort()

/**
 * US3 (T037) — the impact list covers ALL the viewer's not-yet-started matches,
 * predicted or not, with a submit/change action, and exposes no third-party
 * prediction or consensus (FR-016/019, FR-021/022, SC-009).
 */
describe('US3 — pending-match impact', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  it('lists_all_not_started_matches_with_submit_or_change', async () => {
    const { app } = buildTestApp({ initialNow: NOW })
    const comp = await makeCompetition(sql)
    const owner = await signInViaPhoneOtp(app, { phoneNumber: '+5511977770001' })
    const pool = await makePool({ admin: owner, competitionId: comp.id })
    await deliverInfinitePayPaidWebhook(app, pool.paymentId)

    const unlockResp = await owner.fetch(`/api/pools/${pool.id}/stats/unlock`, { method: 'POST' })
    const { payment } = (await unlockResp.json()) as { payment: { id: string } }
    await deliverInfinitePayPaidWebhook(app, payment.id)

    const m1 = await makeMatch(sql, { competitionId: comp.id, matchDate: K1, matchday: 1 })
    const m2 = await makeMatch(sql, { competitionId: comp.id, matchDate: K2, matchday: 2 })

    // Predict only m1 → m1 should be "change", m2 should be "submit".
    await owner.fetch(`/api/pools/${pool.id}/predictions/${m1.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 1, awayScore: 0 }),
    })

    const resp = await owner.fetch(`/api/pools/${pool.id}/stats`)
    expect(resp.status).toBe(200)
    const body = (await resp.json()) as {
      pendingImpact: Array<{
        matchId: string
        action: string
        hasPrediction: boolean
      }>
    }

    const ids = body.pendingImpact.map((p) => p.matchId)
    expect(ids).toContain(m1.id)
    expect(ids).toContain(m2.id)

    const im1 = body.pendingImpact.find((p) => p.matchId === m1.id)
    const im2 = body.pendingImpact.find((p) => p.matchId === m2.id)
    expect(im1?.hasPrediction).toBe(true)
    expect(im1?.action).toBe('change')
    expect(im2?.hasPrediction).toBe(false)
    expect(im2?.action).toBe('submit')

    // No third-party prediction / consensus leaks: only the defined keys exist.
    for (const item of body.pendingImpact) {
      expect(Object.keys(item).sort()).toEqual(EXPECTED_KEYS)
    }
  })
})
