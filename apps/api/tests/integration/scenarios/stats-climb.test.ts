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

const NEXT_MATCH_KEYS = [
  'action',
  'awayTeam',
  'hasPrediction',
  'homeTeam',
  'kickoff',
  'matchId',
].sort()

/**
 * "Caminho até o topo" — the climb surfaces the SOONEST not-yet-started match the
 * viewer can still act on (submit/change) and exposes no third-party prediction
 * or consensus for it (FR-010/013, FR-018/019).
 */
describe('Caminho até o topo — climb next match', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  it('surfaces_the_soonest_actionable_match_without_leaking', async () => {
    const { app } = buildTestApp({ initialNow: NOW })
    const comp = await makeCompetition(sql)
    const owner = await signInViaPhoneOtp(app, { phoneNumber: '+5511977770001' })
    const pool = await makePool({ admin: owner, competitionId: comp.id })
    await deliverInfinitePayPaidWebhook(app, pool.paymentId)

    const unlockResp = await owner.fetch(`/api/pools/${pool.id}/stats/unlock`, { method: 'POST' })
    const { payment } = (await unlockResp.json()) as { payment: { id: string } }
    await deliverInfinitePayPaidWebhook(app, payment.id)

    const m1 = await makeMatch(sql, { competitionId: comp.id, matchDate: K1, matchday: 1 })
    await makeMatch(sql, { competitionId: comp.id, matchDate: K2, matchday: 2 })

    // Predict only m1 → it is the soonest, so the climb's next match is m1/"change".
    await owner.fetch(`/api/pools/${pool.id}/predictions/${m1.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 1, awayScore: 0 }),
    })

    const resp = await owner.fetch(`/api/pools/${pool.id}/stats`)
    expect(resp.status).toBe(200)
    const body = (await resp.json()) as {
      blocks: {
        climb: {
          state: string
          position: number | null
          nextMatch: { matchId: string; action: string; hasPrediction: boolean } | null
        }
      }
    }

    // No finished matches yet → no personal standing, but the next match still shows.
    expect(body.blocks.climb.state).toBe('insufficient_data')
    expect(body.blocks.climb.position).toBeNull()
    expect(body.blocks.climb.nextMatch?.matchId).toBe(m1.id) // soonest (K1 < K2)
    expect(body.blocks.climb.nextMatch?.action).toBe('change')
    expect(body.blocks.climb.nextMatch?.hasPrediction).toBe(true)

    // No third-party prediction / consensus leaks: only the defined keys exist.
    expect(Object.keys(body.blocks.climb.nextMatch ?? {}).sort()).toEqual(NEXT_MATCH_KEYS)
  })
})
