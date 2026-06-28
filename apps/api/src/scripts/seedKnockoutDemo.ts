/**
 * Demo seeder for the knockout-scoring feature (023-knockout-scoring).
 *
 * Creates two pools over the "Copa do Mundo 2026" competition with knockout
 * matches in every relevant state so each feature can be seen in the browser:
 *   - the "who advances" radio (a scheduled Final),
 *   - the new 10/8/7/5/0 scale,
 *   - the +2 advance bonus on extra time AND on penalties,
 *   - a knockout decided in regular time (advance pick has no effect),
 *   - the corrected scoreline (1-1, not the inflated 6-5).
 *
 * Points are computed by the real domain policies, never hardcoded. Idempotent:
 * re-running cleans up its own pools/matches first.
 *
 * Run (after `db:push` has added the 0011 columns to the dev DB):
 *   pnpm -C apps/api db:seed-knockout
 */
import { inArray } from 'drizzle-orm'
import { db } from '../db/client'
import { user } from '../db/schema/auth'
import { competition } from '../db/schema/competition'
import { match } from '../db/schema/match'
import { payment } from '../db/schema/payment'
import { pool } from '../db/schema/pool'
import { poolMember } from '../db/schema/poolMember'
import { prediction } from '../db/schema/prediction'
import { knockoutContextFor } from '../domain/match/KnockoutResult'
import { RangeScoringPolicy, SingleMatchScoringPolicy } from '../domain/scoring/ScoringPolicy'

const COMP_ID = '00000000-0000-0000-0000-000000000001'
const KO_EXTERNAL_IDS = [2001, 2002, 2003, 2004]
const DEMO_INVITE_CODES = ['MATAMATA26', 'PENALTI26']

const USERS = [
  { id: 'user-1', name: 'Igor', phoneNumber: '+5511999999999' },
  { id: 'user-2', name: 'Maria', phoneNumber: '+5511888888888' },
  { id: 'user-3', name: 'Pedro', phoneNumber: '+5511777777777' },
]

type AdvanceSide = 'home' | 'away'

type KoMatch = {
  externalId: number
  stage: string
  homeTeam: string
  awayTeam: string
  status: string
  homeScore: number | null
  awayScore: number | null
  extraTimeHomeScore: number | null
  extraTimeAwayScore: number | null
  penaltyHomeScore: number | null
  penaltyAwayScore: number | null
  winner: string | null
  duration: string | null
  matchDate: Date
}

function daysFromNow(d: number): Date {
  return new Date(Date.now() + d * 24 * 60 * 60 * 1000)
}

// The four knockout fixtures, each showcasing one decision type.
const KO_MATCHES: KoMatch[] = [
  {
    externalId: 2001,
    stage: 'round-of-16',
    homeTeam: 'Brasil',
    awayTeam: 'Croácia',
    status: 'finished', // 0-0 at 90', won 1-0 in extra time → Brasil advances
    homeScore: 0,
    awayScore: 0,
    extraTimeHomeScore: 1,
    extraTimeAwayScore: 0,
    penaltyHomeScore: null,
    penaltyAwayScore: null,
    winner: 'home',
    duration: 'extra_time',
    matchDate: daysFromNow(-6),
  },
  {
    externalId: 2002,
    stage: 'quarter',
    homeTeam: 'Argentina',
    awayTeam: 'França',
    status: 'finished', // 1-1 at 90', França wins 5-4 on penalties → França advances
    homeScore: 1,
    awayScore: 1,
    extraTimeHomeScore: 0,
    extraTimeAwayScore: 0,
    penaltyHomeScore: 4,
    penaltyAwayScore: 5,
    winner: 'away',
    duration: 'penalty_shootout',
    matchDate: daysFromNow(-4),
  },
  {
    externalId: 2003,
    stage: 'semi',
    homeTeam: 'Espanha',
    awayTeam: 'Portugal',
    status: 'finished', // 2-1 in regular time → advance pick has no effect
    homeScore: 2,
    awayScore: 1,
    extraTimeHomeScore: null,
    extraTimeAwayScore: null,
    penaltyHomeScore: null,
    penaltyAwayScore: null,
    winner: 'home',
    duration: 'regular',
    matchDate: daysFromNow(-2),
  },
  {
    externalId: 2004,
    stage: 'final',
    homeTeam: 'Brasil',
    awayTeam: 'França',
    status: 'scheduled', // open → predict + use the "who advances" radio
    homeScore: null,
    awayScore: null,
    extraTimeHomeScore: null,
    extraTimeAwayScore: null,
    penaltyHomeScore: null,
    penaltyAwayScore: null,
    winner: null,
    duration: null,
    matchDate: daysFromNow(3),
  },
]

// Pool A — whole-competition. Predictions chosen to land on every scale tier.
const POOL_A_PREDS: Record<number, { u: string; h: number; a: number; adv: AdvanceSide | null }[]> =
  {
    2001: [
      { u: 'user-1', h: 0, a: 0, adv: 'home' }, // exact draw (10) + advance (+2) = 12
      { u: 'user-2', h: 0, a: 0, adv: 'away' }, // exact draw (10), wrong pick = 10
      { u: 'user-3', h: 1, a: 0, adv: 'home' }, // predicted a winner; 90' was a draw → miss (0) + advance (+2) = 2
    ],
    2002: [
      { u: 'user-1', h: 1, a: 1, adv: 'away' }, // exact draw (10) + advance (+2) = 12
      { u: 'user-2', h: 2, a: 2, adv: 'away' }, // correct draw, not exact (5) + advance (+2) = 7
      { u: 'user-3', h: 1, a: 1, adv: 'home' }, // exact draw (10), wrong pick = 10
    ],
    2003: [
      { u: 'user-1', h: 2, a: 1, adv: null }, // exact (10) — regular time, pick irrelevant
      { u: 'user-2', h: 2, a: 0, adv: null }, // winner + winner's goals (8)
      { u: 'user-3', h: 3, a: 2, adv: null }, // winner + goal difference, same margin 1 (7)
    ],
  }

// Pool B — single-match on the penalty quarter (shows category + proximity + advance bonus).
const POOL_B_PREDS: { u: string; h: number; a: number; adv: AdvanceSide | null }[] = [
  { u: 'user-1', h: 1, a: 1, adv: 'away' }, // 10 + proximity 4 + advance 2 = 16
  { u: 'user-2', h: 0, a: 0, adv: 'away' }, // 5 + proximity + advance 2
  { u: 'user-3', h: 2, a: 1, adv: 'home' }, // 0 + proximity, wrong pick
]

async function ensureUsers() {
  for (const u of USERS) {
    await db
      .insert(user)
      .values({ ...u, phoneNumberVerified: true, emailVerified: false })
      .onConflictDoNothing()
  }
}

async function ensureCompetition() {
  await db
    .insert(competition)
    .values({
      id: COMP_ID,
      externalId: 'WC',
      name: 'Copa do Mundo 2026',
      season: '2026',
      type: 'cup',
      status: 'active',
    })
    .onConflictDoNothing()
}

async function cleanup() {
  const demoPools = await db.query.pool.findMany({
    where: inArray(pool.inviteCode, DEMO_INVITE_CODES),
  })
  const poolIds = demoPools.map((p) => p.id)
  if (poolIds.length > 0) {
    // FK-dependency order: poolMember → payment → pool (poolMember references
    // payment, payment references pool). Deleting pool before payment violated
    // payment_pool_id_pool_id_fk and broke every re-run on an already-seeded DB.
    await db.delete(prediction).where(inArray(prediction.poolId, poolIds))
    await db.delete(poolMember).where(inArray(poolMember.poolId, poolIds))
    await db.delete(payment).where(inArray(payment.poolId, poolIds))
    await db.delete(pool).where(inArray(pool.id, poolIds))
  }

  const koMatches = await db.query.match.findMany({
    where: inArray(match.externalId, KO_EXTERNAL_IDS),
  })
  const matchIds = koMatches.map((m) => m.id)
  if (matchIds.length > 0) {
    await db.delete(prediction).where(inArray(prediction.matchId, matchIds))
    await db.delete(match).where(inArray(match.id, matchIds))
  }
}

async function insertKnockoutMatches(): Promise<Map<number, KoMatch & { id: string }>> {
  const byExternalId = new Map<number, KoMatch & { id: string }>()
  for (const m of KO_MATCHES) {
    const [row] = await db
      .insert(match)
      .values({
        competitionId: COMP_ID,
        externalId: m.externalId,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        extraTimeHomeScore: m.extraTimeHomeScore,
        extraTimeAwayScore: m.extraTimeAwayScore,
        penaltyHomeScore: m.penaltyHomeScore,
        penaltyAwayScore: m.penaltyAwayScore,
        winner: m.winner,
        duration: m.duration,
        stage: m.stage,
        group: null,
        matchday: null,
        matchDate: m.matchDate,
        status: m.status,
      })
      .returning()
    if (!row) throw new Error(`failed to insert match ${m.externalId}`)
    byExternalId.set(m.externalId, { ...m, id: row.id })
  }
  return byExternalId
}

async function addMembers(poolId: string) {
  for (const u of USERS) {
    const [pay] = await db
      .insert(payment)
      .values({
        userId: u.id,
        poolId,
        amount: 5000,
        platformFee: 250,
        status: 'completed',
        type: 'entry',
      })
      .returning()
    if (!pay) throw new Error('failed to insert payment')
    await db.insert(poolMember).values({ poolId, userId: u.id, paymentId: pay.id })
  }
}

function rangePoints(m: KoMatch & { id: string }, h: number, a: number, adv: AdvanceSide | null) {
  if (m.homeScore === null || m.awayScore === null) return null
  return RangeScoringPolicy.score(h, a, m.homeScore, m.awayScore, knockoutContextFor(m, adv)).points
}

function singleMatchPoints(
  m: KoMatch & { id: string },
  h: number,
  a: number,
  adv: AdvanceSide | null,
) {
  if (m.homeScore === null || m.awayScore === null) return null
  return SingleMatchScoringPolicy.score(h, a, m.homeScore, m.awayScore, knockoutContextFor(m, adv))
    .points
}

async function createWholeCompetitionPool(matches: Map<number, KoMatch & { id: string }>) {
  const [p] = await db
    .insert(pool)
    .values({
      name: 'Bolão Mata-Mata (Demo)',
      entryFee: 5000,
      ownerId: 'user-1',
      inviteCode: 'MATAMATA26',
      competitionId: COMP_ID,
    })
    .returning()
  if (!p) throw new Error('failed to insert pool A')
  await addMembers(p.id)

  for (const externalId of [2001, 2002, 2003]) {
    const m = matches.get(externalId)
    if (!m) continue
    for (const pred of POOL_A_PREDS[externalId] ?? []) {
      await db.insert(prediction).values({
        userId: pred.u,
        poolId: p.id,
        matchId: m.id,
        homeScore: pred.h,
        awayScore: pred.a,
        advancePick: pred.adv,
        points: rangePoints(m, pred.h, pred.a, pred.adv),
      })
    }
  }
  return p.id
}

async function createSingleMatchPool(matches: Map<number, KoMatch & { id: string }>) {
  const m = matches.get(2002)
  if (!m) throw new Error('penalty quarter match missing')
  const [p] = await db
    .insert(pool)
    .values({
      name: 'Mata-Mata: Pênaltis (Jogo Único)',
      entryFee: 5000,
      ownerId: 'user-1',
      inviteCode: 'PENALTI26',
      competitionId: COMP_ID,
      matchId: m.id,
    })
    .returning()
  if (!p) throw new Error('failed to insert pool B')
  await addMembers(p.id)

  for (const pred of POOL_B_PREDS) {
    await db.insert(prediction).values({
      userId: pred.u,
      poolId: p.id,
      matchId: m.id,
      homeScore: pred.h,
      awayScore: pred.a,
      advancePick: pred.adv,
      points: singleMatchPoints(m, pred.h, pred.a, pred.adv),
    })
  }
  return p.id
}

async function seedKnockoutDemo() {
  console.log('Seeding knockout demo...')
  await ensureUsers()
  await ensureCompetition()
  await cleanup()
  const matches = await insertKnockoutMatches()
  const poolAId = await createWholeCompetitionPool(matches)
  const poolBId = await createSingleMatchPool(matches)

  console.log('\n✅ Knockout demo ready. Log in as Igor (+5511999999999).\n')
  console.log('Pool "Bolão Mata-Mata (Demo)" — invite MATAMATA26 — id', poolAId)
  console.log('  • Aba Mata-Mata → Final (Brasil x França): radio "Quem se classifica?" aberto.')
  console.log('  • Oitavas (0-0, prorrogação): Igor 12 (10 + 2), Pedro 2 (0 + 2).')
  console.log('  • Quartas (1-1, pênaltis): placar 1×1 + "França se classificou (pênaltis 5×4)".')
  console.log('  • Semi (2-1, normal): escala nova — Maria 8 (vencedor + gols), Pedro 7 (saldo).')
  console.log('Pool "Mata-Mata: Pênaltis (Jogo Único)" — invite PENALTI26 — id', poolBId)
  console.log('  • Breakdown do jogo único: Igor 16 (10 + 4 proximidade + 2 classificado).')
  console.log('\nSeed complete!')
  process.exit(0)
}

seedKnockoutDemo().catch((err) => {
  console.error('Knockout demo seed failed:', err)
  process.exit(1)
})
