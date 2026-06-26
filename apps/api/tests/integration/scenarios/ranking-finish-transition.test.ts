import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { calcPointsForMatch } from '../../../src/jobs/calcPoints'
import { buildTestApp } from '../support/app'
import { signInViaPhoneOtp } from '../support/auth-helper'
import { workerConnectionString } from '../support/db-utils'
import { makeCompetition } from '../support/fixtures/makeCompetition'
import { makeMatch } from '../support/fixtures/makeMatch'
import { makePool } from '../support/fixtures/makePool'
import { deliverInfinitePayPaidWebhook } from '../support/payments'

const BEFORE = new Date('2026-06-15T17:00:00.000Z')
const KICKOFF = new Date('2026-06-15T18:00:00.000Z')

describe('ranking finish transition (no points-vanish flicker)', () => {
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

  async function readRanking(
    client: { fetch: (p: string, opts?: RequestInit) => Promise<Response> },
    poolId: string,
  ) {
    const res = await client.fetch(`/api/pools/${poolId}/ranking`)
    return (await res.json()) as {
      ranking: Array<{ totalPoints: number; livePoints: number }>
    }
  }

  it('keeps a just-finished match provisional until scored, then finalizes without double counting', async () => {
    const { admin, comp, pool } = await seedPaidPool('+5511933332001')
    const match = await makeMatch(sql, { competitionId: comp.id, matchDate: KICKOFF })

    // Member predicts the exact scoreline.
    const putResp = await admin.fetch(`/api/pools/${pool.id}/predictions/${match.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 2, awayScore: 1 }),
    })
    expect(putResp.status).toBe(200)

    // Match goes live with the predicted score → provisional points appear.
    await sql`update "match" set status = 'live', home_score = 2, away_score = 1, updated_at = now() where id = ${match.id}`
    const live = await readRanking(admin, pool.id)
    expect(live.ranking[0]?.livePoints).toBeGreaterThan(0)
    const provisional = live.ranking[0]?.livePoints ?? 0

    // Match flips to finished but scoring HASN'T run yet (the in-tick window).
    await sql`update "match" set status = 'finished', updated_at = now() where id = ${match.id}`
    const between = await readRanking(admin, pool.id)
    // Points must NOT vanish: still shown as provisional, same value.
    expect(between.ranking[0]?.livePoints).toBe(provisional)
    expect(between.ranking[0]?.totalPoints).toBe(0)

    // Now scoring runs → points finalize, no double count.
    await calcPointsForMatch(match.id)
    const after = await readRanking(admin, pool.id)
    expect(after.ranking[0]?.livePoints).toBe(0)
    expect(after.ranking[0]?.totalPoints).toBe(provisional)
  })
})
