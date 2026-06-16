# Live Match Minute Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the live match clock (current minute, plus stoppage time as `45+2'`) inline with the existing "Ao Vivo" indicator on the prediction screen and the matches-list card.

**Architecture:** football-data.org returns `minute`/`injuryTime` on the match object only when the request sends `X-Api-Version: v4.1`. We add that header, capture the two fields in the 1-minute live-score sync, persist them as nullable columns on `match`, expose them through `GET /api/matches` and the shared `Match` type, and render them via a pure `formatMatchMinute` helper. The minute is shown as last-synced (no client-side ticking). `minute`/`injuryTime` are presentational data, not business rules, so they flow through the persistence/DTO layers and never touch the `Match` domain aggregate or scoring.

**Tech Stack:** TypeScript, Hono, Drizzle ORM (Postgres), Vitest; React 19 + TanStack Router/Query + Tailwind v4; `@testing-library/react` (jsdom).

**Reference spec:** `specs/025-live-match-minute/spec.md`

**Conventions for every task below:**
- Run a single API test file: `pnpm --filter @m5nita/api exec vitest run <path>`
- Run a single web test file: `pnpm --filter @m5nita/web exec vitest run <path>`
- Lint/format touched files: `pnpm biome check --write <files>`
- Commit steps assume work happens on branch `025-live-match-minute` (create it before Task 1 if not already on it: `git checkout -b 025-live-match-minute`). **Do not push.**

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `apps/api/src/infrastructure/external/FootballDataApiAdapter.ts` | modify | send `X-Api-Version: v4.1` header |
| `apps/api/src/infrastructure/external/FootballDataApiAdapter.test.ts` | create | assert the header is sent |
| `apps/api/src/application/ports/FootballDataApi.port.ts` | modify | add `minute`/`injuryTime` to `ExternalMatch` |
| `apps/api/src/application/match/SyncLiveScoresUseCase.ts` | modify | map `minute`/`injuryTime` into the persisted update |
| `apps/api/src/application/match/SyncLiveScoresUseCase.test.ts` | modify | assert the mapping |
| `apps/api/src/domain/match/MatchRepository.port.ts` | modify | add `minute`/`injuryTime` to `MatchResultUpdate` |
| `apps/api/src/infrastructure/persistence/DrizzleMatchRepository.ts` | modify | persist the two fields in `updateScores` |
| `apps/api/src/db/schema/match.ts` | modify | add `minute` / `injury_time` columns |
| `apps/api/drizzle/0013_*.sql` + `meta/_journal.json` + `meta/0013_snapshot.json` | create (generated) | migration adding the columns |
| `apps/api/src/infrastructure/http/routes/matches.ts` | modify | return `minute`/`injuryTime` in the DTO |
| `packages/shared/src/types/index.ts` | modify | add `minute`/`injuryTime` to `Match` |
| `apps/web/src/lib/utils.ts` | modify | add `formatMatchMinute` |
| `apps/web/src/lib/utils.test.ts` | modify | test `formatMatchMinute` |
| `apps/web/src/components/prediction/ScoreInput.tsx` | modify | thread + render the clock in `LiveResultHeader` |
| `apps/web/src/components/prediction/ScoreInput.test.tsx` | modify | test the live clock rendering |
| `apps/web/src/routes/pools/$poolId/predictions.tsx` | modify | pass `minute`/`injuryTime` to `ScoreInput` |
| `apps/web/src/components/match/MatchCard.tsx` | modify | append the clock to the live badge |
| `apps/web/src/components/match/MatchCard.test.tsx` | create | test the badge |

---

## Task 1: Enable the v4.1 fields from the provider

**Files:**
- Modify: `apps/api/src/infrastructure/external/FootballDataApiAdapter.ts:28-30`
- Modify: `apps/api/src/application/ports/FootballDataApi.port.ts:9-10`
- Test: `apps/api/src/infrastructure/external/FootballDataApiAdapter.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/infrastructure/external/FootballDataApiAdapter.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FootballDataApiAdapter } from './FootballDataApiAdapter'

describe('FootballDataApiAdapter', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends X-Api-Version: v4.1 (required to receive minute/injuryTime) alongside the auth token', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ matches: [] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new FootballDataApiAdapter('test-token')
    await adapter.fetchMatches('WC', '2026')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.headers).toMatchObject({
      'X-Auth-Token': 'test-token',
      'X-Api-Version': 'v4.1',
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @m5nita/api exec vitest run src/infrastructure/external/FootballDataApiAdapter.test.ts`
Expected: FAIL — the headers object is missing `X-Api-Version`.

- [ ] **Step 3: Add the header**

In `apps/api/src/infrastructure/external/FootballDataApiAdapter.ts`, change the `fetch` headers (lines 28-30):

```ts
    const res = await fetch(`${FOOTBALL_DATA_BASE}${endpoint}`, {
      // X-Api-Version v4.1 unlocks the live `minute`/`injuryTime` fields on the
      // Livescore plan; the default v4 omits them to keep stable responses.
      headers: { 'X-Auth-Token': this.apiToken, 'X-Api-Version': 'v4.1' },
    })
```

- [ ] **Step 4: Add the fields to the provider type**

In `apps/api/src/application/ports/FootballDataApi.port.ts`, insert into `ExternalMatch` right after `matchday: number | null` (line 9):

```ts
  matchday: number | null
  // Live elapsed clock — only present when the request carries X-Api-Version: v4.1.
  minute?: number | null
  injuryTime?: number | null
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @m5nita/api exec vitest run src/infrastructure/external/FootballDataApiAdapter.test.ts`
Expected: PASS.

- [ ] **Step 6: Lint + commit**

```bash
pnpm biome check --write apps/api/src/infrastructure/external/FootballDataApiAdapter.ts apps/api/src/infrastructure/external/FootballDataApiAdapter.test.ts apps/api/src/application/ports/FootballDataApi.port.ts
git add apps/api/src/infrastructure/external/FootballDataApiAdapter.ts apps/api/src/infrastructure/external/FootballDataApiAdapter.test.ts apps/api/src/application/ports/FootballDataApi.port.ts
git commit -m "feat(matches): request football-data v4.1 to receive live minute/injuryTime"
```

---

## Task 2: Persist minute/injuryTime in the live-score sync

**Files:**
- Modify: `apps/api/src/domain/match/MatchRepository.port.ts:44-45`
- Modify: `apps/api/src/application/match/SyncLiveScoresUseCase.ts:31-44,117`
- Modify: `apps/api/src/infrastructure/persistence/DrizzleMatchRepository.ts:176-178`
- Modify: `apps/api/src/db/schema/match.ts:23-24`
- Test: `apps/api/src/application/match/SyncLiveScoresUseCase.test.ts` (modify)

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/application/match/SyncLiveScoresUseCase.test.ts`, add two cases at the end of the `describe('SyncLiveScoresUseCase', ...)` block (before its closing `})` on line 110):

```ts
  it('persists the live minute and injury time reported by the provider', async () => {
    const { uc, updateScores } = makeUseCase({
      existing: [existingMatch({ status: 'live' })],
      live: [
        externalMatch({
          status: 'IN_PLAY',
          minute: 45,
          injuryTime: 2,
          score: { fullTime: { home: 1, away: 0 } },
        }),
      ],
    })

    await uc.execute()

    expect(updateScores).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ minute: 45, injuryTime: 2 }),
    )
  })

  it('defaults minute/injuryTime to null when the provider omits them', async () => {
    const { uc, updateScores } = makeUseCase({
      existing: [existingMatch({ status: 'live' })],
      live: [externalMatch({ status: 'IN_PLAY', score: { fullTime: { home: 0, away: 0 } } })],
    })

    await uc.execute()

    expect(updateScores).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ minute: null, injuryTime: null }),
    )
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @m5nita/api exec vitest run src/application/match/SyncLiveScoresUseCase.test.ts`
Expected: FAIL — the persisted update has no `minute`/`injuryTime` keys.

- [ ] **Step 3: Add the fields to the write contract**

In `apps/api/src/domain/match/MatchRepository.port.ts`, insert into `MatchResultUpdate` right after `penaltyAwayScore?: number | null` (line 45):

```ts
  penaltyHomeScore?: number | null
  penaltyAwayScore?: number | null
  /** Live elapsed clock from the provider (v4.1); null when not playing / not reported. */
  minute?: number | null
  injuryTime?: number | null
```

- [ ] **Step 4: Map the fields in the use case**

In `apps/api/src/application/match/SyncLiveScoresUseCase.ts`, replace `toResultUpdate` (lines 30-44) so it takes the whole match and reads the top-level clock fields:

```ts
/** Maps a provider match to a persisted result: graded scoreline = 90' (regular time), never extra time/penalties. */
function toResultUpdate(m: ExternalMatch, status: string): MatchResultUpdate {
  const { score } = m
  const graded = gradedScoreline({ fullTime: score.fullTime, regularTime: score.regularTime })
  return {
    homeScore: graded.home ?? 0,
    awayScore: graded.away ?? 0,
    status,
    winner: mapWinner(score.winner),
    duration: mapDuration(score.duration),
    extraTimeHomeScore: score.extraTime?.home ?? null,
    extraTimeAwayScore: score.extraTime?.away ?? null,
    penaltyHomeScore: score.penalties?.home ?? null,
    penaltyAwayScore: score.penalties?.away ?? null,
    minute: m.minute ?? null,
    injuryTime: m.injuryTime ?? null,
  }
}
```

Then update the call site (line 117) from `toResultUpdate(m.score, newStatus)` to:

```ts
    await this.deps.matchRepo.updateScores(existing.id, toResultUpdate(m, newStatus))
```

- [ ] **Step 5: Persist the fields in the repository**

In `apps/api/src/infrastructure/persistence/DrizzleMatchRepository.ts`, add two lines to the `.set({ ... })` of `updateScores`, right after `penaltyAwayScore` (line 177) and before `updatedAt`:

```ts
        penaltyHomeScore: result.penaltyHomeScore ?? null,
        penaltyAwayScore: result.penaltyAwayScore ?? null,
        minute: result.minute ?? null,
        injuryTime: result.injuryTime ?? null,
        updatedAt: new Date(),
```

- [ ] **Step 6: Add the columns to the schema**

In `apps/api/src/db/schema/match.ts`, insert after `penaltyAwayScore` (line 23):

```ts
    penaltyHomeScore: integer('penalty_home_score'),
    penaltyAwayScore: integer('penalty_away_score'),
    // Live elapsed clock (football-data v4.1); only meaningful while status = 'live'.
    minute: integer('minute'),
    injuryTime: integer('injury_time'),
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @m5nita/api exec vitest run src/application/match/SyncLiveScoresUseCase.test.ts`
Expected: PASS (all cases, including the two new ones).

- [ ] **Step 8: Generate the migration and pin its journal timestamp**

Run: `pnpm --filter @m5nita/api db:generate`
Expected: creates `apps/api/drizzle/0013_<random-word>.sql` containing:

```sql
ALTER TABLE "match" ADD COLUMN "minute" integer;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "injury_time" integer;
```

Then open `apps/api/drizzle/meta/_journal.json` and set the **new** (`idx: 13`, `tag: "0013_<random-word>"`) entry's `when` to **`1781511100000`** (exactly 100000 above `0012`'s `1781511000000`). This continues the repo's manual monotonic cadence so boot-time migrate never skips it, regardless of machine clock — see the migration gotcha in `CLAUDE.md`.

> Do NOT hand-edit the generated `.sql` or the `meta/0013_snapshot.json`; only the `when` in `_journal.json`.

- [ ] **Step 9: Commit**

```bash
pnpm biome check --write apps/api/src/domain/match/MatchRepository.port.ts apps/api/src/application/match/SyncLiveScoresUseCase.ts apps/api/src/application/match/SyncLiveScoresUseCase.test.ts apps/api/src/infrastructure/persistence/DrizzleMatchRepository.ts apps/api/src/db/schema/match.ts
git add apps/api/src/domain/match/MatchRepository.port.ts apps/api/src/application/match/SyncLiveScoresUseCase.ts apps/api/src/application/match/SyncLiveScoresUseCase.test.ts apps/api/src/infrastructure/persistence/DrizzleMatchRepository.ts apps/api/src/db/schema/match.ts apps/api/drizzle/
git commit -m "feat(matches): persist live minute/injuryTime from the score sync"
```

---

## Task 3: Expose minute/injuryTime through the API and shared type

**Files:**
- Modify: `apps/api/src/infrastructure/http/routes/matches.ts:33-34`
- Modify: `packages/shared/src/types/index.ts:127-128`

- [ ] **Step 1: Add the columns to the matches DTO**

In `apps/api/src/infrastructure/http/routes/matches.ts`, add two entries to `matchColumns` after `status: match.status` (line 34):

```ts
  matchDate: match.matchDate,
  status: match.status,
  minute: match.minute,
  injuryTime: match.injuryTime,
}
```

- [ ] **Step 2: Add the fields to the shared `Match` type**

In `packages/shared/src/types/index.ts`, insert into `interface Match` after `penaltyAwayScore?: number | null` (line 127), before `winner`:

```ts
  penaltyHomeScore?: number | null
  penaltyAwayScore?: number | null
  /** Live elapsed clock (only meaningful while status = 'live'); null otherwise. */
  minute?: number | null
  injuryTime?: number | null
  winner?: MatchWinner | null
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS — API DTO and shared type now agree; the web app still compiles (new fields are optional).

- [ ] **Step 4: Commit**

```bash
pnpm biome check --write apps/api/src/infrastructure/http/routes/matches.ts packages/shared/src/types/index.ts
git add apps/api/src/infrastructure/http/routes/matches.ts packages/shared/src/types/index.ts
git commit -m "feat(matches): expose live minute/injuryTime in the matches API and shared type"
```

---

## Task 4: `formatMatchMinute` helper (frontend)

**Files:**
- Modify: `apps/web/src/lib/utils.ts`
- Test: `apps/web/src/lib/utils.test.ts` (modify)

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/lib/utils.test.ts`, add the import and a new describe block:

```ts
import { computePlatformFee } from '@m5nita/shared'
import { describe, expect, it } from 'vitest'
import { formatMatchMinute } from './utils'
```

```ts
describe('formatMatchMinute', () => {
  it('formats a plain running minute', () => {
    expect(formatMatchMinute(67, null)).toBe("67'")
  })

  it('formats stoppage time as MM+N', () => {
    expect(formatMatchMinute(45, 2)).toBe("45+2'")
    expect(formatMatchMinute(90, 4)).toBe("90+4'")
  })

  it('ignores zero injury time', () => {
    expect(formatMatchMinute(90, 0)).toBe("90'")
  })

  it('returns null when there is no minute', () => {
    expect(formatMatchMinute(null, null)).toBeNull()
    expect(formatMatchMinute(undefined, 3)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @m5nita/web exec vitest run src/lib/utils.test.ts`
Expected: FAIL — `formatMatchMinute` is not exported.

- [ ] **Step 3: Implement the helper**

In `apps/web/src/lib/utils.ts`, append:

```ts
/**
 * Live match clock for display: `67'`, or `45+2'` during stoppage.
 * Returns null when there is no minute to show (so callers render nothing).
 */
export function formatMatchMinute(
  minute: number | null | undefined,
  injuryTime: number | null | undefined,
): string | null {
  if (minute == null) return null
  return injuryTime && injuryTime > 0 ? `${minute}+${injuryTime}'` : `${minute}'`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @m5nita/web exec vitest run src/lib/utils.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm biome check --write apps/web/src/lib/utils.ts apps/web/src/lib/utils.test.ts
git add apps/web/src/lib/utils.ts apps/web/src/lib/utils.test.ts
git commit -m "feat(web): add formatMatchMinute helper for the live clock"
```

---

## Task 5: Render the clock in the prediction header (`LiveResultHeader`)

**Files:**
- Modify: `apps/web/src/components/prediction/ScoreInput.tsx:13,19-51,230-272,568-595,702-709`
- Modify: `apps/web/src/routes/pools/$poolId/predictions.tsx:201`
- Test: `apps/web/src/components/prediction/ScoreInput.test.tsx` (modify)

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/components/prediction/ScoreInput.test.tsx`, add a new describe block at the end of the file (after the knockout block, line 229):

```ts
function renderLive(overrides: Record<string, unknown> = {}) {
  const matchDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  return render(
    <ScoreInput
      matchId="m1"
      homeTeam="BRA"
      awayTeam="ARG"
      homeFlag={null}
      awayFlag={null}
      matchDate={matchDate}
      stage="group"
      homeScore={null}
      awayScore={null}
      matchStatus="live"
      points={null}
      actualHomeScore={0}
      actualAwayScore={0}
      onSave={vi.fn(async () => {})}
      {...overrides}
    />,
  )
}

describe('<ScoreInput /> live minute', () => {
  afterEach(() => cleanup())

  it('shows the running minute next to "Ao Vivo" when live', () => {
    renderLive({ minute: 67 })
    expect(screen.getByText('Ao Vivo')).toBeInTheDocument()
    expect(screen.getByText(/67'/)).toBeInTheDocument()
  })

  it('shows stoppage time as MM+N', () => {
    renderLive({ minute: 45, injuryTime: 2 })
    expect(screen.getByText(/45\+2'/)).toBeInTheDocument()
  })

  it('shows no minute when the feed omits it', () => {
    renderLive({ minute: null })
    expect(screen.getByText('Ao Vivo')).toBeInTheDocument()
    expect(screen.queryByText(/\d+'/)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @m5nita/web exec vitest run src/components/prediction/ScoreInput.test.tsx`
Expected: FAIL — the clock text (`67'`, `45+2'`) is not rendered.

- [ ] **Step 3: Import the helper**

In `apps/web/src/components/prediction/ScoreInput.tsx`, update the utils import (line 13):

```ts
import { formatDate, formatMatchMinute } from '../../lib/utils'
```

- [ ] **Step 4: Add the props to `ScoreInputProps`**

In the `interface ScoreInputProps` (lines 19-51), add after `penaltyAwayScore?: number | null` (line 42):

```ts
  penaltyHomeScore?: number | null
  penaltyAwayScore?: number | null
  minute?: number | null
  injuryTime?: number | null
```

- [ ] **Step 5: Destructure the new props**

In the `ScoreInput` component parameter list (lines 568-595), add `minute,` and `injuryTime,` after `penaltyAwayScore,` (line 591):

```ts
    penaltyHomeScore,
    penaltyAwayScore,
    minute,
    injuryTime,
    onSave,
```

- [ ] **Step 6: Render the clock inside `LiveResultHeader`**

Replace `LiveResultHeader` (lines 230-272) with:

```tsx
function LiveResultHeader({
  matchStatus,
  isLocked,
  hasActualScore,
  actualHomeScore,
  actualAwayScore,
  wentToOvertime,
  minute,
  injuryTime,
}: {
  matchStatus: string
  isLocked: boolean
  hasActualScore: boolean
  actualHomeScore: number | null
  actualAwayScore: number | null
  wentToOvertime: boolean
  minute?: number | null
  injuryTime?: number | null
}) {
  if (!((isLocked && hasActualScore) || matchStatus === 'live')) return null
  // For matches that went past 90', the displayed score is the regular-time
  // score (what predictions grade against), so label it as such.
  const finishedLabel = wentToOvertime ? 'Tempo normal' : 'Resultado oficial'
  const clock = matchStatus === 'live' ? formatMatchMinute(minute, injuryTime) : null
  return (
    <div
      className={`mb-1 flex items-center justify-center gap-2 font-display text-[10px] font-bold uppercase leading-none tracking-widest ${
        matchStatus === 'live' ? 'text-red' : 'text-gray-muted'
      }`}
    >
      {matchStatus === 'live' ? (
        <span className="flex items-center gap-1">
          <span className="h-1 w-1 animate-pulse rounded-full bg-red" aria-hidden="true" />
          Ao Vivo
        </span>
      ) : (
        <span>{finishedLabel}</span>
      )}
      {clock && <span>· {clock}</span>}
      {hasActualScore && (
        <span className="flex items-center gap-1.5">
          <span>{actualHomeScore}</span>
          <span>x</span>
          <span>{actualAwayScore}</span>
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Pass the props at the `LiveResultHeader` call site**

In the `ScoreInput` return (lines 702-709), add `minute`/`injuryTime`:

```tsx
      <LiveResultHeader
        matchStatus={matchStatus}
        isLocked={isLocked}
        hasActualScore={hasActualScore}
        actualHomeScore={actualHomeScore}
        actualAwayScore={actualAwayScore}
        wentToOvertime={duration === 'extra_time' || duration === 'penalty_shootout'}
        minute={minute}
        injuryTime={injuryTime}
      />
```

- [ ] **Step 8: Feed the data from the predictions route**

In `apps/web/src/routes/pools/$poolId/predictions.tsx`, add two props to the `<ScoreInput>` element after `actualAwayScore={match.awayScore}` (line 201):

```tsx
          actualHomeScore={match.homeScore}
          actualAwayScore={match.awayScore}
          minute={match.minute}
          injuryTime={match.injuryTime}
          winner={match.winner}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm --filter @m5nita/web exec vitest run src/components/prediction/ScoreInput.test.tsx`
Expected: PASS (existing tests still green, three new ones pass).

- [ ] **Step 10: Lint + commit**

```bash
pnpm biome check --write apps/web/src/components/prediction/ScoreInput.tsx apps/web/src/components/prediction/ScoreInput.test.tsx apps/web/src/routes/pools/\$poolId/predictions.tsx
git add apps/web/src/components/prediction/ScoreInput.tsx apps/web/src/components/prediction/ScoreInput.test.tsx "apps/web/src/routes/pools/\$poolId/predictions.tsx"
git commit -m "feat(web): show live minute in the prediction header between Ao Vivo and score"
```

---

## Task 6: Append the clock to the matches-list card (`MatchCard`)

**Files:**
- Modify: `apps/web/src/components/match/MatchCard.tsx:2,23-26,56-61`
- Test: `apps/web/src/components/match/MatchCard.test.tsx` (create)

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/match/MatchCard.test.tsx`:

```tsx
import type { Match } from '@m5nita/shared'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MatchCard } from './MatchCard'

function liveMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    competitionId: 'c1',
    homeTeam: 'BRA',
    awayTeam: 'ARG',
    homeFlag: null,
    awayFlag: null,
    homeScore: 1,
    awayScore: 0,
    stage: 'group',
    group: 'A',
    matchday: 1,
    matchDate: '2026-06-15T20:00:00Z',
    status: 'live',
    minute: 67,
    injuryTime: null,
    ...overrides,
  }
}

describe('<MatchCard /> live minute', () => {
  afterEach(() => cleanup())

  it('appends the running minute to the "Ao Vivo" badge when live', () => {
    render(<MatchCard match={liveMatch()} />)
    expect(screen.getByText(/Ao Vivo · 67'/)).toBeInTheDocument()
  })

  it('shows stoppage time as MM+N', () => {
    render(<MatchCard match={liveMatch({ minute: 90, injuryTime: 4 })} />)
    expect(screen.getByText(/Ao Vivo · 90\+4'/)).toBeInTheDocument()
  })

  it('shows no minute for a scheduled match', () => {
    render(<MatchCard match={liveMatch({ status: 'scheduled', minute: null })} />)
    expect(screen.queryByText(/\d+'/)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @m5nita/web exec vitest run src/components/match/MatchCard.test.tsx`
Expected: FAIL — the badge reads "Ao Vivo" with no minute.

- [ ] **Step 3: Import the helper and compute the clock**

In `apps/web/src/components/match/MatchCard.tsx`, update the import (line 2) and add the `liveMinute` line in the component (after line 25):

```tsx
import { formatDate, formatMatchMinute } from '../../lib/utils'
```

```tsx
export function MatchCard({ match }: MatchCardProps) {
  const isLive = match.status === 'live'
  const isFinished = match.status === 'finished'
  const liveMinute = isLive ? formatMatchMinute(match.minute, match.injuryTime) : null
```

- [ ] **Step 4: Append the clock to the live badge**

Replace the live badge (lines 56-61) with:

```tsx
        {isLive && (
          <span className="flex items-center gap-1 font-display text-[9px] font-bold uppercase tracking-widest text-red">
            <span className="h-1 w-1 animate-pulse rounded-full bg-red" aria-hidden="true" />
            Ao Vivo{liveMinute ? ` · ${liveMinute}` : ''}
          </span>
        )}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @m5nita/web exec vitest run src/components/match/MatchCard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Lint + commit**

```bash
pnpm biome check --write apps/web/src/components/match/MatchCard.tsx apps/web/src/components/match/MatchCard.test.tsx
git add apps/web/src/components/match/MatchCard.tsx apps/web/src/components/match/MatchCard.test.tsx
git commit -m "feat(web): append live minute to the Ao Vivo badge on the matches card"
```

---

## Task 7: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `pnpm test`
Expected: PASS — all workspaces green.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Architecture guardrails**

Run: `pnpm check:leaks && pnpm check:arch`
Expected: PASS — `minute`/`injuryTime` are plain pass-through fields (no fee math, no scope branching, no domain rule), so no new leak/boundary violations.

- [ ] **Step 4: Lint the whole repo**

Run: `pnpm biome check .`
Expected: no errors.

- [ ] **Step 5: Build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 6: Manual sanity check (optional but recommended)**

Apply the migration locally (`pnpm --filter @m5nita/api db:migrate`), seed/boot the app (`pnpm dev`), and view a `live` match. With a real live World Cup match (June 2026), confirm the header reads `• AO VIVO · 67'   <score>` and the matches card badge reads `• AO VIVO · 67'`. Because no match is in play at any given second, you may need to wait for kickoff or temporarily set a row's `status='live'` and `minute=67` in the dev DB to eyeball the rendering.

---

## Self-Review (completed during planning)

- **Spec coverage:** FR-001 → Task 1; FR-002 → Task 2; FR-003 → Task 3; FR-004/005/006 → Tasks 5 & 6 (via `formatMatchMinute` from Task 4); FR-007 (no client ticking) → upheld by design (the helper formats a static value; no timers added). Edge cases (null minute, finished match, halftime) covered by the `clock`/`liveMinute` null-guards and the `status === 'live'` gate, and asserted in the "no minute" tests.
- **Placeholder scan:** none — every step has concrete code/commands and expected output.
- **Type consistency:** `minute`/`injuryTime` typed `number | null | undefined` end-to-end; `formatMatchMinute(minute, injuryTime)` signature is identical in its definition (Task 4), the `LiveResultHeader` call (Task 5), and the `MatchCard` call (Task 6). `toResultUpdate(m, status)` signature matches its single call site. DTO key names (`minute`, `injuryTime`) match the schema keys and the shared-type keys.
