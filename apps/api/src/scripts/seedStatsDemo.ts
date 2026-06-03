/**
 * Seeds EIGHT test cases for the per-participant statistics feature on the REAL
 * "Copa do Mundo 2026" competition, using a self-contained "demo group" of
 * fixtures with real team names but DISTINCT external ids and out-of-band
 * matchdays (81-84). This is deliberate: the match sync re-imports the real
 * fixtures from the provider (where WC 2026 is still unplayed = scheduled), so
 * any real fixture we mark "finished" gets reverted on the next sync — which
 * would leave the panel with stale/zero data. Distinct external ids are ignored
 * by the sync, so the demo stays consistent.
 *
 * Run:  cd apps/api && pnpm db:seed-stats
 *       pnpm db:seed-stats -- --phone +5511990001122
 *       pnpm db:seed-stats -- --clean
 *
 * Idempotent: re-running first removes the previous demo (pools, users, fixtures)
 * and never deletes the real competition.
 */
import { and, eq, gte, inArray, like } from 'drizzle-orm'
import { getContainer } from '../container'
import { db } from '../db/client'
import { user } from '../db/schema/auth'
import { competition } from '../db/schema/competition'
import { match } from '../db/schema/match'
import { participantPoolStats } from '../db/schema/participantPoolStats'
import { payment } from '../db/schema/payment'
import { pool } from '../db/schema/pool'
import { poolMember } from '../db/schema/poolMember'
import { poolStanding } from '../db/schema/poolStanding'
import { prediction } from '../db/schema/prediction'
import { statsUnlock } from '../db/schema/statsUnlock'
import { calcPointsForMatch } from '../jobs/calcPoints'

const REAL_COMP_EXTERNAL_ID = 'WC'
const REAL_COMP_NAME = 'Copa do Mundo 2026'
const POOL_NAME_PREFIX = 'Copa — '
const RIVAL_ID_PREFIX = 'demo-wc-rival-'
// Demo fixtures: distinct external ids (sync-immune) and out-of-band matchdays.
const DEMO_EXT_BASE = 999_900_000
const PENDING_MD = 84
const DAY = 24 * 60 * 60 * 1000

const args = process.argv.slice(2)
const argValue = (flag: string) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}
const TARGET_PHONE = argValue('--phone') ?? '+5511990009999'
const CLEAN_ONLY = args.includes('--clean')

type Score = [number, number]
type Profile = 'exact' | 'homeBias' | 'awayBias' | 'lowAce' | 'average' | 'weak'

// Demo "group stage": rounds 81/82/83 with 5/6/7 fixtures (uneven → non-flat
// chart). Scores chosen so every dimension clears the suggestion threshold:
// 7 home wins, 6 away wins, 5 draws; 10 low (<=2 goals), 8 high.
const FINISHED: Array<{ md: number; home: string; away: string; actual: Score }> = [
  // round 81 (5)
  { md: 81, home: 'Brasil', away: 'Sérvia', actual: [1, 0] },
  { md: 81, home: 'Argentina', away: 'México', actual: [0, 1] },
  { md: 81, home: 'Espanha', away: 'Alemanha', actual: [3, 1] },
  { md: 81, home: 'Inglaterra', away: 'EUA', actual: [1, 2] },
  { md: 81, home: 'França', away: 'Dinamarca', actual: [2, 2] },
  // round 82 (6)
  { md: 82, home: 'Portugal', away: 'Uruguai', actual: [2, 0] },
  { md: 82, home: 'Holanda', away: 'Equador', actual: [0, 2] },
  { md: 82, home: 'Croácia', away: 'Marrocos', actual: [1, 1] },
  { md: 82, home: 'Bélgica', away: 'Canadá', actual: [4, 2] },
  { md: 82, home: 'Japão', away: 'Senegal', actual: [1, 3] },
  { md: 82, home: 'Suíça', away: 'Camarões', actual: [0, 0] },
  // round 83 (7)
  { md: 83, home: 'Brasil', away: 'França', actual: [3, 0] },
  { md: 83, home: 'Argentina', away: 'Espanha', actual: [0, 1] },
  { md: 83, home: 'Inglaterra', away: 'Alemanha', actual: [2, 1] },
  { md: 83, home: 'Portugal', away: 'Holanda', actual: [1, 1] },
  { md: 83, home: 'Uruguai', away: 'Croácia', actual: [2, 3] },
  { md: 83, home: 'México', away: 'Polônia', actual: [1, 0] },
  { md: 83, home: 'EUA', away: 'Gales', actual: [0, 0] },
]

// Knockout (matchday 84), unplayed → the pending matches the impact ranks.
const UPCOMING: Array<{ home: string; away: string }> = [
  { home: 'Brasil', away: 'Argentina' },
  { home: 'França', away: 'Espanha' },
  { home: 'Portugal', away: 'Holanda' },
]

function predict(profile: Profile, [h, a]: Score): Score {
  switch (profile) {
    case 'exact':
      return [h, a]
    case 'homeBias':
      return [2, 1]
    case 'awayBias':
      return [1, 2]
    case 'lowAce':
      return h + a <= 2 ? [h, a] : [0, 0]
    case 'average':
      return h > a ? [1, 0] : a > h ? [0, 1] : [0, 0]
    case 'weak':
      return [3, 3]
  }
}

type Scope = { kind: 'range'; from: number; to: number } | { kind: 'single' }
const GROUP: Scope = { kind: 'range', from: 81, to: PENDING_MD }
const KNOCKOUT_ONLY: Scope = { kind: 'range', from: PENDING_MD, to: PENDING_MD }
const SINGLE: Scope = { kind: 'single' }

type Scenario = {
  name: string
  scope: Scope
  target: Profile
  rivals: Profile[]
  unlock: boolean
  trend?: 'rising' | 'falling'
  predictUpcoming: boolean
  explanation: string
  why: string
}

const SCENARIOS: Scenario[] = [
  {
    name: `${POOL_NAME_PREFIX}Você é o LÍDER`,
    scope: GROUP,
    target: 'exact',
    rivals: ['average', 'weak', 'weak'],
    unlock: true,
    trend: 'rising',
    predictUpcoming: true,
    explanation: 'Painel de quem lidera o bolão (melhor caso).',
    why: 'Você cravou o placar de todos os jogos → líder: gap 0, aproveitamento 100%/100%, eficiência máxima. O gráfico de rodadas sobe (5/6/7 jogos → 50/60/70 pts). Sem dica (forte em tudo). Tendência "subindo".',
  },
  {
    name: `${POOL_NAME_PREFIX}Mando de campo forte`,
    scope: GROUP,
    target: 'homeBias',
    rivals: ['exact', 'average', 'weak'],
    unlock: true,
    trend: 'falling',
    predictUpcoming: true,
    explanation: 'Dispara a dica "mando de campo" + comparação com o líder.',
    why: 'Você sempre aposta no mandante → acerta 100% dos 7 jogos que o mandante venceu e 0% dos 6 que o visitante venceu → dica de mando. Um rival cravou tudo (líder). Tendência "caindo".',
  },
  {
    name: `${POOL_NAME_PREFIX}Visitante forte`,
    scope: GROUP,
    target: 'awayBias',
    rivals: ['exact', 'average', 'weak'],
    unlock: true,
    predictUpcoming: true,
    explanation: 'Dispara a dica "visitante".',
    why: 'Você só aposta no visitante → acerta os 6 jogos de virada de fora e erra os de mando → dica de visitante.',
  },
  {
    name: `${POOL_NAME_PREFIX}Placares baixos`,
    scope: GROUP,
    target: 'lowAce',
    rivals: ['exact', 'average', 'weak'],
    unlock: true,
    predictUpcoming: true,
    explanation: 'Dispara a dica "placares baixos".',
    why: 'Você crava os 10 jogos de poucos gols (≤2) e erra os 8 de muitos → acerto em poucos gols >> muitos gols → dica de placares baixos.',
  },
  {
    name: `${POOL_NAME_PREFIX}Disputa apertada (impacto ALTO)`,
    scope: GROUP,
    target: 'average',
    rivals: ['average', 'average', 'average'],
    unlock: true,
    predictUpcoming: false,
    explanation: 'Jogos pendentes de ALTO impacto + ação "Palpitar".',
    why: 'Todos jogam igual → ficam colados na tabela (rivais ao seu alcance) → os jogos pendentes aparecem como "Alto impacto", e a linha de cada jogo explica o porquê. Você não palpitou neles → ação "Palpitar". (Aqui todos têm o MESMO aproveitamento, então as barras de "vs média" ficam iguais — é esperado.)',
  },
  {
    name: `${POOL_NAME_PREFIX}Sem dados ainda`,
    scope: KNOCKOUT_ONLY,
    target: 'average',
    rivals: ['average', 'weak'],
    unlock: true,
    predictUpcoming: true,
    explanation: 'Estado "dados insuficientes ainda".',
    why: 'Bolão só das oitavas (ainda não jogadas) → nenhum jogo finalizado → os 4 blocos mostram "Dados insuficientes ainda", mas os jogos pendentes continuam listados.',
  },
  {
    name: `${POOL_NAME_PREFIX}Jogo único (máx 14 pts)`,
    scope: SINGLE,
    target: 'exact',
    rivals: ['exact', 'average', 'weak'],
    unlock: true,
    predictUpcoming: false,
    explanation: 'Bolão de um jogo só — pontuação vai até 14 (não 10).',
    why: 'Em bolão de jogo único a pontuação máxima é 14 (10 do placar exato + 4 de bônus de proximidade). Você cravou Brasil 1×0 → 14/14, eficiência 100%, 0 na mesa. Compare com os bolões de competição inteira (máx 10).',
  },
  {
    name: `${POOL_NAME_PREFIX}Trancado (paywall)`,
    scope: GROUP,
    target: 'average',
    rivals: ['average'],
    unlock: false,
    predictUpcoming: true,
    explanation: 'Paywall: teaser + preço, sem nenhuma estatística.',
    why: 'Você é membro mas NÃO desbloqueou → a API (gate server-side) devolve só o teaser borrado + "Desbloquear por R$ 1,99". Nenhum dado calculado é exposto.',
  },
]

function inviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

async function findRealComp(): Promise<{ id: string; name: string } | null> {
  const byExt = await db.query.competition.findFirst({
    where: eq(competition.externalId, REAL_COMP_EXTERNAL_ID),
  })
  if (byExt) return byExt
  return (
    (await db.query.competition.findFirst({ where: eq(competition.name, REAL_COMP_NAME) })) ?? null
  )
}

async function deletePoolsCascade(poolIds: string[]): Promise<void> {
  if (poolIds.length === 0) return
  await db.delete(participantPoolStats).where(inArray(participantPoolStats.poolId, poolIds))
  await db.delete(statsUnlock).where(inArray(statsUnlock.poolId, poolIds))
  await db.delete(poolStanding).where(inArray(poolStanding.poolId, poolIds))
  await db.delete(prediction).where(inArray(prediction.poolId, poolIds))
  await db.delete(poolMember).where(inArray(poolMember.poolId, poolIds))
  await db.delete(payment).where(inArray(payment.poolId, poolIds))
  await db.delete(pool).where(inArray(pool.id, poolIds))
}

async function cleanDemo(realCompId: string | null): Promise<void> {
  if (realCompId) {
    const demoPools = await db
      .select({ id: pool.id })
      .from(pool)
      .where(and(eq(pool.competitionId, realCompId), like(pool.name, `${POOL_NAME_PREFIX}%`)))
    await deletePoolsCascade(demoPools.map((p) => p.id))
    // Remove the demo fixtures (distinct external-id range).
    await db
      .delete(match)
      .where(and(eq(match.competitionId, realCompId), gte(match.externalId, DEMO_EXT_BASE)))
  }

  // Older self-contained demo competitions, removed entirely.
  const oldComps = await db
    .select({ id: competition.id })
    .from(competition)
    .where(inArray(competition.externalId, ['DEMO-STATS', 'DEMO-WC-STATS']))
  const oldIds = oldComps.map((c) => c.id)
  if (oldIds.length > 0) {
    const oldPools = await db
      .select({ id: pool.id })
      .from(pool)
      .where(inArray(pool.competitionId, oldIds))
    await deletePoolsCascade(oldPools.map((p) => p.id))
    await db.delete(match).where(inArray(match.competitionId, oldIds))
    await db.delete(competition).where(inArray(competition.id, oldIds))
  }

  await db.delete(user).where(like(user.id, `${RIVAL_ID_PREFIX}%`))
  await db.delete(user).where(like(user.id, 'demo-stats-rival-%'))
}

async function ensureTargetUser(): Promise<{ id: string }> {
  const existing = await db.query.user.findFirst({ where: eq(user.phoneNumber, TARGET_PHONE) })
  if (existing) return existing
  const [created] = await db
    .insert(user)
    .values({
      id: `demo-wc-target-${crypto.randomUUID().slice(0, 8)}`,
      name: 'Você (demo)',
      phoneNumber: TARGET_PHONE,
      phoneNumberVerified: true,
      emailVerified: false,
    })
    .returning()
  return created as NonNullable<typeof created>
}

async function createRivals(): Promise<string[]> {
  const ids: string[] = []
  for (const r of [
    { key: 'r1', name: 'Ana' },
    { key: 'r2', name: 'Bruno' },
    { key: 'r3', name: 'Carla' },
  ]) {
    const [u] = await db
      .insert(user)
      .values({
        id: `${RIVAL_ID_PREFIX}${r.key}`,
        name: r.name,
        phoneNumber: `+55119${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
        phoneNumberVerified: true,
        emailVerified: false,
      })
      .returning()
    ids.push((u as NonNullable<typeof u>).id)
  }
  return ids
}

type FinishedFixture = { id: string; md: number; actual: Score }

async function addFixtures(
  compId: string,
): Promise<{ finished: FinishedFixture[]; pendingIds: string[] }> {
  const finished: FinishedFixture[] = []
  let ext = DEMO_EXT_BASE + 1
  let i = 0
  for (const f of FINISHED) {
    const [m] = await db
      .insert(match)
      .values({
        competitionId: compId,
        externalId: ext++,
        homeTeam: f.home,
        awayTeam: f.away,
        homeFlag: '',
        awayFlag: '',
        homeScore: f.actual[0],
        awayScore: f.actual[1],
        stage: 'group',
        matchday: f.md,
        matchDate: new Date(Date.now() - (FINISHED.length - i++ + 2) * DAY),
        status: 'finished',
      })
      .returning()
    finished.push({ id: (m as NonNullable<typeof m>).id, md: f.md, actual: f.actual })
  }

  const pendingIds: string[] = []
  for (let k = 0; k < UPCOMING.length; k++) {
    const u = UPCOMING[k]!
    const [m] = await db
      .insert(match)
      .values({
        competitionId: compId,
        externalId: ext++,
        homeTeam: u.home,
        awayTeam: u.away,
        homeFlag: '',
        awayFlag: '',
        stage: 'round-of-16',
        matchday: PENDING_MD,
        matchDate: new Date(Date.now() + (k + 2) * DAY),
        status: 'scheduled',
      })
      .returning()
    pendingIds.push((m as NonNullable<typeof m>).id)
  }

  return { finished, pendingIds }
}

async function makeMember(poolId: string, userId: string): Promise<void> {
  const [pay] = await db
    .insert(payment)
    .values({
      userId,
      poolId,
      amount: 5000,
      platformFee: 250,
      externalPaymentId: `demo-entry-${crypto.randomUUID()}`,
      status: 'completed',
      type: 'entry',
    })
    .returning()
  await db.insert(poolMember).values({ poolId, userId, paymentId: pay!.id })
}

function finishedInScope(
  scope: Scope,
  finished: FinishedFixture[],
  singleId: string | null,
): FinishedFixture[] {
  if (scope.kind === 'single') return finished.filter((f) => f.id === singleId)
  return finished.filter((f) => f.md >= scope.from && f.md <= scope.to)
}

async function buildPool(
  sc: Scenario,
  compId: string,
  targetId: string,
  rivalIds: string[],
  finished: FinishedFixture[],
  pendingIds: string[],
): Promise<string> {
  const singleId = sc.scope.kind === 'single' ? (finished[0]?.id ?? null) : null
  const range = sc.scope.kind === 'range' ? sc.scope : null

  const [p] = await db
    .insert(pool)
    .values({
      name: sc.name,
      entryFee: 5000,
      ownerId: targetId,
      inviteCode: inviteCode(),
      competitionId: compId,
      matchdayFrom: range?.from ?? null,
      matchdayTo: range?.to ?? null,
      matchId: singleId,
      isOpen: true,
      status: 'active',
    })
    .returning()
  const poolId = (p as NonNullable<typeof p>).id

  for (const uid of [targetId, ...rivalIds.slice(0, sc.rivals.length)]) {
    await makeMember(poolId, uid)
  }

  for (const f of finishedInScope(sc.scope, finished, singleId)) {
    const rows = [
      { userId: targetId, s: predict(sc.target, f.actual) },
      ...sc.rivals.map((profile, idx) => ({
        userId: rivalIds[idx]!,
        s: predict(profile, f.actual),
      })),
    ]
    await db.insert(prediction).values(
      rows.map((r) => ({
        userId: r.userId,
        poolId,
        matchId: f.id,
        homeScore: r.s[0],
        awayScore: r.s[1],
      })),
    )
  }

  // Target predicts the first in-scope pending → "Revisar"; the rest "Palpitar".
  if (sc.predictUpcoming && pendingIds[0]) {
    await db
      .insert(prediction)
      .values({ userId: targetId, poolId, matchId: pendingIds[0], homeScore: 1, awayScore: 0 })
  }

  return poolId
}

async function unlockAndTrend(poolId: string, targetId: string, trend?: 'rising' | 'falling') {
  const [unlockPay] = await db
    .insert(payment)
    .values({
      userId: targetId,
      poolId,
      amount: 199,
      platformFee: 199,
      externalPaymentId: `demo-stats-unlock-${crypto.randomUUID()}`,
      status: 'completed',
      type: 'stats_unlock',
    })
    .returning()
  await db
    .insert(statsUnlock)
    .values({
      userId: targetId,
      poolId,
      paymentId: (unlockPay as NonNullable<typeof unlockPay>).id,
    })
    .onConflictDoNothing({ target: [statsUnlock.userId, statsUnlock.poolId] })
  await getContainer().statsRepo.recomputeSnapshot(poolId, targetId)

  if (!trend) return
  const snap = await db.query.participantPoolStats.findFirst({
    where: and(eq(participantPoolStats.poolId, poolId), eq(participantPoolStats.userId, targetId)),
    columns: { lastPosition: true },
  })
  const last = snap?.lastPosition
  if (last == null) return
  const prev = trend === 'rising' ? last + 1 : Math.max(1, last - 1)
  await db
    .update(participantPoolStats)
    .set({ prevPosition: prev })
    .where(and(eq(participantPoolStats.poolId, poolId), eq(participantPoolStats.userId, targetId)))
}

async function run(): Promise<void> {
  const realComp = await findRealComp()

  console.log('[seed-stats] limpando dados de demo anteriores...')
  await cleanDemo(realComp?.id ?? null)
  if (CLEAN_ONLY) {
    console.log('[seed-stats] limpeza concluída.')
    return
  }
  if (!realComp) {
    throw new Error(
      `Competição "${REAL_COMP_NAME}" não encontrada. Rode o match sync antes (ela precisa existir).`,
    )
  }
  const compId = realComp.id
  console.log(`[seed-stats] usando a competição real "${realComp.name}" (${compId})`)

  const target = await ensureTargetUser()
  const rivalIds = await createRivals()
  const { finished, pendingIds } = await addFixtures(compId)

  const built: Array<{ scenario: Scenario; poolId: string }> = []
  for (const sc of SCENARIOS) {
    const poolId = await buildPool(sc, compId, target.id, rivalIds, finished, pendingIds)
    built.push({ scenario: sc, poolId })
  }

  for (const f of finished) await calcPointsForMatch(f.id)

  for (const b of built) {
    if (b.scenario.unlock) await unlockAndTrend(b.poolId, target.id, b.scenario.trend)
  }

  await printGuide(built, target.id, realComp.name)
}

async function printGuide(
  built: Array<{ scenario: Scenario; poolId: string }>,
  targetId: string,
  compName: string,
): Promise<void> {
  console.log('\n=================================================================')
  console.log(`  DEMO ESTATÍSTICAS — competição real "${compName}"  (8 casos)`)
  console.log('=================================================================')
  console.log(`  Login:  ${TARGET_PHONE}   (OTP no console do "pnpm dev")`)
  console.log('=================================================================\n')

  for (let i = 0; i < built.length; i++) {
    const { scenario: sc, poolId } = built[i]!
    console.log(`[${i + 1}] ${sc.name}`)
    console.log(`    Abrir:      /pools/${poolId}/estatisticas`)
    console.log(`    Demonstra:  ${sc.explanation}`)
    console.log(`    Por quê:    ${sc.why}`)
    if (sc.unlock) {
      const snap = await db.query.participantPoolStats.findFirst({
        where: and(
          eq(participantPoolStats.poolId, poolId),
          eq(participantPoolStats.userId, targetId),
        ),
      })
      const standings = await db
        .select({ name: user.name, pts: poolStanding.pointsTotal })
        .from(poolStanding)
        .innerJoin(user, eq(user.id, poolStanding.userId))
        .where(eq(poolStanding.poolId, poolId))
        .orderBy(poolStanding.pointsTotal)
      const leader = standings[standings.length - 1]
      if (snap && snap.finishedCount > 0) {
        console.log(
          `    Dados:      pos ${snap.lastPosition ?? '—'} · ${snap.pointsTotal} pts (líder ${leader?.name ?? '?'} ${leader?.pts ?? 0}) · ` +
            `exatos ${snap.exactCount}/${snap.finishedCount} · resultado ${snap.resultCount}/${snap.finishedCount} · ` +
            `mando ${snap.homeCorrect}/${snap.homeTotal} · fora ${snap.awayCorrect}/${snap.awayTotal} · ` +
            `poucos ${snap.lowGoalsCorrect}/${snap.lowGoalsTotal} · muitos ${snap.highGoalsCorrect}/${snap.highGoalsTotal}`,
        )
      } else {
        console.log('    Dados:      sem jogos finalizados → blocos em "dados insuficientes"')
      }
    } else {
      console.log('    Dados:      TRANCADO → teaser + R$ 1,99 (nenhuma estatística exposta)')
    }
    console.log('')
  }
  console.log('=================================================================\n')
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed-stats] falhou:', err)
    process.exit(1)
  })
