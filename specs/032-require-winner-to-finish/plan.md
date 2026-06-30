# Require-a-winner-before-finished Implementation Plan

> **For agentic workers:** Implement task-by-task with TDD. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A match is never persisted as `finished` without a known `winner`; held matches stay `live` and self-heal when the winner arrives, or an admin finalizes them via Telegram buttons (which also re-scores).

**Architecture:** A single domain gate in `Match.deriveStatusFromApi` (returns `{ status, heldForWinner }`). The live-sync emits a held signal; `index.ts` applies a 3h grace + in-memory dedup and alerts admins via Telegram with inline winner buttons. A `finalize_match:*` callback runs a new `FinalizeMatchUseCase` that sets the winner + finished and re-runs the existing scoring path.

**Tech Stack:** TypeScript (strict), Hono, Drizzle ORM, grammY, Vitest.

## Global Constraints

- Hold state = existing `live` status; **no new MatchStatus value**.
- **No DB migration**; alert dedup is an in-memory `Set` in `index.ts`.
- Alert grace window = **3h after kickoff** (`HELD_ALERT_GRACE_MS`).
- Finalize accepts `winner ∈ {home, away, draw}`; **rejects `draw` on knockout stages**.
- Admin authz = existing `isAdmin(ctx.from.id)` + `ADMIN_USER_IDS`. No HTTP admin surface.
- All monetary values centavos (n/a here). Biome formatting; run `pnpm biome check --write` before commits.

## File Structure

- `apps/api/src/domain/match/Match.ts` — gate logic (modify `deriveStatusFromApi`).
- `apps/api/src/infrastructure/persistence/mappers/MatchMapper.ts` — forward winner; add `mapSyncStatus`.
- `apps/api/src/application/match/SyncLiveScoresUseCase.ts` — consume gate; emit held signal.
- `apps/api/src/domain/match/MatchRepository.port.ts` + `infrastructure/persistence/DrizzleMatchRepository.ts` — `finalizeWithWinner`.
- `apps/api/src/application/match/FinalizeMatchUseCase.ts` — new use-case.
- `apps/api/src/infrastructure/external/TelegramNotificationService.ts` — `notifyAdminMatchNeedsWinner`.
- `apps/api/src/lib/telegram.ts` — `finalize_match:*` callback handler.
- `apps/api/src/container.ts` — expose `finalizeMatchUseCase`.
- `apps/api/src/index.ts` — wire `onMatchHeldAwaitingWinner` (grace + dedup).
- Tests alongside each + an integration regression for `537418`.

---

### Task 1: Domain gate — `Match.deriveStatusFromApi`

**Files:**
- Modify: `apps/api/src/domain/match/Match.ts`
- Test: `apps/api/src/domain/match/Match.test.ts` (create if absent)

**Interfaces:**
- Produces: `Match.deriveStatusFromApi(input: { apiStatus, homeScore, awayScore, winner: string | null, kickoffAt, now, rawTranslator }): { status: MatchStatus; heldForWinner: boolean }`

- [ ] **Step 1: Write failing tests** covering: `FINISHED`+winner→`finished`,held=false; `FINISHED`+null→`live`,held=true; `IN_PLAY`+scores+stale+null→`live`,held=true; `IN_PLAY`+scores+stale+winner→`finished`,held=false; `IN_PLAY` not-stale→`live`,held=false; `SCHEDULED`→`scheduled`,held=false.

```ts
import { describe, expect, it } from 'vitest'
import { Match } from './Match'
import { MatchStatus } from './MatchStatus'

const raw = (s: string) => MatchStatus.from(
  ({ SCHEDULED: 'scheduled', IN_PLAY: 'live', PAUSED: 'live', FINISHED: 'finished' } as Record<string, string>)[s] ?? 'scheduled',
)
const base = { homeScore: 1, awayScore: 1, kickoffAt: new Date('2026-06-30T01:00:00Z'), rawTranslator: raw }

describe('deriveStatusFromApi winner gate', () => {
  const now = new Date('2026-06-30T03:30:00Z') // 2.5h after kickoff
  it('finishes when FINISHED with a winner', () => {
    const r = Match.deriveStatusFromApi({ ...base, apiStatus: 'FINISHED', winner: 'away', now })
    expect(r.status.value).toBe('finished'); expect(r.heldForWinner).toBe(false)
  })
  it('holds as live when FINISHED without a winner', () => {
    const r = Match.deriveStatusFromApi({ ...base, apiStatus: 'FINISHED', winner: null, now })
    expect(r.status.value).toBe('live'); expect(r.heldForWinner).toBe(true)
  })
  it('holds a stale IN_PLAY match without a winner', () => {
    const staleNow = new Date('2026-06-30T14:00:00Z') // 13h after kickoff
    const r = Match.deriveStatusFromApi({ ...base, apiStatus: 'IN_PLAY', winner: null, now: staleNow })
    expect(r.status.value).toBe('live'); expect(r.heldForWinner).toBe(true)
  })
  it('finishes a stale IN_PLAY match that has a winner', () => {
    const staleNow = new Date('2026-06-30T14:00:00Z')
    const r = Match.deriveStatusFromApi({ ...base, apiStatus: 'IN_PLAY', winner: 'home', now: staleNow })
    expect(r.status.value).toBe('finished'); expect(r.heldForWinner).toBe(false)
  })
  it('stays live for a non-stale IN_PLAY match', () => {
    const r = Match.deriveStatusFromApi({ ...base, apiStatus: 'IN_PLAY', winner: null, now })
    expect(r.status.value).toBe('live'); expect(r.heldForWinner).toBe(false)
  })
  it('stays scheduled', () => {
    const r = Match.deriveStatusFromApi({ ...base, apiStatus: 'SCHEDULED', winner: null, now })
    expect(r.status.value).toBe('scheduled'); expect(r.heldForWinner).toBe(false)
  })
})
```

- [ ] **Step 2: Run, verify it fails** — `pnpm --filter @m5nita/api exec vitest run src/domain/match/Match.test.ts`
- [ ] **Step 3: Implement** the new signature/return in `Match.ts`:

```ts
static deriveStatusFromApi(input: {
  apiStatus: string
  homeScore: number | null
  awayScore: number | null
  winner: string | null
  kickoffAt: Date
  now: Date
  rawTranslator: (apiStatus: string) => MatchStatus
}): { status: MatchStatus; heldForWinner: boolean } {
  const raw = input.rawTranslator(input.apiStatus)
  const isLiveByFeed = input.apiStatus === 'IN_PLAY' || input.apiStatus === 'PAUSED'
  const hasScores = input.homeScore !== null && input.awayScore !== null
  const staleFinish =
    isLiveByFeed && hasScores && StaleMatchPolicy.isStaleSinceKickoff(input.kickoffAt, input.now)
  const wantsFinish = raw.isFinished() || staleFinish
  if (wantsFinish && input.winner === null) {
    return { status: MatchStatus.Live, heldForWinner: true }
  }
  if (staleFinish) return { status: MatchStatus.Finished, heldForWinner: false }
  return { status: raw, heldForWinner: false }
}
```

- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Commit** `feat(032): winner gate in Match.deriveStatusFromApi`.

---

### Task 2: Mapper — gated `mapStatus` + `mapSyncStatus`

**Files:**
- Modify: `apps/api/src/infrastructure/persistence/mappers/MatchMapper.ts`
- Test: `apps/api/src/infrastructure/persistence/mappers/MatchMapper.test.ts` (create if absent)

**Interfaces:**
- Consumes: `Match.deriveStatusFromApi` (Task 1), `mapWinner` (existing).
- Produces: `mapSyncStatus(apiStatus: string, score?: { fullTime: {...}; winner?: string | null }, utcDate?: string): { status: string; heldForWinner: boolean }`; `mapStatus(...)` unchanged signature, returns `mapSyncStatus(...).status`.

- [ ] **Step 1: Failing test** — `mapSyncStatus('FINISHED', { fullTime:{home:1,away:1}, winner:null }, kickoff)` → `{ status:'live', heldForWinner:true }`; with `winner:'AWAY_TEAM'` → `{ status:'finished', heldForWinner:false }`; `mapStatus('FINISHED', { fullTime:{...}, winner:null })` → `'live'`.
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** — widen the `score` param type to include `winner?: string | null`, add `mapSyncStatus`, delegate `mapStatus`:

```ts
type ScoreInput = { fullTime: { home: number | null; away: number | null }; winner?: string | null }

export function mapSyncStatus(
  apiStatus: string,
  score?: ScoreInput,
  utcDate?: string,
): { status: string; heldForWinner: boolean } {
  const r = Match.deriveStatusFromApi({
    apiStatus,
    homeScore: score?.fullTime.home ?? null,
    awayScore: score?.fullTime.away ?? null,
    winner: mapWinner(score?.winner),
    kickoffAt: utcDate ? new Date(utcDate) : new Date(),
    now: new Date(),
    rawTranslator: rawTranslate,
  })
  return { status: r.status.value, heldForWinner: r.heldForWinner }
}

export function mapStatus(apiStatus: string, score?: ScoreInput, utcDate?: string): string {
  return mapSyncStatus(apiStatus, score, utcDate).status
}
```

- [ ] **Step 4: Run tests + the existing Match/mapper suite, verify pass.**
- [ ] **Step 5: Commit** `feat(032): gated mapStatus + mapSyncStatus`.

---

### Task 3: Live-sync emits the held signal

**Files:**
- Modify: `apps/api/src/application/match/SyncLiveScoresUseCase.ts`
- Test: `apps/api/src/application/match/SyncLiveScoresUseCase.test.ts` (create if absent)

**Interfaces:**
- Consumes: `mapSyncStatus` (Task 2).
- Produces: new optional dep `onMatchHeldAwaitingWinner?: (matchId: string) => Promise<void>`; `applyLiveMatch` calls it when `heldForWinner`.

- [ ] **Step 1: Failing test** — with a fake `footballApi` returning one match `FINISHED`/`winner:null`, assert: `updateScores` called with `status:'live'`; `onMatchHeldAwaitingWinner` called with the match id; no finished id returned (no `onMatchFinished`). Second test: same match with `winner:AWAY_TEAM` → `status:'finished'`, `onMatchFinished` fires, held callback NOT called.
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** — swap to `mapSyncStatus`, add the dep + call:

```ts
// deps type: add
onMatchHeldAwaitingWinner?: (matchId: string) => Promise<void>

// applyLiveMatch:
const { status: newStatus, heldForWinner } = mapSyncStatus(m.status, m.score, m.utcDate)
const wasNotFinished = existing.status !== 'finished'
await this.deps.matchRepo.updateScores(existing.id, toResultUpdate(m, newStatus))
if (heldForWinner && this.deps.onMatchHeldAwaitingWinner) {
  await this.deps.onMatchHeldAwaitingWinner(existing.id)
}
return wasNotFinished && newStatus === 'finished' ? existing.id : null
```

(Held → `newStatus==='live'`, so the finish trigger is suppressed automatically.)

- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Commit** `feat(032): live-sync emits held-awaiting-winner signal`.

---

### Task 4: Repo `finalizeWithWinner`

**Files:**
- Modify: `apps/api/src/domain/match/MatchRepository.port.ts`
- Modify: `apps/api/src/infrastructure/persistence/DrizzleMatchRepository.ts`

**Interfaces:**
- Produces: `MatchRepository.finalizeWithWinner(matchId: string, winner: 'home' | 'away' | 'draw'): Promise<void>`

- [ ] **Step 1: Add to the port interface:**

```ts
finalizeWithWinner(matchId: string, winner: 'home' | 'away' | 'draw'): Promise<void>
```

- [ ] **Step 2: Implement in Drizzle:**

```ts
async finalizeWithWinner(matchId: string, winner: 'home' | 'away' | 'draw'): Promise<void> {
  await this.db
    .update(match)
    .set({ winner, status: 'finished', updatedAt: new Date() })
    .where(eq(match.id, matchId))
}
```

- [ ] **Step 3: Commit** `feat(032): MatchRepository.finalizeWithWinner` (covered by Task 5's unit test via a fake repo; no standalone DB test).

---

### Task 5: `FinalizeMatchUseCase` + container wiring

**Files:**
- Create: `apps/api/src/application/match/FinalizeMatchUseCase.ts`
- Test: `apps/api/src/application/match/FinalizeMatchUseCase.test.ts`
- Modify: `apps/api/src/container.ts`

**Interfaces:**
- Consumes: `MatchRepository.findById`, `finalizeWithWinner` (Task 4); `isKnockout` from `domain/match/KnockoutResult`.
- Produces: `FinalizeMatchUseCase.execute(matchId: string, winner: string): Promise<void>`; container key `finalizeMatchUseCase`.

- [ ] **Step 1: Failing unit test** — fake `matchRepo` (`findById` returns a knockout match) + spy `rescore`. Assert: valid `away` → `finalizeWithWinner('id','away')` + `rescore('id')` called; `draw` on knockout → throws `KNOCKOUT_CANNOT_DRAW`, no writes; invalid `xyz` → throws `INVALID_WINNER`; missing match → throws `MATCH_NOT_FOUND`.
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement:**

```ts
import { isKnockout } from '../../domain/match/KnockoutResult'
import type { MatchRepository } from '../../domain/match/MatchRepository.port'

export type FinalizeMatchDeps = {
  matchRepo: MatchRepository
  rescore: (matchId: string) => Promise<void>
}

export class FinalizeMatchUseCase {
  constructor(private readonly deps: FinalizeMatchDeps) {}

  async execute(matchId: string, winner: string): Promise<void> {
    if (winner !== 'home' && winner !== 'away' && winner !== 'draw') {
      throw new Error('INVALID_WINNER')
    }
    const match = await this.deps.matchRepo.findById(matchId)
    if (!match) throw new Error('MATCH_NOT_FOUND')
    if (winner === 'draw' && isKnockout(match.stage)) throw new Error('KNOCKOUT_CANNOT_DRAW')
    await this.deps.matchRepo.finalizeWithWinner(matchId, winner)
    await this.deps.rescore(matchId)
  }
}
```

- [ ] **Step 4: Wire in `container.ts`** (dynamic import of `calcPoints` to avoid a static cycle):

```ts
const finalizeMatchUseCase = new FinalizeMatchUseCase({
  matchRepo,
  rescore: async (matchId: string) => {
    const { calcPointsForMatch } = await import('./jobs/calcPoints')
    await calcPointsForMatch(matchId)
    await notifyMatchPointsUseCase.execute(matchId)
  },
})
// add `finalizeMatchUseCase` to the returned object
```

- [ ] **Step 5: Run unit tests, verify pass. Commit** `feat(032): FinalizeMatchUseCase + container`.

---

### Task 6: Telegram alert + finalize callback

**Files:**
- Modify: `apps/api/src/infrastructure/external/TelegramNotificationService.ts`
- Modify: `apps/api/src/lib/telegram.ts`

**Interfaces:**
- Consumes: `getContainer().finalizeMatchUseCase` (Task 5); `ADMIN_USER_IDS`, `isAdmin`.
- Produces: `TelegramNotificationService.notifyAdminMatchNeedsWinner(match: MatchData): Promise<void>`; `bot.callbackQuery(/^finalize_match:/, ...)`.

- [ ] **Step 1:** Add `notifyAdminMatchNeedsWinner` mirroring `notifyAdminWithdrawalRequest` (loop `ADMIN_USER_IDS`, `sendMessage` with inline keyboard):

```ts
async notifyAdminMatchNeedsWinner(match: {
  id: string; homeTeam: string; awayTeam: string; stage: string
  homeScore: number | null; awayScore: number | null
  penaltyHomeScore?: number | null; penaltyAwayScore?: number | null
}): Promise<void> {
  const adminIds = (process.env.ADMIN_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (adminIds.length === 0) return
  const pens =
    match.penaltyHomeScore != null && match.penaltyAwayScore != null
      ? ` (pên ${match.penaltyHomeScore}-${match.penaltyAwayScore})` : ''
  const text =
    `⚠️ *Partida sem vencedor*\n${match.homeTeam} ${match.homeScore ?? 0}-${match.awayScore ?? 0} ${match.awayTeam}${pens}\n` +
    `Etapa: ${match.stage}\nDefina o vencedor para finalizar e pontuar:`
  const reply_markup = {
    inline_keyboard: [
      [
        { text: `🏠 ${match.homeTeam}`, callback_data: `finalize_match:${match.id}:home` },
        { text: `✈️ ${match.awayTeam}`, callback_data: `finalize_match:${match.id}:away` },
      ],
      [{ text: '🤝 Empate', callback_data: `finalize_match:${match.id}:draw` }],
    ],
  }
  for (const adminId of adminIds) {
    try {
      await this.bot.api.sendMessage(Number(adminId), text, { parse_mode: 'Markdown', reply_markup })
    } catch (error) {
      console.error(`[Telegram] Failed to notify admin ${adminId}:`, error)
    }
  }
}
```

- [ ] **Step 2:** Add the callback handler in `lib/telegram.ts` (mirror the withdrawal `callbackQuery` access pattern; import `getContainer` like that handler does):

```ts
bot.callbackQuery(/^finalize_match:/, async (ctx) => {
  if (!ctx.from || !isAdmin(ctx.from.id)) {
    await ctx.answerCallbackQuery({ text: 'Você não tem permissão.', show_alert: true })
    return
  }
  const [, matchId, winner] = (ctx.callbackQuery.data ?? '').split(':')
  const label = winner === 'home' ? 'Casa' : winner === 'away' ? 'Fora' : 'Empate'
  try {
    await getContainer().finalizeMatchUseCase.execute(matchId, winner)
    await ctx.answerCallbackQuery({ text: 'Finalizado ✅' })
    await ctx.editMessageText(`✅ Finalizado (${label}). Pontos recalculados.`)
  } catch (err) {
    await ctx.answerCallbackQuery({ text: `Erro: ${(err as Error).message}`, show_alert: true })
  }
})
```

- [ ] **Step 3:** Manual type-check + a lightweight unit test if a telegram test harness exists; otherwise rely on `pnpm --filter @m5nita/api exec tsc --noEmit`. **Commit** `feat(032): admin alert + finalize_match callback`.

---

### Task 7: Wire `onMatchHeldAwaitingWinner` in `index.ts`

**Files:**
- Modify: `apps/api/src/index.ts`

**Interfaces:**
- Consumes: `onMatchHeldAwaitingWinner` dep on `SyncLiveScoresUseCase` (Task 3); `notifyAdminMatchNeedsWinner` (Task 6); `matchRepo.findById`.

- [ ] **Step 1:** Add the grace constant + dedup Set + callback, and pass it to `syncLiveScoresUseCase`:

```ts
const HELD_ALERT_GRACE_MS = 3 * 60 * 60 * 1000
const heldAlertSent = new Set<string>()
const onMatchHeldAwaitingWinner = async (matchId: string) => {
  if (heldAlertSent.has(matchId)) return
  const m = await getContainer().matchRepo.findById(matchId)
  if (!m) return
  if (clock.now().getTime() - m.matchDate.getTime() < HELD_ALERT_GRACE_MS) return
  heldAlertSent.add(matchId)
  await getContainer().notificationService.notifyAdminMatchNeedsWinner(m)
}
// add onMatchHeldAwaitingWinner to the SyncLiveScoresUseCase deps object
```

- [ ] **Step 2:** `pnpm --filter @m5nita/api exec tsc --noEmit` (verify `matchRepo.findById` returns a `MatchData` with `matchDate`, `homeTeam`, `awayTeam`, `stage`, scores, penalties; adjust the notify signature to match the real `MatchData` field names). **Commit** `feat(032): wire held-awaiting-winner admin alert`.

---

### Task 8: Integration regression for match 537418

**Files:**
- Create: `apps/api/tests/integration/...winner-gate.test.ts` (follow existing integration harness; import `src` via `../../../src` per house rule).

**Interfaces:**
- Consumes: real DB harness + a stubbed `footballApi` returning a scripted two-tick sequence.

- [ ] **Step 1: Failing test** — seed a knockout match + a pool + predictions (one `advance_pick='away'`). Tick 1: `footballApi` returns the match `FINISHED` with `winner:null`, regularTime 1-1. Run `syncLiveScoresUseCase.execute()`. Assert match `status='live'`, the away-pick prediction `points IS NULL`. Tick 2: `footballApi` returns `FINISHED` with `winner:'AWAY_TEAM'`. Run again. Assert match `status='finished'`, away-pick prediction `points == scoreline + 2`.
- [ ] **Step 2: Run** with `DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test pnpm --filter @m5nita/api test:integration` — verify it fails before Tasks 1–3 logic and passes after.
- [ ] **Step 3: Commit** `test(032): regression — knockout held until winner then +2`.

---

### Task 9: Full verification + finalize

- [ ] **Step 1:** `pnpm biome check --write .`
- [ ] **Step 2:** `pnpm --filter @m5nita/api exec tsc --noEmit`
- [ ] **Step 3:** `pnpm test` (all unit suites green)
- [ ] **Step 4:** `pnpm check:leaks` and `pnpm check:arch` (no new violations; add `// arch-allow:` only with a clear reason if the dynamic-import wiring is flagged)
- [ ] **Step 5:** Integration suite green (Task 8 command)
- [ ] **Step 6:** Commit any formatting; push branch; open PR.

## Self-Review

- **Spec coverage:** FR-001/002 → Task 1; FR-003 (stale) → Task 1 (`staleFinish` folded into the gate); FR-004 (self-heal) → Tasks 1+3 (transition fires only with winner); FR-005 (no premature scoring) → Task 3 (held→`live`, calcPoints guard already returns on non-finished); FR-006/007/008 (alert+dedup+buttons) → Tasks 6+7; FR-009 (finalize+rescore) → Task 5; FR-010 (validation) → Task 5; FR-011 (authz) → Task 6; FR-012 (no HTTP/migration) → honored throughout. Regression → Task 8.
- **Placeholder scan:** none — every code step has concrete code.
- **Type consistency:** `deriveStatusFromApi` returns `{ status, heldForWinner }` (Task 1) consumed via `mapSyncStatus` (Task 2) → `SyncLiveScoresUseCase` (Task 3); `finalizeWithWinner` signature identical in Tasks 4/5; `finalize_match:{id}:{winner}` callback_data identical in Tasks 6 (producer) and 6 (consumer).
- **Open verifications (resolve during execution):** real `MatchData` field names for the alert; existing test-file names; how the withdrawal callback imports `getContainer` (mirror it); confirm `deriveStatusFromApi` has no other callers than `mapStatus`.
