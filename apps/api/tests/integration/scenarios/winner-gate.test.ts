import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncLiveScoresUseCase } from '../../../src/application/match/SyncLiveScoresUseCase'
import type {
  ExternalMatch,
  FootballDataApi,
} from '../../../src/application/ports/FootballDataApi.port'
import { calcPointsForMatch } from '../../../src/jobs/calcPoints'
import { buildTestApp } from '../support/app'
import { signInViaPhoneOtp } from '../support/auth-helper'
import { workerConnectionString } from '../support/db-utils'
import { makeCompetition } from '../support/fixtures/makeCompetition'
import { makeMatch } from '../support/fixtures/makeMatch'
import { makePool } from '../support/fixtures/makePool'
import { deliverInfinitePayPaidWebhook } from '../support/payments'

// Regression for prod match 537418 (NED–MAR, round-of-32). The provider reported
// FINISHED before populating the winner; the old behaviour finalized it with no
// winner and silently dropped the +2 advance bonus, never re-scoring. The winner
// gate must hold the match as live until the winner arrives, then score the bonus.
const KICKOFF = new Date('2026-06-30T01:00:00.000Z')
const BEFORE = new Date('2026-06-30T00:00:00.000Z')
const AFTER = new Date('2026-06-30T04:00:00.000Z')

describe('Winner gate (integration)', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })
  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  async function predict(
    user: { fetch: (p: string, init?: RequestInit) => Promise<Response> },
    poolId: string,
    matchId: string,
    body: { homeScore: number; awayScore: number; advancePick: 'home' | 'away' },
  ) {
    const resp = await user.fetch(`/api/pools/${poolId}/predictions/${matchId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(resp.status).toBe(200)
  }

  async function pointsFor(userId: string, matchId: string): Promise<number | null> {
    const [row] = await sql<{ points: number | null }[]>`
      SELECT points FROM "prediction" WHERE user_id = ${userId} AND match_id = ${matchId}
    `
    return row?.points ?? null
  }

  it('holds a winnerless penalty knockout as live, then finalizes with the +2 when the winner arrives', async () => {
    const { app, clock, container } = buildTestApp({ initialNow: BEFORE })
    const comp = await makeCompetition(sql, { type: 'cup' })

    const admin = await signInViaPhoneOtp(app, { phoneNumber: '+5511955550001' })
    const pool = await makePool({ admin, competitionId: comp.id, entryFeeCentavos: 10_000 })
    await deliverInfinitePayPaidWebhook(app, pool.paymentId)

    const player = await signInViaPhoneOtp(app, { phoneNumber: '+5511955550002' })
    const joinResp = await player.fetch(`/api/pools/${pool.id}/join`, { method: 'POST' })
    const joinBody = (await joinResp.json()) as { payment: { id: string } }
    await deliverInfinitePayPaidWebhook(app, joinBody.payment.id)

    const match = await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: KICKOFF,
      stage: 'round-of-32',
      homeTeam: 'Netherlands',
      awayTeam: 'Morocco',
    })

    // admin picks Morocco (away) to advance; player picks Netherlands (home).
    await predict(admin, pool.id, match.id, { homeScore: 1, awayScore: 1, advancePick: 'away' })
    await predict(player, pool.id, match.id, { homeScore: 1, awayScore: 1, advancePick: 'home' })

    // Drive the real live-sync against the real DB with a scripted football API.
    let liveResponse: ExternalMatch[] = []
    const heldSpy = vi.fn(async () => {})
    const sync = new SyncLiveScoresUseCase({
      footballApi: {
        fetchLiveMatches: async () => liveResponse,
        fetchMatches: async () => [],
      } as unknown as FootballDataApi,
      matchRepo: container.matchRepo,
      clock,
      findActiveCompetitions: async () => [
        { id: comp.id, externalId: comp.externalId, name: comp.name },
      ],
      onMatchFinished: async (id) => {
        await calcPointsForMatch(id)
      },
      onMatchHeldAwaitingWinner: heldSpy,
    })

    const fixture = (winner?: 'AWAY_TEAM'): ExternalMatch => ({
      id: match.externalId,
      utcDate: KICKOFF.toISOString(),
      status: 'FINISHED',
      stage: 'LAST_32',
      group: null,
      matchday: null,
      homeTeam: { name: 'Netherlands', crest: '' },
      awayTeam: { name: 'Morocco', crest: '' },
      score: {
        ...(winner ? { winner } : {}),
        duration: 'PENALTY_SHOOTOUT',
        fullTime: { home: 1, away: 1 },
        regularTime: { home: 1, away: 1 },
        penalties: { home: 2, away: 3 },
      },
    })

    clock.setNow(AFTER)

    // Tick 1 — FINISHED but no winner: held as live, nothing scored.
    liveResponse = [fixture()]
    await sync.execute()

    const [t1] = await sql<{ status: string; winner: string | null }[]>`
      SELECT status, winner FROM "match" WHERE id = ${match.id}
    `
    expect(t1?.status).toBe('live')
    expect(t1?.winner).toBeNull()
    expect(heldSpy).toHaveBeenCalledWith(match.id)
    expect(await pointsFor(admin.id, match.id)).toBeNull()
    expect(await pointsFor(player.id, match.id)).toBeNull()

    // Tick 2 — winner arrives: finalize + score with the advance bonus.
    liveResponse = [fixture('AWAY_TEAM')]
    await sync.execute()

    const [t2] = await sql<{ status: string; winner: string | null }[]>`
      SELECT status, winner FROM "match" WHERE id = ${match.id}
    `
    expect(t2?.status).toBe('finished')
    expect(t2?.winner).toBe('away')
    expect(await pointsFor(admin.id, match.id)).toBe(12) // exact draw (10) + advance (+2)
    expect(await pointsFor(player.id, match.id)).toBe(10) // exact draw (10), wrong pick
  })
})
