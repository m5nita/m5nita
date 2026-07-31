# Admin Close Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an admin a Telegram command that closes one pool by invite code when its remaining matches were postponed and can no longer affect the ranking, releasing the prize.

**Architecture:** A domain policy (`PoolClosurePolicy`) answers whether an unfinished match still blocks closing; a new repository read (`findUnfinishedFor`) returns those matches instead of a boolean; `ClosePoolUseCase` resolves the invite code, applies the policy, closes the pool and notifies the winners; a new `bot.command('bolao_encerrar')` renders the result. The winner-notification tail is extracted from `closePoolsJob` into `notifyPoolWinners` so both paths send the identical message with identical prize math.

**Tech Stack:** TypeScript 5.x strict, Node ≥ 22, Hono, Drizzle ORM, grammY, Vitest 3.1, pnpm monorepo, Biome.

## Global Constraints

- **The automatic path must not change.** `closePoolsJob` closes the same pools at the same moments. `apps/api/src/jobs/closePoolsJob.test.ts` must pass **without being edited** — treat any need to edit it as a signal the refactor went too far.
- **No match data is written.** Postponed matches keep their status, date and scores. Never set a match to `cancelled` to make a pool closable.
- **No schema change, no migration.** The only state transition is `pool.status` `active → closed`.
- **Business rules live in `apps/api/src/domain/`.** No layer outside it may re-derive "is this match still blocking" from a raw status string. CI enforces this via `pnpm check:leaks` (G2) and `pnpm check:arch` (G3).
- **Money is always centavos (BRL) as integers.** Format for humans only at the edge, with `formatBrl` from `@m5nita/shared`.
- **Portuguese user-facing copy.** Bot replies match the existing `/cupom_*` and `/competicao_*` tone. Permission refusal is verbatim `'Você não tem permissão para este comando.'`
- **Biome, not Prettier.** Run `pnpm biome check --write .` before staging; the editor's own formatter disagrees with it.
- **Never assert on a literal `'R$ 2,85'`.** `formatBrl` uses `Intl` and emits a non-breaking space. Assert with `toContain('2,85')` or compare against `formatBrl(285)`, the way `packages/shared/src/lib/money.test.ts` already does.

---

### Task 1: The domain rule — which unfinished match still blocks a close

**Files:**
- Create: `apps/api/src/domain/pool/PoolClosurePolicy.ts`
- Test: `apps/api/src/domain/pool/PoolClosurePolicy.test.ts`

**Interfaces:**
- Consumes: `Match` and `MatchStatus` from `apps/api/src/domain/match/`. `Match`'s constructor is `(id, competitionId, kickoffAt, matchday, status, homeScore = null, awayScore = null)`; its `status` field is a `MatchStatus` with `isLive()`; its `kickoffAt` is a `Date`.
- Produces: `PoolClosurePolicy.blocks(match: Match, now: Date): boolean`. Task 4 calls this once per unfinished match.

**Context:** `MatchStatus.TERMINAL_VALUES` is `['finished', 'cancelled']`. A `postponed` match is therefore not terminal and holds its pool open forever. The rule this task encodes: a match blocks while it can still be **played or predicted** — it is live, or its kickoff has not arrived. Everything else is *stranded*. Stranded is not a status; a postponed match past its date and a scheduled match whose kickoff came and went without the feed starting it are both stranded, and neither can take a prediction (`Match.canBePredicted` requires `scheduled` **and** a future kickoff) or produce points.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/domain/pool/PoolClosurePolicy.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { Match } from '../match/Match'
import { MatchStatus } from '../match/MatchStatus'
import { PoolClosurePolicy } from './PoolClosurePolicy'

const NOW = new Date('2026-07-31T12:00:00Z')
const PAST = new Date('2026-07-29T00:00:00Z')
const FUTURE = new Date('2026-08-05T21:30:00Z')

function match(status: MatchStatus, kickoffAt: Date): Match {
  return new Match('match-1', 'comp-1', kickoffAt, 21, status)
}

describe('PoolClosurePolicy.blocks', () => {
  it('does not block on a match postponed past its original kickoff', () => {
    expect(PoolClosurePolicy.blocks(match(MatchStatus.Postponed, PAST), NOW)).toBe(false)
  })

  it('blocks on a postponed match that already carries a future date', () => {
    expect(PoolClosurePolicy.blocks(match(MatchStatus.Postponed, FUTURE), NOW)).toBe(true)
  })

  it('blocks on a match scheduled for the future', () => {
    expect(PoolClosurePolicy.blocks(match(MatchStatus.Scheduled, FUTURE), NOW)).toBe(true)
  })

  it('blocks on a live match even though its kickoff is in the past', () => {
    expect(PoolClosurePolicy.blocks(match(MatchStatus.Live, PAST), NOW)).toBe(true)
  })

  it('does not block on a scheduled match whose kickoff came and went', () => {
    expect(PoolClosurePolicy.blocks(match(MatchStatus.Scheduled, PAST), NOW)).toBe(false)
  })

  it('treats a kickoff exactly at now as already started', () => {
    expect(PoolClosurePolicy.blocks(match(MatchStatus.Scheduled, NOW), NOW)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @m5nita/api exec vitest run src/domain/pool/PoolClosurePolicy.test.ts
```

Expected: FAIL — `Failed to resolve import "./PoolClosurePolicy"`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/domain/pool/PoolClosurePolicy.ts`:

```typescript
import type { Match } from '../match/Match'

/**
 * Whether an unfinished in-scope match still stands between a pool and closing.
 *
 * A match blocks while it can still be played or predicted: it is live, or its
 * kickoff has not arrived. Anything else is *stranded* — postponed with no new
 * date, or scheduled for a kickoff that came and went without the feed ever
 * starting it. A stranded match can neither take a prediction
 * (`Match.canBePredicted` requires `scheduled` AND a future kickoff) nor produce
 * points, so it must not keep a pool — and its prize — open indefinitely.
 *
 * Terminal matches never reach here: the repository read that feeds this policy
 * already excludes `MatchStatus.TERMINAL_VALUES`.
 *
 * This is the ADMIN threshold. The automatic job (`closePoolsJob`) keeps its own,
 * stricter rule: it closes only when nothing unfinished is left at all.
 */
export class PoolClosurePolicy {
  private constructor() {}

  static blocks(match: Match, now: Date): boolean {
    return match.status.isLive() || match.kickoffAt > now
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @m5nita/api exec vitest run src/domain/pool/PoolClosurePolicy.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
pnpm biome check --write apps/api/src/domain/pool/
git add apps/api/src/domain/pool/PoolClosurePolicy.ts apps/api/src/domain/pool/PoolClosurePolicy.test.ts
git commit -m "feat(037): regra de domínio para jogo que ainda segura o fechamento do bolão"
```

---

### Task 2: Read the unfinished matches, not just whether any exist

**Files:**
- Modify: `apps/api/src/domain/match/MatchRepository.port.ts` (add to the `MatchRepository` interface, after `hasUnfinishedFor`)
- Modify: `apps/api/src/infrastructure/persistence/DrizzleMatchRepository.ts` (around `hasUnfinishedMatches`, currently at line 215, and `hasUnfinishedFor` at line 243)
- Modify: `apps/api/tests/integration/support/fixtures/makeMatch.ts` (widen the `status` union)
- Test: `apps/api/tests/integration/scenarios/admin-close-pool.test.ts` (new file, grown again in Task 6)

**Interfaces:**
- Consumes: `UnfinishedMatchesQuery` from `apps/api/src/domain/pool/Pool.ts`, which is `{ kind: 'single-match'; matchId: string } | { kind: 'range'; competitionId: string; matchdayFrom: number | null; matchdayTo: number | null }`. `MatchData` from the same port file. The module-local `toMatchData` mapper already used throughout `DrizzleMatchRepository`.
- Produces: `MatchRepository.findUnfinishedFor(query: UnfinishedMatchesQuery): Promise<MatchData[]>`. Task 4 calls it.

**Context:** `hasUnfinishedMatches` (line 215) already builds exactly the right predicate — same competition, matchday within the pool's range, `notInArray(match.status, MatchStatus.TERMINAL_VALUES)`. This task lifts those conditions into one private builder used by both the existing boolean and the new list, so the two can never drift apart.

Note one deliberate asymmetry: for a single-match pool whose match row no longer exists, `hasUnfinishedFor` returns `true` (blocks the job) while `findUnfinishedFor` returns `[]` (lets an admin close). That is intended — the job closing such a pool would be an accident, an admin closing it is a decision.

- [ ] **Step 1: Widen the test fixture so a postponed match can be seeded**

In `apps/api/tests/integration/support/fixtures/makeMatch.ts`, the status union appears twice — in the `TestMatch` type (line 11) and in the `opts` parameter (line 27). Change both from:

```typescript
  status: 'scheduled' | 'live' | 'finished'
```

to:

```typescript
  status: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled'
```

No other change: the fixture already inserts `status` straight into the `match` row.

- [ ] **Step 2: Write the failing test**

Create `apps/api/tests/integration/scenarios/admin-close-pool.test.ts`:

```typescript
import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp } from '../support/app'
import { signInViaPhoneOtp } from '../support/auth-helper'
import { workerConnectionString } from '../support/db-utils'
import { makeCompetition } from '../support/fixtures/makeCompetition'
import { makeMatch } from '../support/fixtures/makeMatch'
import { makePool } from '../support/fixtures/makePool'
import { deliverInfinitePayPaidWebhook } from '../support/payments'

/**
 * A pool whose remaining matches were postponed. The repository must hand back
 * those rows so the admin path can tell a stranded match from a blocking one.
 */
describe('Admin close pool — reading the unfinished matches', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  it('returns the postponed match and omits the finished one', async () => {
    const { app, container } = buildTestApp()
    const comp = await makeCompetition(sql)
    const owner = await signInViaPhoneOtp(app, { phoneNumber: '+5511977700001' })
    const pool = await makePool({
      admin: owner,
      competitionId: comp.id,
      entryFeeCentavos: 100,
      matchdayFrom: 21,
      matchdayTo: 21,
    })
    expect((await deliverInfinitePayPaidWebhook(app, pool.paymentId)).status).toBe(200)

    await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: new Date('2026-07-29T22:30:00Z'),
      matchday: 21,
      status: 'finished',
      homeTeam: 'SC Internacional',
      awayTeam: 'CR Flamengo',
      homeScore: 1,
      awayScore: 1,
    })
    const postponed = await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: new Date('2026-07-29T00:00:00Z'),
      matchday: 21,
      status: 'postponed',
      homeTeam: 'São Paulo FC',
      awayTeam: 'Santos FC',
    })
    await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: new Date('2026-07-29T00:00:00Z'),
      matchday: 22,
      status: 'postponed',
      homeTeam: 'Fora do escopo',
      awayTeam: 'Outra rodada',
    })

    const rows = await container.matchRepo.findUnfinishedFor({
      kind: 'range',
      competitionId: comp.id,
      matchdayFrom: 21,
      matchdayTo: 21,
    })

    expect(rows.map((r) => r.id)).toEqual([postponed.id])
    expect(rows[0]?.homeTeam).toBe('São Paulo FC')
    expect(rows[0]?.status).toBe('postponed')
  })

  it('returns an empty list once every in-scope match is terminal', async () => {
    const { app, container } = buildTestApp()
    const comp = await makeCompetition(sql)
    const owner = await signInViaPhoneOtp(app, { phoneNumber: '+5511977700002' })
    const pool = await makePool({
      admin: owner,
      competitionId: comp.id,
      entryFeeCentavos: 100,
      matchdayFrom: 30,
      matchdayTo: 30,
    })
    expect((await deliverInfinitePayPaidWebhook(app, pool.paymentId)).status).toBe(200)

    await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: new Date('2026-07-29T22:30:00Z'),
      matchday: 30,
      status: 'finished',
      homeScore: 0,
      awayScore: 0,
    })
    await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: new Date('2026-07-29T22:30:00Z'),
      matchday: 30,
      status: 'cancelled',
    })

    const rows = await container.matchRepo.findUnfinishedFor({
      kind: 'range',
      competitionId: comp.id,
      matchdayFrom: 30,
      matchdayTo: 30,
    })

    expect(rows).toEqual([])
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

The `postgres-test` container must be up (`docker compose up -d postgres-test`).

```bash
DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test \
  pnpm --filter @m5nita/api test:integration tests/integration/scenarios/admin-close-pool.test.ts
```

Expected: FAIL — `container.matchRepo.findUnfinishedFor is not a function`.

- [ ] **Step 4: Add the method to the port**

In `apps/api/src/domain/match/MatchRepository.port.ts`, inside `interface MatchRepository`, immediately after the `hasUnfinishedFor(query: UnfinishedMatchesQuery): Promise<boolean>` line:

```typescript
  /**
   * The pool's in-scope matches that are NOT terminal, ordered by kickoff. Same
   * predicate as `hasUnfinishedFor`, returning the rows so a caller can tell a
   * blocking match from a stranded one and name it to a human.
   *
   * Deliberate asymmetry: for a single-match pool whose match row is gone,
   * `hasUnfinishedFor` reports `true` (the job must not close it by accident)
   * while this returns `[]` (an admin closing it is a decision, not an accident).
   */
  findUnfinishedFor(query: UnfinishedMatchesQuery): Promise<MatchData[]>
```

- [ ] **Step 5: Implement it in the Drizzle adapter**

In `apps/api/src/infrastructure/persistence/DrizzleMatchRepository.ts`, replace the body of `hasUnfinishedMatches` (line 215) so the predicate lives in one place, and add the new method after `hasUnfinishedFor`:

```typescript
  /**
   * The in-scope, not-yet-terminal predicate shared by `hasUnfinishedMatches`
   * and `findUnfinishedFor`, so the boolean and the list can never disagree.
   * Cancelled counts as terminal alongside finished: a pool whose remaining
   * matches are cancelled must still be closable, otherwise its prize is stuck.
   */
  private unfinishedConditions(
    competitionId: string,
    matchdayFrom?: number | null,
    matchdayTo?: number | null,
  ) {
    const conditions = [
      eq(match.competitionId, competitionId),
      notInArray(match.status, [...MatchStatus.TERMINAL_VALUES]),
    ]
    if (matchdayFrom != null) {
      conditions.push(gte(match.matchday, matchdayFrom))
    }
    if (matchdayTo != null) {
      conditions.push(lte(match.matchday, matchdayTo))
    }
    return conditions
  }

  async hasUnfinishedMatches(
    competitionId: string,
    matchdayFrom?: number | null,
    matchdayTo?: number | null,
  ): Promise<boolean> {
    const [row] = await this.db
      .select({ id: match.id })
      .from(match)
      .where(and(...this.unfinishedConditions(competitionId, matchdayFrom, matchdayTo)))
      .limit(1)

    return !!row
  }

  async findUnfinishedFor(query: UnfinishedMatchesQuery): Promise<MatchData[]> {
    if (query.kind === 'single-match') {
      const found = await this.findById(query.matchId)
      if (!found) return []
      return MatchStatus.from(found.status).isTerminal() ? [] : [found]
    }

    const rows = await this.db
      .select()
      .from(match)
      .where(
        and(
          ...this.unfinishedConditions(query.competitionId, query.matchdayFrom, query.matchdayTo),
        ),
      )
      .orderBy(asc(match.matchDate), asc(match.id))
    return rows.map(toMatchData)
  }
```

Every identifier used here — `eq`, `and`, `gte`, `lte`, `asc`, `notInArray`, `match`, `MatchStatus`, `toMatchData`, `UnfinishedMatchesQuery` — is already imported in this file. Add no imports. If TypeScript reports an unused import after the edit, you removed something you should not have.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test \
  pnpm --filter @m5nita/api test:integration tests/integration/scenarios/admin-close-pool.test.ts
pnpm --filter @m5nita/api exec vitest run src/jobs/closePoolsJob.test.ts
```

Expected: both PASS. The job test proves the `hasUnfinishedMatches` refactor did not change behaviour.

- [ ] **Step 7: Commit**

```bash
pnpm biome check --write apps/api/
git add apps/api/src/domain/match/MatchRepository.port.ts \
        apps/api/src/infrastructure/persistence/DrizzleMatchRepository.ts \
        apps/api/tests/integration/support/fixtures/makeMatch.ts \
        apps/api/tests/integration/scenarios/admin-close-pool.test.ts
git commit -m "feat(037): findUnfinishedFor devolve as partidas pendentes do escopo do bolão"
```

---

### Task 3: Extract the winner notification so both close paths share it

**Files:**
- Create: `apps/api/src/application/pool/notifyPoolWinners.ts`
- Modify: `apps/api/src/jobs/closePoolsJob.ts` (remove the nested `notifyWinnersForPool`, lines 47-79, and the now-unused imports on lines 2-4)
- Test: `apps/api/src/jobs/closePoolsJob.test.ts` — **do not edit it**; it is the proof this refactor changed nothing.

**Interfaces:**
- Consumes: `RankingEntry` and `RankingRepository` from `apps/api/src/domain/ranking/RankingRepository.port.ts`; `PoolRepository` from `apps/api/src/domain/pool/PoolRepository.port.ts`; `NotificationService` and `WinnerInfo` from `apps/api/src/application/ports/NotificationService.port.ts`; `PrizeCalculation`, `EntryFee`, `FeePolicy` from the domain.
- Produces: `notifyPoolWinners(pool: PoolPrizeContext, deps: PoolWinnerDeps): Promise<PoolWinnersNotified>` where `PoolPrizeContext = { id: string; name: string; entryFee: number; discountPercent: number }` and `PoolWinnersNotified = { winners: RankingEntry[]; prizeShare: number }`. Task 4 calls it.

**Context:** This is a pure refactor — same calls, same order, same arguments. The logic being moved is today a closure at the bottom of `closePoolsJob.ts`. The point is that an admin-closed pool must be indistinguishable from a job-closed one for the members, which only holds if there is exactly one implementation.

- [ ] **Step 1: Create the shared function**

Create `apps/api/src/application/pool/notifyPoolWinners.ts`:

```typescript
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import { PrizeCalculation } from '../../domain/prize/PrizeCalculation'
import type { RankingEntry, RankingRepository } from '../../domain/ranking/RankingRepository.port'
import { EntryFee } from '../../domain/shared/EntryFee'
import { FeePolicy } from '../../domain/shared/FeePolicy'
import type { NotificationService, WinnerInfo } from '../ports/NotificationService.port'

export type PoolPrizeContext = {
  id: string
  name: string
  entryFee: number
  discountPercent: number
}

export type PoolWinnerDeps = {
  poolRepo: Pick<PoolRepository, 'getMemberCount' | 'getMembersWithContact'>
  rankingRepo: Pick<RankingRepository, 'getPoolRanking'>
  notificationService: Pick<NotificationService, 'notifyWinners'>
}

export type PoolWinnersNotified = {
  /** First-place entries, in ranking order. Empty when nobody scored. */
  winners: RankingEntry[]
  /** Centavos each winner receives; 0 when there is no winner. */
  prizeShare: number
}

/**
 * Tell a just-closed pool's first-place members they won, with each one's share
 * of the prize.
 *
 * Extracted from `closePoolsJob` so the admin close path (`ClosePoolUseCase`)
 * sends the same notification through the same prize math: a manually closed
 * pool must be indistinguishable from one the job closed.
 */
export async function notifyPoolWinners(
  pool: PoolPrizeContext,
  deps: PoolWinnerDeps,
): Promise<PoolWinnersNotified> {
  const ranking = await deps.rankingRepo.getPoolRanking(pool.id, '')
  const winnerEntries = ranking.filter((r) => r.position === 1)
  if (winnerEntries.length === 0) return { winners: [], prizeShare: 0 }

  const memberCount = await deps.poolRepo.getMemberCount(pool.id)
  const feePolicy = FeePolicy.from(pool.discountPercent)
  const prizeTotal = PrizeCalculation.calculatePrizeTotal(
    EntryFee.hydrate(pool.entryFee),
    memberCount,
    feePolicy,
  )
  const prizeShare = PrizeCalculation.calculateWinnerShare(prizeTotal, winnerEntries.length)

  const members = await deps.poolRepo.getMembersWithContact(pool.id)
  const contactByUserId = new Map(members.map((m) => [m.userId, m]))

  const winners: WinnerInfo[] = winnerEntries.map((w) => {
    const contact = contactByUserId.get(w.userId)
    return {
      userId: w.userId,
      name: w.name,
      phoneNumber: contact?.phoneNumber ?? null,
      email: contact?.emailVerified && contact.email ? contact.email : null,
    }
  })

  await deps.notificationService.notifyWinners(pool.id, pool.name, winners, prizeShare.centavos)

  return { winners: winnerEntries, prizeShare: prizeShare.centavos }
}
```

- [ ] **Step 2: Rewrite the job to call it**

Replace the whole of `apps/api/src/jobs/closePoolsJob.ts` with:

```typescript
import { notifyPoolWinners } from '../application/pool/notifyPoolWinners'
import { getContainer } from '../container'
import { PoolStatus } from '../domain/shared/PoolStatus'

export async function checkAndClosePools(): Promise<void> {
  const { poolRepo, matchRepo, rankingRepo, notificationService } = getContainer()

  const activePools = await poolRepo.findAllActive()

  if (activePools.length === 0) return

  let closedCount = 0

  for (const p of activePools) {
    try {
      const query =
        p.matchId != null
          ? { kind: 'single-match' as const, matchId: p.matchId }
          : {
              kind: 'range' as const,
              competitionId: p.competitionId,
              matchdayFrom: p.matchdayFrom,
              matchdayTo: p.matchdayTo,
            }
      const hasUnfinished = await matchRepo.hasUnfinishedFor(query)

      if (hasUnfinished) continue

      await poolRepo.updateStatus(p.id, PoolStatus.Closed)

      closedCount++

      console.log(`[ClosePoolsJob] Closed pool "${p.name}" (${p.id})`)

      await notifyPoolWinners(
        {
          id: p.id,
          name: p.name,
          entryFee: p.entryFee,
          discountPercent: p.discountPercent,
        },
        { poolRepo, rankingRepo, notificationService },
      )
    } catch (err) {
      console.error(`[ClosePoolsJob] Failed to process pool ${p.id}:`, err)
    }
  }

  if (closedCount > 0) {
    console.log(`[ClosePoolsJob] Done. Closed ${closedCount} pool(s).`)
  }
}
```

The `PrizeCalculation`, `EntryFee` and `FeePolicy` imports are gone on purpose — they moved with the code that used them. Leaving them would be dead code.

- [ ] **Step 3: Run the job test, unedited, to verify nothing moved**

```bash
pnpm --filter @m5nita/api exec vitest run src/jobs/closePoolsJob.test.ts
```

Expected: PASS, 5 tests, with **zero edits** to the test file. If it fails, the refactor changed behaviour — fix the source, never the test.

- [ ] **Step 4: Run the integration scenario that closes a pool for real**

```bash
DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test \
  pnpm --filter @m5nita/api test:integration tests/integration/scenarios/prize-withdrawal.test.ts
```

Expected: PASS. This scenario drives `checkAndClosePools` end-to-end against real Postgres and then withdraws the prize, so it covers the extracted prize math.

- [ ] **Step 5: Commit**

```bash
pnpm biome check --write apps/api/
git add apps/api/src/application/pool/notifyPoolWinners.ts apps/api/src/jobs/closePoolsJob.ts
git commit -m "refactor(037): extrai notifyPoolWinners do closePoolsJob para reuso"
```

---

### Task 4: `ClosePoolUseCase`

**Files:**
- Create: `apps/api/src/application/pool/ClosePoolUseCase.ts`
- Test: `apps/api/src/application/pool/ClosePoolUseCase.test.ts`

**Interfaces:**
- Consumes: `PoolClosurePolicy.blocks` (Task 1); `matchRepo.findUnfinishedFor` (Task 2); `notifyPoolWinners` (Task 3); `poolRepo.findByInviteCode(code): Promise<PoolWithDetails | null>`, `poolRepo.findById(id): Promise<Pool | null>`, `poolRepo.updateStatus(id, PoolStatus)`; `Pool.unfinishedMatchesQuery()` and `Pool.close()`; `Clock.now()` from `apps/api/src/domain/shared/Clock.ts`.
- Produces: `ClosePoolUseCase` with `execute(input: ClosePoolInput): Promise<ClosePoolResult>`, plus the exported types `ClosePoolInput`, `ClosePoolResult`, `ClosePoolBlockingMatch`, `ClosePoolStrandedMatch`, `ClosePoolWinner`. Task 5 wires and renders these.

**Context:** Refusal is an expected outcome here, not an exception, so `execute` returns a discriminated union instead of throwing — the bot switches on `outcome` and every branch is type-checked. `PoolWithDetails` carries `name`, `status`, `entryFee` and `coupon: { discountPercent } | null`; the `Pool` aggregate carries `unfinishedMatchesQuery()` and `close()`. Both reads are needed, which is why the use case loads the pool twice.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/application/pool/ClosePoolUseCase.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import type { MatchData, MatchRepository } from '../../domain/match/MatchRepository.port'
import { Pool } from '../../domain/pool/Pool'
import type { PoolRepository, PoolWithDetails } from '../../domain/pool/PoolRepository.port'
import type { RankingEntry, RankingRepository } from '../../domain/ranking/RankingRepository.port'
import { EntryFee } from '../../domain/shared/EntryFee'
import { InviteCode } from '../../domain/shared/InviteCode'
import { PoolScope } from '../../domain/shared/PoolScope'
import { PoolStatus } from '../../domain/shared/PoolStatus'
import type { NotificationService } from '../ports/NotificationService.port'
import { ClosePoolUseCase } from './ClosePoolUseCase'

const NOW = new Date('2026-07-31T12:00:00Z')
const CODE = '9VZJQ9J9'

function details(over: Partial<PoolWithDetails> = {}): PoolWithDetails {
  return {
    id: 'pool-1',
    name: 'Rafinha é careca!',
    entryFee: 100,
    ownerId: 'owner-1',
    inviteCode: CODE,
    competitionId: 'comp-1',
    matchdayFrom: 21,
    matchdayTo: 21,
    matchId: null,
    status: 'active',
    isOpen: true,
    notifyOnCreate: false,
    couponId: null,
    owner: { id: 'owner-1', name: 'Igor Túllio' },
    competitionName: 'Brasileirão Série A',
    coupon: null,
    memberCount: 3,
    prizeTotal: 285,
    hasLiveMatch: false,
    ...over,
  }
}

function aggregate(): Pool {
  return new Pool(
    'pool-1',
    'Rafinha é careca!',
    EntryFee.of(100),
    'owner-1',
    InviteCode.from(CODE),
    'comp-1',
    PoolScope.fromRow({ matchdayFrom: 21, matchdayTo: 21, matchId: null }),
    PoolStatus.Active,
    true,
    null,
  )
}

function matchRow(over: Partial<MatchData> = {}): MatchData {
  return {
    id: 'match-1',
    externalId: '554948',
    competitionId: 'comp-1',
    homeTeam: 'São Paulo FC',
    awayTeam: 'Santos FC',
    homeFlag: '',
    awayFlag: '',
    homeScore: null,
    awayScore: null,
    extraTimeHomeScore: null,
    extraTimeAwayScore: null,
    penaltyHomeScore: null,
    penaltyAwayScore: null,
    winner: null,
    duration: null,
    stage: 'REGULAR_SEASON',
    group: null,
    matchday: 21,
    matchDate: new Date('2026-07-29T00:00:00Z'),
    status: 'postponed',
    ...over,
  }
}

function ranking(): RankingEntry[] {
  return [
    {
      position: 1,
      userId: 'user-1',
      name: 'Igor Túllio',
      totalPoints: 22,
      exactMatches: 1,
      isCurrentUser: false,
    },
    {
      position: 2,
      userId: 'user-2',
      name: 'RafaTiroCerto',
      totalPoints: 15,
      exactMatches: 1,
      isCurrentUser: false,
    },
  ]
}

function makeUseCase(over?: {
  pool?: PoolWithDetails | null
  unfinished?: MatchData[]
  ranking?: RankingEntry[]
}) {
  const resolved = over && 'pool' in over ? over.pool : details()
  const updateStatus = vi.fn(async () => {})
  const notifyWinners = vi.fn(async () => {})
  const poolRepo = {
    findByInviteCode: vi.fn(async () => resolved),
    findById: vi.fn(async () => (resolved ? aggregate() : null)),
    updateStatus,
    getMemberCount: vi.fn(async () => 3),
    getMembersWithContact: vi.fn(async () => [
      {
        userId: 'user-1',
        name: 'Igor Túllio',
        phoneNumber: '+5511999999999',
        email: null,
        emailVerified: false,
      },
    ]),
  } as unknown as PoolRepository
  const matchRepo = {
    findUnfinishedFor: vi.fn(async () => over?.unfinished ?? []),
  } as unknown as MatchRepository
  const rankingRepo = {
    getPoolRanking: vi.fn(async () => over?.ranking ?? ranking()),
  } as unknown as RankingRepository
  const notificationService = { notifyWinners } as unknown as NotificationService

  const useCase = new ClosePoolUseCase({
    poolRepo,
    matchRepo,
    rankingRepo,
    notificationService,
    clock: { now: () => NOW },
  })

  return { useCase, updateStatus, notifyWinners, poolRepo, matchRepo }
}

describe('ClosePoolUseCase', () => {
  it('closes a pool whose only pending matches are postponed past their kickoff', async () => {
    const { useCase, updateStatus, notifyWinners } = makeUseCase({
      unfinished: [matchRow()],
    })

    const result = await useCase.execute({ inviteCode: CODE, force: false })

    expect(result.outcome).toBe('closed')
    if (result.outcome !== 'closed') return
    expect(result.poolName).toBe('Rafinha é careca!')
    expect(result.stranded).toEqual([
      { id: 'match-1', label: 'São Paulo FC × Santos FC', status: 'postponed' },
    ])
    expect(result.blocking).toEqual([])
    expect(result.winners).toEqual([
      { userId: 'user-1', name: 'Igor Túllio', totalPoints: 22 },
    ])
    // 3 members × R$ 1,00 entry, 5% platform fee.
    expect(result.prizeShare).toBe(285)
    expect(updateStatus).toHaveBeenCalledTimes(1)
    expect(notifyWinners).toHaveBeenCalledTimes(1)
  })

  it('refuses while a match is still scheduled for the future', async () => {
    const { useCase, updateStatus, notifyWinners } = makeUseCase({
      unfinished: [
        matchRow({
          id: 'match-2',
          homeTeam: 'CR Flamengo',
          awayTeam: 'CR Vasco da Gama',
          status: 'scheduled',
          matchDate: new Date('2026-08-05T21:30:00Z'),
        }),
      ],
    })

    const result = await useCase.execute({ inviteCode: CODE, force: false })

    expect(result.outcome).toBe('blocked')
    if (result.outcome !== 'blocked') return
    expect(result.blocking).toEqual([
      { id: 'match-2', label: 'CR Flamengo × CR Vasco da Gama', live: false },
    ])
    expect(updateStatus).not.toHaveBeenCalled()
    expect(notifyWinners).not.toHaveBeenCalled()
  })

  it('refuses while a match is live', async () => {
    const { useCase, updateStatus } = makeUseCase({
      unfinished: [matchRow({ id: 'match-3', status: 'live' })],
    })

    const result = await useCase.execute({ inviteCode: CODE, force: false })

    expect(result.outcome).toBe('blocked')
    if (result.outcome !== 'blocked') return
    expect(result.blocking[0]?.live).toBe(true)
    expect(updateStatus).not.toHaveBeenCalled()
  })

  it('closes anyway when forced, reporting what was left open', async () => {
    const { useCase, updateStatus } = makeUseCase({
      unfinished: [
        matchRow({ id: 'match-3', status: 'live' }),
        matchRow({ id: 'match-1', status: 'postponed' }),
      ],
    })

    const result = await useCase.execute({ inviteCode: CODE, force: true })

    expect(result.outcome).toBe('closed')
    if (result.outcome !== 'closed') return
    expect(result.blocking.map((m) => m.id)).toEqual(['match-3'])
    expect(result.stranded.map((m) => m.id)).toEqual(['match-1'])
    expect(updateStatus).toHaveBeenCalledTimes(1)
  })

  it('reports an unknown invite code without touching anything', async () => {
    const { useCase, updateStatus, notifyWinners } = makeUseCase({ pool: null })

    const result = await useCase.execute({ inviteCode: 'NOPE1234', force: false })

    expect(result).toEqual({ outcome: 'not-found' })
    expect(updateStatus).not.toHaveBeenCalled()
    expect(notifyWinners).not.toHaveBeenCalled()
  })

  it('is idempotent: an already-closed pool is reported, not re-notified', async () => {
    const { useCase, updateStatus, notifyWinners } = makeUseCase({
      pool: details({ status: 'closed' }),
    })

    const result = await useCase.execute({ inviteCode: CODE, force: false })

    expect(result).toEqual({
      outcome: 'not-active',
      poolName: 'Rafinha é careca!',
      status: 'closed',
    })
    expect(updateStatus).not.toHaveBeenCalled()
    expect(notifyWinners).not.toHaveBeenCalled()
  })

  it('splits the prize between tied winners', async () => {
    const { useCase } = makeUseCase({
      unfinished: [],
      ranking: [
        {
          position: 1,
          userId: 'user-1',
          name: 'Ana',
          totalPoints: 22,
          exactMatches: 1,
          isCurrentUser: false,
        },
        {
          position: 1,
          userId: 'user-2',
          name: 'Bia',
          totalPoints: 22,
          exactMatches: 1,
          isCurrentUser: false,
        },
      ],
    })

    const result = await useCase.execute({ inviteCode: CODE, force: false })

    expect(result.outcome).toBe('closed')
    if (result.outcome !== 'closed') return
    expect(result.winners.map((w) => w.name)).toEqual(['Ana', 'Bia'])
    expect(result.prizeShare).toBe(142)
  })

  it('closes a pool nobody scored in, with no winners and no notification', async () => {
    const { useCase, updateStatus, notifyWinners } = makeUseCase({
      unfinished: [],
      ranking: [],
    })

    const result = await useCase.execute({ inviteCode: CODE, force: false })

    expect(result.outcome).toBe('closed')
    if (result.outcome !== 'closed') return
    expect(result.winners).toEqual([])
    expect(result.prizeShare).toBe(0)
    expect(updateStatus).toHaveBeenCalledTimes(1)
    expect(notifyWinners).not.toHaveBeenCalled()
  })

  it('uppercases and trims the invite code before looking it up', async () => {
    const { useCase, poolRepo } = makeUseCase({ unfinished: [] })

    await useCase.execute({ inviteCode: '  9vzjq9j9 ', force: false })

    expect(poolRepo.findByInviteCode).toHaveBeenCalledWith('9VZJQ9J9')
  })
})
```

The `Pool` constructor is `(id, name, entryFee, ownerId, inviteCode, competitionId, scope, status, isOpen, couponId, notifyOnCreate = false)`; `PoolScope`'s constructor is private, so build it with the `fromRow` factory as above. The aggregate is needed only for `unfinishedMatchesQuery()` and `close()`.

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @m5nita/api exec vitest run src/application/pool/ClosePoolUseCase.test.ts
```

Expected: FAIL — `Failed to resolve import "./ClosePoolUseCase"`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/application/pool/ClosePoolUseCase.ts`:

```typescript
import { Match } from '../../domain/match/Match'
import type { MatchData, MatchRepository } from '../../domain/match/MatchRepository.port'
import { MatchStatus } from '../../domain/match/MatchStatus'
import { PoolClosurePolicy } from '../../domain/pool/PoolClosurePolicy'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import type { RankingRepository } from '../../domain/ranking/RankingRepository.port'
import type { Clock } from '../../domain/shared/Clock'
import { PoolStatus } from '../../domain/shared/PoolStatus'
import type { NotificationService } from '../ports/NotificationService.port'
import { notifyPoolWinners } from './notifyPoolWinners'

export type ClosePoolBlockingMatch = { id: string; label: string; live: boolean }
export type ClosePoolStrandedMatch = { id: string; label: string; status: string }
export type ClosePoolWinner = { userId: string; name: string | null; totalPoints: number }

export type ClosePoolResult =
  | { outcome: 'not-found' }
  | { outcome: 'not-active'; poolName: string; status: string }
  | { outcome: 'blocked'; poolName: string; blocking: ClosePoolBlockingMatch[] }
  | {
      outcome: 'closed'
      poolName: string
      stranded: ClosePoolStrandedMatch[]
      blocking: ClosePoolBlockingMatch[]
      winners: ClosePoolWinner[]
      prizeShare: number
    }

export type ClosePoolInput = {
  inviteCode: string
  /** Close even when a match can still be played or predicted. */
  force: boolean
}

export type ClosePoolDeps = {
  poolRepo: PoolRepository
  matchRepo: MatchRepository
  rankingRepo: RankingRepository
  notificationService: NotificationService
  clock: Clock
}

function toMatch(row: MatchData): Match {
  return new Match(
    row.id,
    row.competitionId,
    row.matchDate,
    row.matchday,
    MatchStatus.from(row.status),
    row.homeScore,
    row.awayScore,
  )
}

function label(row: MatchData): string {
  return `${row.homeTeam} × ${row.awayTeam}`
}

/**
 * Admin action: close one pool by its invite code, even when matches in its
 * scope never happened. A pool whose remaining fixtures were postponed would
 * otherwise stay `active` forever — and its prize locked, since prize reads
 * refuse a pool that is not closed.
 *
 * Mirrors `FinalizeMatchUseCase`: an escape hatch, not a rule. The automatic
 * path (`closePoolsJob`) is untouched and still waits for every in-scope match.
 *
 * Refusal is an expected outcome, so this returns a discriminated union rather
 * than throwing — every branch is then type-checked at the call site.
 */
export class ClosePoolUseCase {
  constructor(private readonly deps: ClosePoolDeps) {}

  async execute(input: ClosePoolInput): Promise<ClosePoolResult> {
    const code = input.inviteCode.trim().toUpperCase()
    const details = await this.deps.poolRepo.findByInviteCode(code)
    if (!details) return { outcome: 'not-found' }

    if (details.status !== 'active') {
      return { outcome: 'not-active', poolName: details.name, status: details.status }
    }

    const pool = await this.deps.poolRepo.findById(details.id)
    if (!pool) return { outcome: 'not-found' }

    const now = this.deps.clock.now()
    const rows = await this.deps.matchRepo.findUnfinishedFor(pool.unfinishedMatchesQuery())
    const blockingRows = rows.filter((row) => PoolClosurePolicy.blocks(toMatch(row), now))
    const strandedRows = rows.filter((row) => !PoolClosurePolicy.blocks(toMatch(row), now))

    const blocking: ClosePoolBlockingMatch[] = blockingRows.map((row) => ({
      id: row.id,
      label: label(row),
      live: MatchStatus.from(row.status).isLive(),
    }))

    if (blocking.length > 0 && !input.force) {
      return { outcome: 'blocked', poolName: details.name, blocking }
    }

    pool.close()
    await this.deps.poolRepo.updateStatus(pool.id, PoolStatus.Closed)

    const notified = await notifyPoolWinners(
      {
        id: details.id,
        name: details.name,
        entryFee: details.entryFee,
        discountPercent: details.coupon?.discountPercent ?? 0,
      },
      {
        poolRepo: this.deps.poolRepo,
        rankingRepo: this.deps.rankingRepo,
        notificationService: this.deps.notificationService,
      },
    )

    return {
      outcome: 'closed',
      poolName: details.name,
      stranded: strandedRows.map((row) => ({
        id: row.id,
        label: label(row),
        status: row.status,
      })),
      blocking,
      winners: notified.winners.map((w) => ({
        userId: w.userId,
        name: w.name,
        totalPoints: w.totalPoints,
      })),
      prizeShare: notified.prizeShare,
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @m5nita/api exec vitest run src/application/pool/ClosePoolUseCase.test.ts
```

Expected: PASS, 9 tests. If `prizeShare` comes back as something other than 285, check `POOL.PLATFORM_FEE_RATE` in `packages/shared/src/constants/index.ts` — the expected value is `floor(100 × 3 × (1 − 0.05))`.

- [ ] **Step 5: Verify the architecture guardrails still pass**

```bash
pnpm check:leaks
pnpm check:arch
pnpm --filter @m5nita/api exec vitest run src/_architecture.test.ts
```

Expected: all PASS. If G3 objects to `application/pool/ClosePoolUseCase.ts` importing `domain/`, the import direction is wrong — application may import domain, never the reverse. Never extend the `BASELINE_*` allow-lists.

- [ ] **Step 6: Commit**

```bash
pnpm biome check --write apps/api/
git add apps/api/src/application/pool/ClosePoolUseCase.ts apps/api/src/application/pool/ClosePoolUseCase.test.ts
git commit -m "feat(037): ClosePoolUseCase encerra bolão por código, com guarda de jogo em aberto"
```

---

### Task 5: The Telegram command

**Files:**
- Modify: `apps/api/src/container.ts` (import at the top, construction near `finalizeMatchUseCase` at line 192, and the returned object near line 216)
- Modify: `apps/api/src/lib/telegram.ts` (imports at the top; new exported helpers and `bot.command` after the `competicao_destacar` handler)
- Test: `apps/api/src/lib/telegram.test.ts` (append; it currently only covers `isAdmin`)

**Interfaces:**
- Consumes: `ClosePoolUseCase`, `ClosePoolResult` (Task 4); `formatBrl` from `@m5nita/shared`; `isAdmin` from `./admin`; `getContainer` from `../container`.
- Produces: `parsePoolCloseArgs(raw: string)` and `renderPoolCloseResult(result: ClosePoolResult, code: string)`, both exported from `lib/telegram.ts` so they are unit-testable without driving grammY; and `container.closePoolUseCase`.

**Context:** grammY's `bot` is constructed at module scope, so the handlers themselves are not unit-testable here — which is why parsing and rendering are pure exported functions and the handler is a four-line shell. `ctx.match` is the text after the command. `getContainer()` must stay inside the handler: `container.ts` imports `bot` from this file, and the cycle is only safe because resolution is lazy.

- [ ] **Step 1: Wire the use case into the container**

In `apps/api/src/container.ts`, add the import beside the other pool use cases (keep alphabetical order among them):

```typescript
import { ClosePoolUseCase } from './application/pool/ClosePoolUseCase'
```

Construct it right after `finalizeMatchUseCase` (line 192):

```typescript
  const closePoolUseCase = new ClosePoolUseCase({
    poolRepo,
    matchRepo,
    rankingRepo,
    notificationService,
    clock,
  })
```

And expose it in the returned object, next to `finalizeMatchUseCase`:

```typescript
    closePoolUseCase,
```

- [ ] **Step 2: Write the failing test**

In `apps/api/src/lib/telegram.test.ts`, add these three imports **at the top of the file**, beside the existing `import { describe, expect, it } from 'vitest'` (Biome's import sorting will place them; do not add a second vitest import):

```typescript
import { formatBrl } from '@m5nita/shared'
import type { ClosePoolResult } from '../application/pool/ClosePoolUseCase'
import { parsePoolCloseArgs, renderPoolCloseResult } from './telegram'
```

Then append the new `describe` blocks at the **bottom** of the file:

```typescript
describe('parsePoolCloseArgs', () => {
  it('reads the code and defaults to not forcing', () => {
    expect(parsePoolCloseArgs('9VZJQ9J9')).toEqual({ code: '9VZJQ9J9', force: false })
  })

  it('uppercases the code', () => {
    expect(parsePoolCloseArgs('9vzjq9j9')).toEqual({ code: '9VZJQ9J9', force: false })
  })

  it('forces when the second argument is confirmar', () => {
    expect(parsePoolCloseArgs('9VZJQ9J9 confirmar')).toEqual({ code: '9VZJQ9J9', force: true })
  })

  it('tolerates extra whitespace', () => {
    expect(parsePoolCloseArgs('  9VZJQ9J9   confirmar ')).toEqual({
      code: '9VZJQ9J9',
      force: true,
    })
  })

  it('returns the usage line when no code is given', () => {
    expect(parsePoolCloseArgs('').error).toBe('Uso: /bolao_encerrar CODIGO [confirmar]')
  })

  it('rejects an unrecognised second argument instead of silently forcing', () => {
    const parsed = parsePoolCloseArgs('9VZJQ9J9 sim')
    expect(parsed.error).toContain('confirmar')
    expect(parsed.code).toBeUndefined()
  })
})

describe('renderPoolCloseResult', () => {
  const closed: ClosePoolResult = {
    outcome: 'closed',
    poolName: 'Rafinha é careca!',
    stranded: [
      { id: 'm1', label: 'São Paulo FC × Santos FC', status: 'postponed' },
      { id: 'm2', label: 'Botafogo FR × Grêmio FBPA', status: 'postponed' },
    ],
    blocking: [],
    winners: [{ userId: 'u1', name: 'Igor Túllio', totalPoints: 22 }],
    prizeShare: 285,
  }

  it('reports the close, the ignored matches and the winner', () => {
    const text = renderPoolCloseResult(closed, '9VZJQ9J9')
    expect(text).toContain('Rafinha é careca!')
    expect(text).toContain('Jogos pendentes ignorados: 2')
    expect(text).toContain('Igor Túllio')
    expect(text).toContain('22 pts')
    // formatBrl emits a non-breaking space; never assert on a literal 'R$ 2,85'.
    expect(text).toContain(formatBrl(285))
    expect(text).toContain('Notificação enviada.')
  })

  it('lists the blocking matches and shows the confirmar form when refused', () => {
    const text = renderPoolCloseResult(
      {
        outcome: 'blocked',
        poolName: 'Rafinha é careca!',
        blocking: [
          { id: 'm3', label: 'CR Flamengo × CR Vasco da Gama', live: false },
          { id: 'm4', label: 'SE Palmeiras × São Paulo FC', live: true },
        ],
      },
      '9VZJQ9J9',
    )
    expect(text).toContain('2 jogo(s) em aberto')
    expect(text).toContain('• CR Flamengo × CR Vasco da Gama (agendado)')
    expect(text).toContain('• SE Palmeiras × São Paulo FC (em andamento)')
    expect(text).toContain('/bolao_encerrar 9VZJQ9J9 confirmar')
  })

  it('flags a forced close that left matches open', () => {
    const text = renderPoolCloseResult(
      { ...closed, blocking: [{ id: 'm4', label: 'SE Palmeiras × São Paulo FC', live: true }] },
      '9VZJQ9J9',
    )
    expect(text).toContain('⚠️')
    expect(text).toContain('1 jogo(s) ainda em aberto')
  })

  it('names every tied winner and the per-winner share', () => {
    const text = renderPoolCloseResult(
      {
        ...closed,
        winners: [
          { userId: 'u1', name: 'Ana', totalPoints: 22 },
          { userId: 'u2', name: 'Bia', totalPoints: 22 },
        ],
        prizeShare: 142,
      },
      '9VZJQ9J9',
    )
    expect(text).toContain('Vencedores (2)')
    expect(text).toContain('Ana')
    expect(text).toContain('Bia')
    expect(text).toContain(formatBrl(142))
  })

  it('says so when nobody scored', () => {
    const text = renderPoolCloseResult({ ...closed, winners: [], prizeShare: 0 }, '9VZJQ9J9')
    expect(text).toContain('Ninguém pontuou')
    expect(text).not.toContain('Notificação enviada.')
  })

  it('reports an unknown code', () => {
    expect(renderPoolCloseResult({ outcome: 'not-found' }, 'NOPE1234')).toContain('NOPE1234')
  })

  it('reports a pool that is not active', () => {
    const text = renderPoolCloseResult(
      { outcome: 'not-active', poolName: 'Rafinha é careca!', status: 'closed' },
      '9VZJQ9J9',
    )
    expect(text).toContain('closed')
    expect(text).toContain('Rafinha é careca!')
  })
})
```

The existing file already imports `describe`, `expect` and `it` from vitest and tests `isAdmin`; leave that block untouched.

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm --filter @m5nita/api exec vitest run src/lib/telegram.test.ts
```

Expected: FAIL — `parsePoolCloseArgs is not exported`.

- [ ] **Step 4: Write the implementation**

In `apps/api/src/lib/telegram.ts`, add to the imports:

```typescript
import { formatBrl } from '@m5nita/shared'
import type { ClosePoolResult } from '../application/pool/ClosePoolUseCase'
```

Then append, after the `bot.command('competicao_destacar', ...)` handler and before the `bot.callbackQuery(...)` handlers:

```typescript
export type PoolCloseArgs =
  | { error: string; code?: undefined; force?: undefined }
  | { error?: undefined; code: string; force: boolean }

/**
 * `/bolao_encerrar CODIGO [confirmar]`. Pure so it can be tested without
 * driving grammY — the handler is only a shell around this and the renderer.
 */
export function parsePoolCloseArgs(raw: string): PoolCloseArgs {
  const args = raw.split(/\s+/).filter(Boolean)
  const code = args[0]
  if (!code) {
    return { error: 'Uso: /bolao_encerrar CODIGO [confirmar]' }
  }

  const second = args[1]
  if (second !== undefined && second.toLowerCase() !== 'confirmar') {
    return { error: 'Segundo argumento inválido. Use: /bolao_encerrar CODIGO confirmar' }
  }

  return { code: code.toUpperCase(), force: second !== undefined }
}

export function renderPoolCloseResult(result: ClosePoolResult, code: string): string {
  if (result.outcome === 'not-found') {
    return `Nenhum bolão com o código ${code}.`
  }

  if (result.outcome === 'not-active') {
    return `Bolão "${result.poolName}" não está ativo (status: ${result.status}). Nada a fazer.`
  }

  if (result.outcome === 'blocked') {
    return [
      `❌ Não encerrado — ${result.blocking.length} jogo(s) em aberto:`,
      ...result.blocking.map((m) => `• ${m.label} (${m.live ? 'em andamento' : 'agendado'})`),
      '',
      'Para encerrar mesmo assim:',
      `/bolao_encerrar ${code} confirmar`,
    ].join('\n')
  }

  const header =
    result.blocking.length > 0
      ? `⚠️ Bolão "${result.poolName}" encerrado com ${result.blocking.length} jogo(s) ainda em aberto:\n${result.blocking
          .map((m) => `• ${m.label} (${m.live ? 'em andamento' : 'agendado'})`)
          .join('\n')}`
      : `Bolão "${result.poolName}" encerrado.`

  const lines = [header, '', `Jogos pendentes ignorados: ${result.stranded.length}`]

  if (result.winners.length === 0) {
    lines.push('Ninguém pontuou — sem vencedor e sem prêmio a pagar.')
    return lines.join('\n')
  }

  if (result.winners.length === 1) {
    const winner = result.winners[0]
    lines.push(
      `Vencedor: ${winner?.name ?? 'sem nome'} — ${winner?.totalPoints} pts — ${formatBrl(result.prizeShare)}`,
    )
  } else {
    lines.push(`Vencedores (${result.winners.length}) — ${formatBrl(result.prizeShare)} cada:`)
    lines.push(...result.winners.map((w) => `• ${w.name ?? 'sem nome'} — ${w.totalPoints} pts`))
  }

  lines.push('Notificação enviada.')
  return lines.join('\n')
}

bot.command('bolao_encerrar', async (ctx) => {
  if (!ctx.from || !isAdmin(ctx.from.id)) {
    await ctx.reply('Você não tem permissão para este comando.')
    return
  }

  const parsed = parsePoolCloseArgs(ctx.match)
  if (parsed.error) {
    await ctx.reply(parsed.error)
    return
  }

  try {
    const { closePoolUseCase } = getContainer()
    const result = await closePoolUseCase.execute({ inviteCode: parsed.code, force: parsed.force })
    await ctx.reply(renderPoolCloseResult(result, parsed.code))
  } catch (error) {
    console.error('[Telegram] /bolao_encerrar failed:', error)
    await ctx.reply('Erro ao encerrar o bolão. Tente novamente.')
  }
})
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @m5nita/api exec vitest run src/lib/telegram.test.ts
pnpm --filter @m5nita/api exec tsc --noEmit
```

Expected: tests PASS, type-check clean.

- [ ] **Step 6: Commit**

```bash
pnpm biome check --write apps/api/
git add apps/api/src/container.ts apps/api/src/lib/telegram.ts apps/api/src/lib/telegram.test.ts
git commit -m "feat(037): comando /bolao_encerrar CODIGO [confirmar] no bot admin"
```

---

### Task 6: End-to-end proof against a real database

**Files:**
- Modify: `apps/api/tests/integration/scenarios/admin-close-pool.test.ts` (append a second `describe`)

**Interfaces:**
- Consumes: `container.closePoolUseCase` (Task 5); the `buildTestApp` harness, `makeCompetition` / `makeMatch` / `makePool` fixtures, `signInViaPhoneOtp`, `deliverInfinitePayPaidWebhook`, `telegramStub`.
- Produces: nothing — this is the outermost proof.

**Context:** This reproduces production pool `c17fba18` in miniature: a matchday-range pool where some matches finished and the rest are postponed with a past date, and where nobody could predict the postponed ones. It must show the pool closing, the winner being notified, and — the reason the feature exists — that a later reschedule cannot reopen it.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/tests/integration/scenarios/admin-close-pool.test.ts` (and add `telegramStub` to the imports from `../support/stubs`):

```typescript
describe('Admin close pool — end to end', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  it('closes a pool stranded by postponed matches, and the close is final', async () => {
    const baseline = new Date('2026-07-31T12:00:00Z')
    const { app, container, clock } = buildTestApp({ initialNow: baseline })
    const comp = await makeCompetition(sql)
    const owner = await signInViaPhoneOtp(app, { phoneNumber: '+5511977700010' })
    const pool = await makePool({
      admin: owner,
      competitionId: comp.id,
      entryFeeCentavos: 100,
      matchdayFrom: 21,
      matchdayTo: 21,
    })
    expect((await deliverInfinitePayPaidWebhook(app, pool.paymentId)).status).toBe(200)

    // Played and scored before the admin steps in.
    await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: new Date('2026-07-29T22:30:00Z'),
      matchday: 21,
      status: 'finished',
      homeScore: 1,
      awayScore: 1,
    })
    // Never kicked off; still holding the pool open.
    const postponed = await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: new Date('2026-07-29T00:00:00Z'),
      matchday: 21,
      status: 'postponed',
      homeTeam: 'São Paulo FC',
      awayTeam: 'Santos FC',
    })

    telegramStub.reset()

    const result = await container.closePoolUseCase.execute({
      inviteCode: pool.inviteCode,
      force: false,
    })

    expect(result.outcome).toBe('closed')
    if (result.outcome !== 'closed') return
    expect(result.stranded.map((m) => m.id)).toEqual([postponed.id])

    const [row] = await sql`SELECT status FROM pool WHERE id = ${pool.id}`
    expect(row?.status).toBe('closed')

    // The postponed match is untouched — no status was rewritten to force this.
    const [stillPostponed] = await sql`SELECT status FROM "match" WHERE id = ${postponed.id}`
    expect(stillPostponed?.status).toBe('postponed')

    // The reason the close must be final: a reschedule must not reopen predictions.
    clock.setNow(new Date('2026-08-01T12:00:00Z'))
    await sql`
      UPDATE "match"
      SET status = 'scheduled', match_date = ${new Date('2026-08-10T21:30:00Z')}
      WHERE id = ${postponed.id}
    `
    const late = await owner.fetch(`/api/pools/${pool.id}/predictions/${postponed.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 3, awayScore: 0 }),
    })
    expect(late.status).toBeGreaterThanOrEqual(400)
  })

  it('refuses a pool whose next match has not kicked off yet', async () => {
    const baseline = new Date('2026-07-31T12:00:00Z')
    const { app, container } = buildTestApp({ initialNow: baseline })
    const comp = await makeCompetition(sql)
    const owner = await signInViaPhoneOtp(app, { phoneNumber: '+5511977700011' })
    const pool = await makePool({
      admin: owner,
      competitionId: comp.id,
      entryFeeCentavos: 100,
      matchdayFrom: 40,
      matchdayTo: 40,
    })
    expect((await deliverInfinitePayPaidWebhook(app, pool.paymentId)).status).toBe(200)

    await makeMatch(sql, {
      competitionId: comp.id,
      matchDate: new Date('2026-08-09T21:30:00Z'),
      matchday: 40,
      status: 'scheduled',
      homeTeam: 'CR Flamengo',
      awayTeam: 'CR Vasco da Gama',
    })

    const refused = await container.closePoolUseCase.execute({
      inviteCode: pool.inviteCode,
      force: false,
    })
    expect(refused.outcome).toBe('blocked')

    const [stillActive] = await sql`SELECT status FROM pool WHERE id = ${pool.id}`
    expect(stillActive?.status).toBe('active')

    const forced = await container.closePoolUseCase.execute({
      inviteCode: pool.inviteCode,
      force: true,
    })
    expect(forced.outcome).toBe('closed')

    const [nowClosed] = await sql`SELECT status FROM pool WHERE id = ${pool.id}`
    expect(nowClosed?.status).toBe('closed')
  })
})
```

- [ ] **Step 2: Run it**

```bash
DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test \
  pnpm --filter @m5nita/api test:integration tests/integration/scenarios/admin-close-pool.test.ts
```

Expected: PASS, 4 tests in the file. If the late-prediction assertion fails with a 2xx, the pool status gate is not being applied on the prediction path — investigate `PoolStatus.canAcceptPredictions()` before adjusting the test.

- [ ] **Step 3: Run the full suite and every guardrail**

```bash
pnpm test
pnpm check:leaks
pnpm check:arch
pnpm biome check .
DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test \
  pnpm --filter @m5nita/api test:integration
```

Expected: all green. `pnpm biome check .` reports pre-existing warnings in `apps/web/public/push-sw.js` and `apps/web/src/components/pool/stats/EvolutionLineChart.tsx` — those predate this branch. Leave them alone; do not reformat files this feature does not touch.

- [ ] **Step 4: Commit**

```bash
git add apps/api/tests/integration/scenarios/admin-close-pool.test.ts
git commit -m "test(037): cenário de integração do encerramento admin, incluindo o selo contra remarcação"
```

---

### Task 7: Ship it and fix the production pool

**Files:** none — this task is deploy plus one Telegram message.

**Interfaces:**
- Consumes: everything above, deployed.
- Produces: pool `c17fba18-8a5b-42a1-af9f-76ecb828f0e5` closed and its prize withdrawable.

**Context:** Production state as measured on 2026-07-31 — pool `Rafinha é careca!`, invite code `9VZJQ9J9`, Brasileirão matchday 21, `status: active`, 3 members, entry R$ 1,00. Six matches finished, four postponed with original date 2026-07-29 and no reschedule in the feed. Standings: Igor Túllio 22, RafaTiroCerto 15, João Paulo 15. All three members hold exactly six predictions, so nothing is lost by closing.

- [ ] **Step 1: Open the pull request and merge after review**

```bash
git push -u origin 037-admin-close-pool
```

The `gh` CLI times out on this network (DNS is intercepted), so open the PR through the web compare URL rather than the CLI.

- [ ] **Step 2: Confirm `ADMIN_USER_IDS` is set in production**

The command is gated by `isAdmin`, which reads `ADMIN_USER_IDS`. The coupon and competition commands already depend on it, so it should be present — verify before assuming the deploy is enough.

- [ ] **Step 3: Re-check the production state right before acting**

The feed may have rescheduled a match between planning and deploy, which would legitimately turn the close into a refusal.

```sql
SELECT status, count(*), min(match_date), max(match_date)
FROM "match"
WHERE competition_id = '346c528a-b41c-4c55-a33d-eda33ae9a2f2' AND matchday = 21
GROUP BY status;
```

Expected: 6 `finished`, 4 `postponed` with dates on 2026-07-29. If any row is `scheduled` with a future date, stop — the pool is legitimately still open and the command will (correctly) refuse.

- [ ] **Step 4: Run the command in Telegram**

```
/bolao_encerrar 9VZJQ9J9
```

Expected reply: the pool closed, `Jogos pendentes ignorados: 4`, and `Vencedor: Igor Túllio — 22 pts — R$ 2,85`. No `confirmar` should be needed. If it refuses, read which matches it names and go back to Step 3 rather than reaching for `confirmar`.

- [ ] **Step 5: Verify in the database and in the app**

```sql
SELECT id, name, status, updated_at
FROM pool
WHERE id = 'c17fba18-8a5b-42a1-af9f-76ecb828f0e5';

SELECT status, count(*)
FROM "match"
WHERE competition_id = '346c528a-b41c-4c55-a33d-eda33ae9a2f2' AND matchday = 21
GROUP BY status;
```

Expected: pool `status = 'closed'`; the match counts **unchanged** from Step 3 — the feature must not have written to any match row. Then confirm in the app that the winner sees the prize screen and can request a withdrawal.

---

## Self-Review

**Spec coverage.** FR-001 and FR-002 → Task 1. FR-003 → Task 2. FR-004 → Task 5. FR-005 → Task 5 (`isAdmin` guard). FR-006 and FR-007 → Tasks 4 and 5. FR-008 → Task 3. FR-009 → Task 4 (`not-active` branch). FR-010 → Task 3, enforced by leaving `closePoolsJob.test.ts` unedited. FR-011 → Task 6 asserts the postponed row is untouched. FR-012 → Task 5's renderer. SC-001 → Task 7. SC-002 → Task 5. SC-003 → Tasks 4 and 6. SC-004 → Task 3, Step 3. SC-005 → Task 6's late-prediction assertion.

**Edge cases from the spec.** Already closed → Task 4. Unknown code → Tasks 4 and 5. `pending`/`cancelled` pool → the `not-active` branch. Lowercase code → Tasks 4 and 5. Missing argument → Task 5's parser. Tie at the top → Tasks 4 and 5. Nobody scored → Tasks 4 and 5. Single-match pool → covered by `Pool.unfinishedMatchesQuery()`; no branch in the command. Postponed with a future date → Task 1.

**Type consistency.** `ClosePoolResult` is defined once in Task 4 and consumed unchanged in Tasks 5 and 6. `PoolClosurePolicy.blocks(match, now)` keeps that signature in Tasks 1 and 4. `notifyPoolWinners` returns `{ winners: RankingEntry[]; prizeShare: number }` in Task 3 and is read as `notified.winners` / `notified.prizeShare` in Task 4. `findUnfinishedFor(query)` returns `MatchData[]` in Task 2 and is consumed as rows with `homeTeam`/`awayTeam`/`status` in Tasks 4 and 6.

**Deviation from the brainstormed design, on purpose.** The design sketched in conversation had `closePoolsJob` delegating wholesale to `ClosePoolUseCase`. Implementing that would force `closePoolsJob.test.ts` to grow a `findUnfinishedFor` mock and would break its `hasUnfinishedFor` assertions, contradicting the spec's SC-004. Task 3 shares the winner-notification tail instead and leaves the job's control flow alone: the same outcome for the members, a smaller blast radius on the path that moves real money, and a test that proves it.

---

## As-built deviations

Recorded after the final whole-branch code review, so re-running this plan from
scratch does not reintroduce the same three gaps.

1. **Task 5's file placement.** The plan places `parsePoolCloseArgs` and
   `renderPoolCloseResult` in `lib/telegram.ts`. They shipped instead in a new
   `lib/poolCloseCommand.ts`, imported by `lib/telegram.ts`. Reason: `lib/telegram.ts`
   imports `./container` → `../db/client`, so a unit test for these two pure functions
   would have pulled in the database module and required `DATABASE_URL` just to run —
   defeating the point of keeping them pure and unit-testable. Extracting them into
   their own leaf module keeps `poolCloseCommand.test.ts` free of that import chain.

2. **Task 6's late-prediction assertion.** The plan's Step 1 asserts
   `expect(late.status).toBeGreaterThanOrEqual(400)`. It shipped tighter:
   `expect(late.status).toBe(409)` plus
   `expect(((await late.json()) as { error: string }).error).toBe('POOL_CLOSED')`.
   Reason: the loose assertion would also pass on an unrelated 4xx (a validation
   error, say), which would not prove the closed-pool gate is what rejected the
   request. Asserting the specific status and error code proves the right guard fired.

3. **Task 6's unused `telegramStub` import.** The plan's Step 1 has the test import
   `telegramStub` from `../support/stubs` and call `telegramStub.reset()` before
   closing the pool, but never asserts on it. It shipped without that import or the
   `reset()` call. Reason: in this test harness `sends()` is empty by construction
   for a fresh stub in this scenario — there is nothing to reset or assert, and an
   unused import is dead code the branch's own conventions forbid.
