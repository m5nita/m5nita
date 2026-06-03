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

const NOW = new Date('2026-06-01T12:00:00Z')
const KICKOFF = new Date('2026-06-01T15:00:00Z')
const AFTER = new Date('2026-06-01T18:00:00Z')

/**
 * US2 — the four comparison blocks. Covers T026: an unlocked panel returns the
 * blocks, reflects a finished match (freshness via calcPoints), and the locked
 * payload exposes no computed/third-party data.
 */
describe('US2 — stats blocks', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  it('unlocked_panel_returns_blocks_after_a_finished_match', async () => {
    const { app, clock } = buildTestApp({ initialNow: NOW })
    const comp = await makeCompetition(sql)
    const owner = await signInViaPhoneOtp(app, { phoneNumber: '+5511966660001' })
    const pool = await makePool({ admin: owner, competitionId: comp.id })
    await deliverInfinitePayPaidWebhook(app, pool.paymentId)

    const unlockResp = await owner.fetch(`/api/pools/${pool.id}/stats/unlock`, { method: 'POST' })
    const { payment } = (await unlockResp.json()) as { payment: { id: string } }
    await deliverInfinitePayPaidWebhook(app, payment.id)

    const match = await makeMatch(sql, { competitionId: comp.id, matchDate: KICKOFF, matchday: 1 })
    await owner.fetch(`/api/pools/${pool.id}/predictions/${match.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 2, awayScore: 1 }),
    })

    clock.setNow(AFTER)
    await finishMatch(sql, match.id, 2, 1)
    await calcPointsForMatch(match.id)

    const resp = await owner.fetch(`/api/pools/${pool.id}/stats`)
    expect(resp.status).toBe(200)
    const body = (await resp.json()) as {
      unlocked: boolean
      blocks: {
        hitRateVsAverage: { exactPct: { you: number }; state: string }
        rankingEvolution: {
          perRound: { matchday: number; points: number }[]
          position: number | null
          gapToLeader: number
          trend: string
          state: string
        }
        pointsLeftOnTable: { earned: number; maxPossible: number; state: string }
      }
    }

    expect(body.unlocked).toBe(true)
    expect(body.blocks.hitRateVsAverage.state).toBe('ok')
    expect(body.blocks.hitRateVsAverage.exactPct.you).toBeCloseTo(1) // 1/1 exact prediction
    // Block B (ranking evolution): only member → position 1, no gap, no prior snapshot → stable.
    expect(body.blocks.rankingEvolution.perRound).toEqual([{ matchday: 1, points: 10 }])
    expect(body.blocks.rankingEvolution.position).toBe(1)
    expect(body.blocks.rankingEvolution.gapToLeader).toBe(0)
    expect(body.blocks.rankingEvolution.trend).toBe('stable')
    expect(body.blocks.pointsLeftOnTable.earned).toBe(10)
    expect(body.blocks.pointsLeftOnTable.maxPossible).toBe(10) // range pool: 1 finished * 10
  })

  it('locked_payload_carries_no_computed_blocks', async () => {
    const { app } = buildTestApp({ initialNow: NOW })
    const comp = await makeCompetition(sql)
    const owner = await signInViaPhoneOtp(app, { phoneNumber: '+5511966660011' })
    const pool = await makePool({ admin: owner, competitionId: comp.id })
    await deliverInfinitePayPaidWebhook(app, pool.paymentId)

    const resp = await owner.fetch(`/api/pools/${pool.id}/stats`)
    const body = (await resp.json()) as Record<string, unknown>
    expect(body.unlocked).toBe(false)
    expect(body).not.toHaveProperty('blocks')
  })
})
