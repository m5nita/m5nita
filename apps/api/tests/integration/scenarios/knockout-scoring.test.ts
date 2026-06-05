import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SyncFixturesUseCase } from '../../../src/application/match/SyncFixturesUseCase'
import type { ExternalMatch } from '../../../src/application/ports/FootballDataApi.port'
import { FootballDataApiAdapter } from '../../../src/infrastructure/external/FootballDataApiAdapter'
import { calcPointsForMatch } from '../../../src/jobs/calcPoints'
import { buildTestApp } from '../support/app'
import { signInViaPhoneOtp } from '../support/auth-helper'
import { workerConnectionString } from '../support/db-utils'
import { makeCompetition } from '../support/fixtures/makeCompetition'
import { makeMatch } from '../support/fixtures/makeMatch'
import { makePool } from '../support/fixtures/makePool'
import { deliverInfinitePayPaidWebhook } from '../support/payments'
import { footballDataStub } from '../support/stubs'

const KICKOFF = new Date('2026-07-10T18:00:00.000Z')
const BEFORE = new Date('2026-07-10T17:00:00.000Z')
const AFTER = new Date('2026-07-10T21:00:00.000Z')

type KnockoutResult = {
  homeScore: number // 90-minute score
  awayScore: number
  winner: 'home' | 'away'
  duration: 'regular' | 'extra_time' | 'penalty_shootout'
  extraTimeHome?: number | null
  extraTimeAway?: number | null
  penaltyHome?: number | null
  penaltyAway?: number | null
}

describe('Knockout scoring (integration)', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })
  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  async function settleKnockout(matchId: string, r: KnockoutResult) {
    await sql`
      UPDATE "match"
      SET status = 'finished',
          home_score = ${r.homeScore},
          away_score = ${r.awayScore},
          winner = ${r.winner},
          duration = ${r.duration},
          extra_time_home_score = ${r.extraTimeHome ?? null},
          extra_time_away_score = ${r.extraTimeAway ?? null},
          penalty_home_score = ${r.penaltyHome ?? null},
          penalty_away_score = ${r.penaltyAway ?? null},
          updated_at = NOW()
      WHERE id = ${matchId}
    `
  }

  // --- US1: ingestion grades on the 90-minute score, never the inflated fullTime ---

  it('ingests a penalty-shootout fixture storing the 90-minute score, not the inflated fullTime', async () => {
    const { container } = buildTestApp({ initialNow: BEFORE })
    const comp = await makeCompetition(sql, { type: 'cup' })

    const fixture: ExternalMatch = {
      id: 7_000_001,
      utcDate: KICKOFF.toISOString(),
      status: 'FINISHED',
      stage: 'QUARTER_FINALS',
      group: null,
      matchday: null,
      homeTeam: { name: 'Argentina', crest: '' },
      awayTeam: { name: 'França', crest: '' },
      score: {
        winner: 'AWAY_TEAM',
        duration: 'PENALTY_SHOOTOUT',
        fullTime: { home: 6, away: 5 }, // provider inflates with penalties — must be ignored
        regularTime: { home: 1, away: 1 },
        extraTime: { home: 0, away: 0 },
        penalties: { home: 4, away: 5 },
      },
    }
    footballDataStub.setFixtures([fixture])

    const useCase = new SyncFixturesUseCase({
      footballApi: new FootballDataApiAdapter('test-token'),
      matchRepo: container.matchRepo,
      findActiveCompetitions: async () => [
        {
          id: comp.id,
          externalId: comp.externalId,
          season: comp.season,
          type: comp.type,
          name: comp.name,
        },
      ],
    })
    await useCase.execute()

    const [row] = await sql<
      {
        home_score: number
        away_score: number
        winner: string
        duration: string
        penalty_home_score: number
        penalty_away_score: number
        stage: string
      }[]
    >`
      SELECT home_score, away_score, winner, duration, penalty_home_score, penalty_away_score, stage
      FROM "match" WHERE external_id = 7000001
    `
    expect(row).toBeTruthy()
    // graded scoreline is the 90' score (1-1), never the 6-5 fullTime
    expect(row?.home_score).toBe(1)
    expect(row?.away_score).toBe(1)
    expect(row?.winner).toBe('away')
    expect(row?.duration).toBe('penalty_shootout')
    expect(row?.penalty_home_score).toBe(4)
    expect(row?.penalty_away_score).toBe(5)
    expect(row?.stage).toBe('quarter')
  })

  // --- US2: the advance pick differentiates two identical scoreline predictions ---

  async function seedTwoMemberPool() {
    const { app, clock } = buildTestApp({ initialNow: BEFORE })
    const comp = await makeCompetition(sql, { type: 'cup' })
    const admin = await signInViaPhoneOtp(app, { phoneNumber: '+5511933340001' })
    const pool = await makePool({ admin, competitionId: comp.id, entryFeeCentavos: 10_000 })
    await deliverInfinitePayPaidWebhook(app, pool.paymentId)

    const player = await signInViaPhoneOtp(app, { phoneNumber: '+5511933340002' })
    const joinResp = await player.fetch(`/api/pools/${pool.id}/join`, { method: 'POST' })
    const joinBody = (await joinResp.json()) as { payment: { id: string } }
    await deliverInfinitePayPaidWebhook(app, joinBody.payment.id)

    return { app, clock, comp, admin, player, pool }
  }

  async function predict(
    user: { fetch: (p: string, init?: RequestInit) => Promise<Response> },
    poolId: string,
    matchId: string,
    body: { homeScore: number; awayScore: number; advancePick?: 'home' | 'away' },
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

  it('on penalties, two identical 1-1 predictions differ by exactly 2 based on the advance pick', async () => {
    const { clock, comp, admin, player, pool } = await seedTwoMemberPool()
    const match = await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: KICKOFF,
      stage: 'quarter',
      homeTeam: 'Brasil',
      awayTeam: 'Croácia',
    })

    await predict(admin, pool.id, match.id, { homeScore: 1, awayScore: 1, advancePick: 'home' })
    await predict(player, pool.id, match.id, { homeScore: 1, awayScore: 1, advancePick: 'away' })

    clock.setNow(AFTER)
    // 1-1 at 90', home advances 5-4 on penalties
    await settleKnockout(match.id, {
      homeScore: 1,
      awayScore: 1,
      winner: 'home',
      duration: 'penalty_shootout',
      penaltyHome: 5,
      penaltyAway: 4,
    })
    await calcPointsForMatch(match.id)

    const adminPts = await pointsFor(admin.id, match.id)
    const playerPts = await pointsFor(player.id, match.id)
    expect(adminPts).toBe(12) // exact draw (10) + advance (+2)
    expect(playerPts).toBe(10) // exact draw (10), wrong pick (0)
    expect((adminPts ?? 0) - (playerPts ?? 0)).toBe(2)
  })

  it('awards the advance bonus when the match is decided in extra time too', async () => {
    const { clock, comp, admin, pool } = await seedTwoMemberPool()
    const match = await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: KICKOFF,
      stage: 'semi',
      homeTeam: 'Espanha',
      awayTeam: 'Portugal',
    })

    // predicts the 90' draw and that home advances
    await predict(admin, pool.id, match.id, { homeScore: 0, awayScore: 0, advancePick: 'home' })

    clock.setNow(AFTER)
    // 0-0 at 90', home wins 1-0 in extra time
    await settleKnockout(match.id, {
      homeScore: 0,
      awayScore: 0,
      winner: 'home',
      duration: 'extra_time',
      extraTimeHome: 1,
      extraTimeAway: 0,
    })
    await calcPointsForMatch(match.id)

    expect(await pointsFor(admin.id, match.id)).toBe(12) // exact draw (10) + advance (+2)
  })

  it('does not award the advance bonus when the knockout is decided in regular time', async () => {
    const { clock, comp, admin, pool } = await seedTwoMemberPool()
    const match = await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: KICKOFF,
      stage: 'final',
      homeTeam: 'Brasil',
      awayTeam: 'Argentina',
    })

    await predict(admin, pool.id, match.id, { homeScore: 2, awayScore: 1, advancePick: 'home' })

    clock.setNow(AFTER)
    // 2-1 in regular time
    await settleKnockout(match.id, {
      homeScore: 2,
      awayScore: 1,
      winner: 'home',
      duration: 'regular',
    })
    await calcPointsForMatch(match.id)

    expect(await pointsFor(admin.id, match.id)).toBe(10) // exact (10), no bonus in regular time
  })
})
