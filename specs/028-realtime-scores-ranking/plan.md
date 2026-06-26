# Fluid Real-Time Scores & Ranking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make live scores and rankings update fluidly (instant on app focus/reconnect, auto-go-live at kickoff, fresher backend data within the API budget) and fix the two ranking bugs (tied-row shuffle; match-finish points-vanish).

**Architecture:** Smart polling only — no SSE/WebSocket. Frontend: flip on focus/reconnect refresh + a low-frequency imminent-kickoff heartbeat + per-query staleTime tuning, all driven by small pure helpers in `apps/web/src/lib/poll.ts`. Backend ranking: add a deterministic tiebreaker to the standings read, and make the live→finished transition seamless by (a) treating an unscored prediction on a live/just-finished match as provisional and (b) wrapping the points-write + standings-recompute in one transaction. Backend sync: drive the live-score cron at a 30s tick that only calls football-data for competitions with live/imminent matches, gated by a per-minute call budget.

**Tech Stack:** React 19 + TanStack Query v5 + Vite PWA (web); Hono + Drizzle ORM + postgres.js (api); Vitest (unit + real-Postgres integration on port 5433); football-data.org v4.

## Global Constraints

- **No database schema migration.** The fixes use existing columns/indexes only. (`prediction.points` is already nullable; `match` already has `status`, `matchDate`, `updatedAt`, and indexes `match_status_idx`, `match_match_date_idx`, `match_competition_id_idx`.)
- **No new runtime dependencies and no new infrastructure** (no SSE/WebSocket, no Redis, no clustering). Single-process box (~3 vCPU / 4 GB).
- **football-data.org call budget: default 20 calls/min, configurable down to 10 calls/min** (post-World-Cup) via env, never exceeded.
- **Do NOT reorder the leaderboard by live points** — official order stays by finalized points; live points remain the provisional `+X` badge only.
- **Do NOT refetch match/ranking data on prediction submit** — the optimistic update stays the only local effect.
- All monetary values in centavos (BRL). No payment paths touched.
- TypeScript strict; Biome for lint/format (`pnpm biome check --write .`); Zod for validation; values via Drizzle.
- Respect the architecture guardrails (`pnpm check:leaks`, `pnpm check:arch`): domain must not import outer layers; application must not import infrastructure; jobs/services use repositories, not raw `db`, for writes where a repo exists.

**Reference commands:**
- Single API unit test: `pnpm --filter @m5nita/api exec vitest run <path>`
- Single web unit test: `pnpm --filter @m5nita/web exec vitest run <path>`
- Integration tests (need the test DB up: `docker compose up -d postgres-test`):
  `DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test pnpm --filter @m5nita/api test:integration -- <pattern>`
- Typecheck/build: `pnpm build`
- Lint/format: `pnpm biome check --write .`
- Guardrails: `pnpm check:leaks && pnpm check:arch`

---

# PART A — Frontend fluidity

Independently shippable: live screens refresh on focus/reconnect and a section auto-goes-live at kickoff.

---

### Task A1: Poll-phase helpers (live / imminent / idle)

**Files:**
- Modify: `apps/web/src/lib/poll.ts`
- Test: `apps/web/src/lib/poll.test.ts`

**Interfaces:**
- Produces:
  - `livePollMs(): number` (existing, unchanged) — 30000–39999
  - `imminentPollMs(): number` — 60000–89999
  - `IMMINENT_WINDOW_MS: number`, `LATE_GRACE_MS: number`
  - `isImminentKickoff(matchDate: string, now: number): boolean`
  - `pollPhase(input: { hasLive: boolean; hasImminent: boolean }): 'live' | 'imminent' | 'idle'`
  - `pollMsForPhase(phase: 'live' | 'imminent' | 'idle'): number | false`
  - `matchesPollMs(matches: ReadonlyArray<{ status: string; matchDate: string }> | undefined, now?: number): number | false`
  - `poolsPollMs(pools: ReadonlyArray<{ hasLiveMatch: boolean; nextMatchAt: string | null }> | undefined, now?: number): number | false`

- [ ] **Step 1: Write the failing tests**

Replace the contents of `apps/web/src/lib/poll.test.ts` with:

```typescript
import { describe, expect, it } from 'vitest'
import {
  IMMINENT_WINDOW_MS,
  imminentPollMs,
  isImminentKickoff,
  LATE_GRACE_MS,
  livePollMs,
  matchesPollMs,
  pollMsForPhase,
  pollPhase,
  poolsPollMs,
} from './poll'

const NOW = Date.parse('2026-06-26T18:00:00.000Z')
const iso = (ms: number) => new Date(NOW + ms).toISOString()

describe('livePollMs', () => {
  it('returns 30s base plus 0–10s jitter', () => {
    for (let i = 0; i < 200; i++) {
      const ms = livePollMs()
      expect(ms).toBeGreaterThanOrEqual(30_000)
      expect(ms).toBeLessThan(40_000)
    }
  })
})

describe('imminentPollMs', () => {
  it('returns 60s base plus 0–30s jitter', () => {
    for (let i = 0; i < 200; i++) {
      const ms = imminentPollMs()
      expect(ms).toBeGreaterThanOrEqual(60_000)
      expect(ms).toBeLessThan(90_000)
    }
  })
})

describe('isImminentKickoff', () => {
  it('is true within the pre-kickoff window', () => {
    expect(isImminentKickoff(iso(IMMINENT_WINDOW_MS - 1), NOW)).toBe(true)
  })
  it('is true up to the late grace after kickoff (backend not yet flipped to live)', () => {
    expect(isImminentKickoff(iso(-LATE_GRACE_MS + 1), NOW)).toBe(true)
  })
  it('is false before the window opens', () => {
    expect(isImminentKickoff(iso(IMMINENT_WINDOW_MS + 60_000), NOW)).toBe(false)
  })
  it('is false once the late grace has elapsed', () => {
    expect(isImminentKickoff(iso(-LATE_GRACE_MS - 60_000), NOW)).toBe(false)
  })
  it('is false for an unparseable date', () => {
    expect(isImminentKickoff('not-a-date', NOW)).toBe(false)
  })
})

describe('pollPhase / pollMsForPhase', () => {
  it('live beats imminent', () => {
    expect(pollPhase({ hasLive: true, hasImminent: true })).toBe('live')
  })
  it('imminent when not live', () => {
    expect(pollPhase({ hasLive: false, hasImminent: true })).toBe('imminent')
  })
  it('idle when neither', () => {
    expect(pollPhase({ hasLive: false, hasImminent: false })).toBe('idle')
  })
  it('maps idle to false (no polling)', () => {
    expect(pollMsForPhase('idle')).toBe(false)
  })
  it('maps live/imminent to numbers in range', () => {
    const live = pollMsForPhase('live')
    const imm = pollMsForPhase('imminent')
    expect(live).toBeGreaterThanOrEqual(30_000)
    expect(live).toBeLessThan(40_000)
    expect(imm).toBeGreaterThanOrEqual(60_000)
    expect(imm).toBeLessThan(90_000)
  })
})

describe('matchesPollMs', () => {
  it('polls live cadence when any match is live', () => {
    const ms = matchesPollMs([{ status: 'live', matchDate: iso(-60_000) }], NOW)
    expect(ms).toBeGreaterThanOrEqual(30_000)
    expect(ms).toBeLessThan(40_000)
  })
  it('polls imminent cadence when a scheduled match is about to start', () => {
    const ms = matchesPollMs([{ status: 'scheduled', matchDate: iso(5 * 60_000) }], NOW)
    expect(ms).toBeGreaterThanOrEqual(60_000)
    expect(ms).toBeLessThan(90_000)
  })
  it('does not poll when nothing is live or imminent', () => {
    expect(matchesPollMs([{ status: 'scheduled', matchDate: iso(6 * 60 * 60_000) }], NOW)).toBe(false)
  })
  it('does not poll for an empty/undefined list', () => {
    expect(matchesPollMs(undefined, NOW)).toBe(false)
    expect(matchesPollMs([], NOW)).toBe(false)
  })
})

describe('poolsPollMs', () => {
  it('polls live cadence when any pool has a live match', () => {
    const ms = poolsPollMs([{ hasLiveMatch: true, nextMatchAt: null }], NOW)
    expect(ms).toBeGreaterThanOrEqual(30_000)
    expect(ms).toBeLessThan(40_000)
  })
  it('polls imminent cadence when a pool has an imminent next match', () => {
    const ms = poolsPollMs([{ hasLiveMatch: false, nextMatchAt: iso(5 * 60_000) }], NOW)
    expect(ms).toBeGreaterThanOrEqual(60_000)
    expect(ms).toBeLessThan(90_000)
  })
  it('does not poll when idle', () => {
    expect(poolsPollMs([{ hasLiveMatch: false, nextMatchAt: iso(6 * 60 * 60_000) }], NOW)).toBe(false)
    expect(poolsPollMs([{ hasLiveMatch: false, nextMatchAt: null }], NOW)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `pnpm --filter @m5nita/web exec vitest run src/lib/poll.test.ts`
Expected: FAIL — imports like `imminentPollMs`, `matchesPollMs`, etc. are not exported yet.

- [ ] **Step 3: Implement the helpers**

Replace the contents of `apps/web/src/lib/poll.ts` with:

```typescript
/**
 * Polling cadence helpers for live screens.
 *
 * Three phases:
 *  - 'live'     → fast 30–40s poll while a match is in progress (jittered so
 *                 cohorts that navigated together don't fire synchronized waves).
 *  - 'imminent' → slow 60–90s heartbeat while a match is about to start (or just
 *                 kicked off but the backend hasn't flagged it 'live' yet), so the
 *                 screen flips to live on its own without the user interacting.
 *  - 'idle'     → no interval polling; focus/reconnect refresh covers freshness.
 */

/** Start polling this long before a scheduled kickoff. */
export const IMMINENT_WINDOW_MS = 15 * 60_000
/** Keep polling this long after a scheduled kickoff that hasn't flipped to live. */
export const LATE_GRACE_MS = 20 * 60_000

export function livePollMs(): number {
  return 30_000 + Math.floor(Math.random() * 10_000)
}

export function imminentPollMs(): number {
  return 60_000 + Math.floor(Math.random() * 30_000)
}

/** Is `matchDate` close enough to `now` that we should heartbeat for the kickoff? */
export function isImminentKickoff(matchDate: string, now: number): boolean {
  const t = Date.parse(matchDate)
  if (Number.isNaN(t)) return false
  return t <= now + IMMINENT_WINDOW_MS && t >= now - LATE_GRACE_MS
}

export function pollPhase(input: { hasLive: boolean; hasImminent: boolean }): 'live' | 'imminent' | 'idle' {
  if (input.hasLive) return 'live'
  if (input.hasImminent) return 'imminent'
  return 'idle'
}

export function pollMsForPhase(phase: 'live' | 'imminent' | 'idle'): number | false {
  if (phase === 'live') return livePollMs()
  if (phase === 'imminent') return imminentPollMs()
  return false
}

/** refetchInterval value for a query whose data is a list of matches. */
export function matchesPollMs(
  matches: ReadonlyArray<{ status: string; matchDate: string }> | undefined,
  now: number = Date.now(),
): number | false {
  const list = matches ?? []
  const hasLive = list.some((m) => m.status === 'live')
  const hasImminent = list.some((m) => m.status === 'scheduled' && isImminentKickoff(m.matchDate, now))
  return pollMsForPhase(pollPhase({ hasLive, hasImminent }))
}

/** refetchInterval value for a query whose data is a list of pools. */
export function poolsPollMs(
  pools: ReadonlyArray<{ hasLiveMatch: boolean; nextMatchAt: string | null }> | undefined,
  now: number = Date.now(),
): number | false {
  const list = pools ?? []
  const hasLive = list.some((p) => p.hasLiveMatch)
  const hasImminent = list.some((p) => p.nextMatchAt !== null && isImminentKickoff(p.nextMatchAt, now))
  return pollMsForPhase(pollPhase({ hasLive, hasImminent }))
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `pnpm --filter @m5nita/web exec vitest run src/lib/poll.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Lint + commit**

```bash
pnpm biome check --write apps/web/src/lib/poll.ts apps/web/src/lib/poll.test.ts
git add apps/web/src/lib/poll.ts apps/web/src/lib/poll.test.ts
git commit -m "feat(web): live/imminent/idle poll-phase helpers"
```

---

### Task A2: Enable focus + reconnect refresh globally

**Files:**
- Modify: `apps/web/src/main.tsx:19-30`

**Interfaces:**
- Consumes: nothing new.
- Produces: a `QueryClient` whose default queries refetch on window focus and on reconnect.

- [ ] **Step 1: Edit the QueryClient defaults**

In `apps/web/src/main.tsx`, replace the QueryClient creation (lines 19-30) with:

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
      // Refresh when the user returns to the app (app/tab focus) and when the
      // network reconnects — the main "I had to reopen the app to see updates"
      // fix. Safe against focus bursts: the heavy ranking aggregate is memoized
      // per pool (25s TTL + single-flight) on the API, so a wave of focus
      // refetches collapses to one compute per pool. The global 60s staleTime
      // debounces non-live screens; live screens opt into staleTime: 0 so a
      // return-to-app always shows the freshest score.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
})
```

- [ ] **Step 2: Verify it builds**

Run: `pnpm --filter @m5nita/web exec tsc -b`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
pnpm biome check --write apps/web/src/main.tsx
git add apps/web/src/main.tsx
git commit -m "feat(web): refetch live data on app focus and reconnect"
```

---

### Task A3: Heartbeat + focus-fresh on the live screens

Wire the Task A1 helpers into the matches-bearing queries, and set `staleTime: 0` on the core live queries so focus/reconnect always show the freshest value.

**Files:**
- Modify: `apps/web/src/components/home/DashboardHome.tsx` (matches/upcoming + pools/active queries)
- Modify: `apps/web/src/routes/matches.tsx` (matches query)
- Modify: `apps/web/src/routes/pools/$poolId/predictions.tsx` (pool-matches query)
- Modify: `apps/web/src/routes/pools/$poolId/ranking.tsx` (ranking query — staleTime only)

**Interfaces:**
- Consumes: `matchesPollMs`, `poolsPollMs` from `apps/web/src/lib/poll.ts` (Task A1).

- [ ] **Step 1: DashboardHome — import the helpers**

In `apps/web/src/components/home/DashboardHome.tsx`, change the poll import (line 7) from:

```typescript
import { livePollMs } from '../../lib/poll'
```
to:
```typescript
import { matchesPollMs, poolsPollMs } from '../../lib/poll'
```

- [ ] **Step 2: DashboardHome — matches/upcoming query (heartbeat + fresh on focus)**

Replace the `refetchInterval` of the `['matches', 'upcoming']` query (lines 100-105) so the whole `useQuery` options object reads:

```typescript
useQuery({
  queryKey: ['matches', 'upcoming'],
  queryFn: async () => {
    const res = await apiFetch('/api/matches?status=scheduled,live&featured=true&limit=4')
    if (!res.ok) throw new Error('Failed to fetch matches')
    return res.json() as Promise<{ matches: Match[] }>
  },
  // Live → 30–40s; about-to-start → 60–90s heartbeat so the card flips to live
  // on its own; otherwise no interval (focus/reconnect refresh covers it).
  staleTime: 0,
  refetchInterval: (query) => matchesPollMs(query.state.data?.matches),
})
```

- [ ] **Step 3: DashboardHome — pools/active query (heartbeat)**

Replace the `refetchInterval` of the `['pools', 'active']` query (lines 171-175) so the `useQuery` reads:

```typescript
useQuery({
  queryKey: ['pools', 'active'],
  queryFn: async () => {
    const res = await apiFetch('/api/pools')
    if (!res.ok) throw new Error('Failed to fetch pools')
    return res.json() as Promise<{ pools: PoolListItem[] }>
  },
  refetchInterval: (query) => poolsPollMs(query.state.data?.pools),
})
```

- [ ] **Step 4: matches.tsx — import + heartbeat + fresh**

In `apps/web/src/routes/matches.tsx`, add the poll helper import (after line 4's `useQuery` import, add a new import line):

```typescript
import { matchesPollMs } from '../lib/poll'
```

Then replace the matches query's `refetchInterval` block (lines 217-220) so the `useQuery` reads:

```typescript
const { data, isPending, error, refetch } = useQuery({
  queryKey: ['matches', effectiveCompetition],
  queryFn: async () => {
    const params = new URLSearchParams()
    if (effectiveCompetition) params.set('competitionId', effectiveCompetition)
    else params.set('featured', 'true')
    const res = await apiFetch(`/api/matches?${params}`)
    if (!res.ok) throw new Error('Erro ao carregar jogos')
    return res.json() as Promise<{ matches: Match[] }>
  },
  // Was a hardcoded live-only 30s; now jittered live + imminent heartbeat, and
  // staleTime 0 so returning to the app shows the freshest scores immediately.
  staleTime: 0,
  refetchInterval: (query) => matchesPollMs(query.state.data?.matches),
})
```

- [ ] **Step 5: predictions.tsx — import + heartbeat + fresh on pool-matches**

In `apps/web/src/routes/pools/$poolId/predictions.tsx`, ensure the poll import includes `matchesPollMs`. The file already imports `livePollMs` (used by the accordion) — change that import line to also pull `matchesPollMs`:

```typescript
import { livePollMs, matchesPollMs } from '../../../lib/poll'
```

Then replace the `['pool-matches', poolId]` query's `refetchInterval` block (lines 875-878) so the `useQuery` reads:

```typescript
useQuery({
  // Pool-scoped key: the server now returns only this pool's matches (one
  // match, a round range, or the whole competition), so it must not share a
  // cache entry with other pools of the same competition.
  queryKey: ['pool-matches', poolId],
  queryFn: async (): Promise<{ matches: Match[] }> => {
    const params = matchParamsForPool(pool)
    const res = await apiFetch(`/api/matches?${params}`)
    if (!res.ok) throw new Error('Erro ao carregar jogos')
    return res.json()
  },
  staleTime: 0,
  refetchInterval: (query) => matchesPollMs(query.state.data?.matches),
})
```

> Leave the `['predictions', poolId]` query (line 888-896) and the per-match `['match-predictions', …]` query (line 38-47) unchanged — predictions only change at match-finish, and they already poll while `hasLiveMatch`/`isLive`. They now also benefit from the global focus/reconnect refresh.

- [ ] **Step 6: ranking.tsx — fresh on focus**

In `apps/web/src/routes/pools/$poolId/ranking.tsx`, add `staleTime: 0` to the ranking `useQuery` (the options object at lines 17-29) so returning to the app re-pulls the ranking immediately while keeping the existing live-only interval:

```typescript
const { data, isPending, error, refetch } = useQuery({
  queryKey: ['ranking', poolId],
  queryFn: async () => {
    const res = await apiFetch(`/api/pools/${poolId}/ranking`)
    if (!res.ok) throw new Error('Erro ao carregar ranking')
    return res.json() as Promise<{
      ranking: RankingEntry[]
      prizeTotal: number
      hasLiveMatch: boolean
    }>
  },
  staleTime: 0,
  refetchInterval: (query) => (query.state.data?.hasLiveMatch ? livePollMs() : false),
})
```

- [ ] **Step 7: Verify build + existing tests**

Run: `pnpm --filter @m5nita/web exec tsc -b && pnpm --filter @m5nita/web exec vitest run`
Expected: type-checks clean; all existing web tests still pass.

- [ ] **Step 8: Manual verification (quickstart)**

With `pnpm dev` running and logged in (dev phone login per project notes), and at least one match `live` (seed or set `status='live'` on a featured match in the dev DB):
1. Open `/matches`. Confirm scores update on their own (~30–40s) while foregrounded.
2. Switch to another browser tab/app for ~10s, change the score in the DB, return to the app → the score updates within ~1–2s (focus refetch).
3. Set a featured match to `scheduled` with `matchDate` ~5 min in the future; sit idle on the home/matches view; flip it to `live` in the DB → within ≤90s the card shows it live (heartbeat).

- [ ] **Step 9: Commit**

```bash
pnpm biome check --write apps/web/src/components/home/DashboardHome.tsx apps/web/src/routes/matches.tsx apps/web/src/routes/pools/\$poolId/predictions.tsx apps/web/src/routes/pools/\$poolId/ranking.tsx
git add apps/web/src/components/home/DashboardHome.tsx apps/web/src/routes/matches.tsx "apps/web/src/routes/pools/\$poolId/predictions.tsx" "apps/web/src/routes/pools/\$poolId/ranking.tsx"
git commit -m "feat(web): imminent-kickoff heartbeat and focus-fresh live screens"
```

---

# PART B — Ranking correctness

Independently shippable: tied rows stop shuffling, and a finishing match's points never vanish.

---

### Task B1: Bug A — deterministic tiebreaker in standings ordering

`getStandings` orders only by `(pointsTotal desc, exactMatches desc)`; tied members come back in arbitrary, unstable order, so they swap rows between refreshes. Add a stable final tiebreaker (`name asc, userId asc`).

**Files:**
- Modify: `apps/api/src/infrastructure/persistence/DrizzleRankingRepository.ts:41-44`
- Modify: `apps/api/src/domain/ranking/Ranking.ts:1-6` (doc comment only)
- Test: `apps/api/tests/integration/scenarios/ranking-ordering.test.ts` (create)

**Interfaces:**
- Produces: `getStandings(poolId)` returns members in a fully deterministic order: points desc, exactMatches desc, name asc, userId asc.

- [ ] **Step 1: Write the failing integration test**

Create `apps/api/tests/integration/scenarios/ranking-ordering.test.ts`. Mirror the harness used by `apps/api/tests/integration/scenarios/predictions-and-scoring.test.ts` (same imports/seed helpers). The test seeds three members all tied at 0 points with names that sort `Ana < Bruno < Carlos`, then asserts the ranking endpoint returns them in that exact order on two consecutive calls.

```typescript
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { workerConnectionString } from '../support/db-utils'
import { seedPaidPool, signInViaPhoneOtp, deliverInfinitePayPaidWebhook } from '../support/helpers'

describe('ranking ordering', () => {
  let sql: ReturnType<typeof postgres>
  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })
  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  it('returns tied members in a stable, deterministic order across refreshes', async () => {
    // seedPaidPool creates the owner; give them a name that sorts last so the
    // tiebreaker (name asc) is observable.
    const { app, admin, pool } = await seedPaidPool('+5511933331001')
    await sql`update "user" set name = 'Carlos' where id = ${admin.userId}`

    // Two more paid members, named to sort before the owner.
    for (const [phone, name] of [
      ['+5511933331002', 'Ana'],
      ['+5511933331003', 'Bruno'],
    ] as const) {
      const member = await signInViaPhoneOtp(app, { phoneNumber: phone })
      const joinResp = await member.fetch(`/api/pools/${pool.id}/join`, { method: 'POST' })
      const { payment } = (await joinResp.json()) as { payment: { id: string } }
      await deliverInfinitePayPaidWebhook(app, payment.id)
      await sql`update "user" set name = ${name} where id = ${member.userId}`
    }

    const read = async () => {
      const res = await admin.fetch(`/api/pools/${pool.id}/ranking`)
      const body = (await res.json()) as { ranking: Array<{ name: string | null; position: number }> }
      return body.ranking.map((r) => r.name)
    }

    const first = await read()
    const second = await read()
    expect(first).toEqual(['Ana', 'Bruno', 'Carlos'])
    expect(second).toEqual(first) // deterministic across calls
  })
})
```

> If `seedPaidPool`/`signInViaPhoneOtp`/`deliverInfinitePayPaidWebhook` are not exported from a shared helpers module, copy the inline seed pattern used at the top of `predictions-and-scoring.test.ts` instead — the assertion (stable `['Ana','Bruno','Carlos']`) is what matters.

- [ ] **Step 2: Run it, verify it fails**

Run: `DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test pnpm --filter @m5nita/api test:integration -- ranking-ordering`
Expected: FAIL — order is not guaranteed (often not `['Ana','Bruno','Carlos']`, or unstable between the two reads).

- [ ] **Step 3: Add the stable tiebreaker**

In `apps/api/src/infrastructure/persistence/DrizzleRankingRepository.ts`, change the `.orderBy(...)` of `getStandings` (lines 41-44) to:

```typescript
      .orderBy(
        desc(sql`coalesce(${poolStanding.pointsTotal}, 0)`),
        desc(sql`coalesce(${poolStanding.exactMatches}, 0)`),
        // Deterministic final tiebreaker so members tied on points + exact count
        // keep a stable order across reads (otherwise Postgres returns ties in an
        // arbitrary order that changes between polls → rows visibly shuffle).
        asc(user.name),
        asc(poolMember.userId),
      )
```

Add `asc` to the drizzle import on line 1:

```typescript
import { and, asc, desc, eq, sql } from 'drizzle-orm'
```

- [ ] **Step 4: Update the domain doc to match the contract**

In `apps/api/src/domain/ranking/Ranking.ts`, update the top doc comment (lines 1-6) to:

```typescript
/**
 * Ranking VO. Encapsulates the tiebreaker policy and shared-position rule used
 * across the application. Callers fetch raw entries already sorted by the full
 * deterministic key (points desc, exactMatches desc, name asc, userId asc) and
 * delegate position assignment here so the rule lives in one place.
 */
```

- [ ] **Step 5: Run the integration test, verify it passes**

Run: `DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test pnpm --filter @m5nita/api test:integration -- ranking-ordering`
Expected: PASS.

- [ ] **Step 6: Run the existing ranking unit tests (no regressions)**

Run: `pnpm --filter @m5nita/api exec vitest run src/domain/ranking/Ranking.test.ts`
Expected: PASS (unchanged — `Ranking.build` behavior is untouched).

- [ ] **Step 7: Commit**

```bash
pnpm biome check --write apps/api/src/infrastructure/persistence/DrizzleRankingRepository.ts apps/api/src/domain/ranking/Ranking.ts apps/api/tests/integration/scenarios/ranking-ordering.test.ts
git add apps/api/src/infrastructure/persistence/DrizzleRankingRepository.ts apps/api/src/domain/ranking/Ranking.ts apps/api/tests/integration/scenarios/ranking-ordering.test.ts
git commit -m "fix(api): deterministic tiebreaker stops ranking rows shuffling"
```

---

### Task B2: Bug B fix #1 — provisional points survive the finish transition

When a match flips to `finished`, its provisional points currently disappear until `calcPoints` writes standings (the points are in neither the live bucket nor the finished bucket). Tie "provisional" to the prediction's own unscored state: count points for predictions with `points IS NULL` whose match is live OR just-finished (has a score). A scored prediction (`points` set) is never counted as provisional, so there is no double count once standings are written.

**Files:**
- Modify: `apps/api/src/services/ranking.ts:35-80` (`computeLivePointsByUser`)
- Test: `apps/api/tests/integration/scenarios/ranking-finish-transition.test.ts` (create)

**Interfaces:**
- Consumes: existing `ScoringPolicy.score(...)`.
- Produces: `computeLivePointsByUser` now also covers just-finished-but-unscored predictions; behavior unchanged once scoring has run.

- [ ] **Step 1: Write the failing integration test**

Create `apps/api/tests/integration/scenarios/ranking-finish-transition.test.ts`. Seed a single-match or range pool with one member who predicts a live match, set the match `live` with a score, then set it `finished` **without yet running `calcPointsForMatch`** (simulating the in-tick window), and assert the ranking still reflects the member's points (as `livePoints`) instead of dropping to zero. Then run `calcPointsForMatch` and assert the points move to `totalPoints` with `livePoints` back to 0 (no double count).

```typescript
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { workerConnectionString } from '../support/db-utils'
import { calcPointsForMatch } from '../../../src/jobs/calcPoints'
// Reuse the seed helpers from predictions-and-scoring.test.ts (seedPaidPool,
// makeMatch, set predictions via the HTTP API, finishMatch). Copy that file's
// top-of-file helpers if they are not exported.

describe('ranking finish transition (no points-vanish flicker)', () => {
  let sql: ReturnType<typeof postgres>
  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })
  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  it('keeps a just-finished match provisional until scored, then finalizes without double counting', async () => {
    const { app, admin, pool } = await seedPaidPool('+5511933332001')
    const match = await makeMatch(sql, { status: 'scheduled' })

    // Member predicts the exact scoreline.
    await admin.fetch(`/api/pools/${pool.id}/predictions/${match.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeScore: 2, awayScore: 1 }),
    })

    // Match goes live with the predicted score → provisional points appear.
    await sql`update match set status = 'live', home_score = 2, away_score = 1, updated_at = now() where id = ${match.id}`
    const live = await readRanking(admin, pool.id)
    expect(live.ranking[0]?.livePoints).toBeGreaterThan(0)
    const provisional = live.ranking[0]?.livePoints ?? 0

    // Match flips to finished but scoring HASN'T run yet (the in-tick window).
    await sql`update match set status = 'finished', updated_at = now() where id = ${match.id}`
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

async function readRanking(
  client: { fetch: (p: string) => Promise<Response> },
  poolId: string,
) {
  const res = await client.fetch(`/api/pools/${poolId}/ranking`)
  return (await res.json()) as {
    ranking: Array<{ totalPoints: number; livePoints: number }>
  }
}
```

> Use the same `seedPaidPool` / `makeMatch` helpers as `predictions-and-scoring.test.ts`. `makeMatch` must let you set the pool's match (single-match pool) or a match inside the pool's matchday range so the prediction is valid.

- [ ] **Step 2: Run it, verify it fails**

Run: `DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test pnpm --filter @m5nita/api test:integration -- ranking-finish-transition`
Expected: FAIL at the `between` assertion — once `status='finished'`, the current query (`status='live'` only) drops the match, so `livePoints` becomes 0.

- [ ] **Step 3: Broaden `computeLivePointsByUser` to unscored predictions on live/just-finished matches**

In `apps/api/src/services/ranking.ts`, replace `computeLivePointsByUser` (lines 35-80) with:

```typescript
/** How long after a match flips to `finished` we keep treating its unscored
 * predictions as provisional (covers the in-tick window before calcPoints runs,
 * even when several matches finish at once and are scored sequentially). */
const JUST_FINISHED_WINDOW_MS = 30 * 60_000

async function computeLivePointsByUser(
  poolId: string,
  scoringPolicy: ScoringPolicy,
): Promise<Map<string, number>> {
  // Candidate matches: live, OR finished within the last JUST_FINISHED_WINDOW_MS
  // (scoring may not have run yet). Both resolve via match_status_idx and the
  // recently-finished set is tiny, so this stays cheap.
  const since = new Date(Date.now() - JUST_FINISHED_WINDOW_MS)
  const liveMatches = await db
    .select({
      id: matchTable.id,
      home: matchTable.homeScore,
      away: matchTable.awayScore,
    })
    .from(matchTable)
    .where(
      and(
        sql`${matchTable.homeScore} is not null and ${matchTable.awayScore} is not null`,
        or(
          eq(matchTable.status, 'live'),
          and(eq(matchTable.status, 'finished'), gt(matchTable.updatedAt, since)),
        ),
      ),
    )

  if (liveMatches.length === 0) return new Map()

  const scoreByMatch = new Map(liveMatches.map((m) => [m.id, m]))
  // Only UNSCORED predictions are provisional. The moment calcPoints writes
  // `points`, the prediction is finalized into pool_standing instead, so this
  // `points is null` filter is what prevents double counting at the transition.
  const livePreds = await db
    .select({
      userId: prediction.userId,
      predHome: prediction.homeScore,
      predAway: prediction.awayScore,
      matchId: prediction.matchId,
    })
    .from(prediction)
    .where(
      and(
        eq(prediction.poolId, poolId),
        sql`${prediction.points} is null`,
        inArray(
          prediction.matchId,
          liveMatches.map((m) => m.id),
        ),
      ),
    )

  const byUser = new Map<string, number>()
  for (const row of livePreds) {
    const m = scoreByMatch.get(row.matchId)
    if (!m || m.home === null || m.away === null) continue
    const pts = scoringPolicy.score(row.predHome, row.predAway, m.home, m.away).points
    byUser.set(row.userId, (byUser.get(row.userId) ?? 0) + pts)
  }
  return byUser
}
```

Add `gt` and `or` to the drizzle import on line 1 of `apps/api/src/services/ranking.ts`:

```typescript
import { and, eq, gt, inArray, or, sql } from 'drizzle-orm'
```

- [ ] **Step 4: Run the new test, verify it passes**

Run: `DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test pnpm --filter @m5nita/api test:integration -- ranking-finish-transition`
Expected: PASS.

- [ ] **Step 5: Re-run the existing scoring/ranking integration test (no regression)**

Run: `DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test pnpm --filter @m5nita/api test:integration -- predictions-and-scoring`
Expected: PASS (after scoring, predictions have `points` set → excluded from provisional → ranking totals unchanged).

- [ ] **Step 6: Commit**

```bash
pnpm biome check --write apps/api/src/services/ranking.ts apps/api/tests/integration/scenarios/ranking-finish-transition.test.ts
git add apps/api/src/services/ranking.ts apps/api/tests/integration/scenarios/ranking-finish-transition.test.ts
git commit -m "fix(api): keep just-finished match points provisional until scored"
```

---

### Task B3: Bug B fix #2 — atomic points-write + standings-recompute

Within `calcPoints`, `updatePointsBatch` (sets `points`) and `recomputeStandings` (writes `pool_standing`) run as separate commits, leaving a window where predictions are scored but standings aren't yet — the just-finished match's points briefly disappear. Wrap both in one transaction (via the existing `DrizzleUnitOfWork`) so a reader sees either the pre- or post-finish state, never the gap.

**Files:**
- Modify: `apps/api/src/infrastructure/persistence/DrizzleUnitOfWork.ts` (expose `predictions` + `ranking` tx-bound repos)
- Modify: `apps/api/src/jobs/calcPoints.ts:54-69`
- Test: `apps/api/src/jobs/calcPoints.test.ts` (extend)

**Interfaces:**
- Consumes: `getContainer().unitOfWork.run(work)` returning the tx-bound repos.
- Produces: `TransactionalRepositories` now includes `predictions: PredictionRepository` and `ranking: RankingRepository`.

- [ ] **Step 1: Read the current UnitOfWork to match its shape**

Open `apps/api/src/infrastructure/persistence/DrizzleUnitOfWork.ts` and confirm `TransactionalRepositories` currently exposes `payments`, `pools`, `statsUnlocks`, each constructed with the `tx`. You will add two more in the same pattern.

- [ ] **Step 2: Add `predictions` and `ranking` to the UnitOfWork**

In `apps/api/src/infrastructure/persistence/DrizzleUnitOfWork.ts`:

1. Add imports for the two repositories and their port types (mirror the existing repo imports):

```typescript
import { DrizzlePredictionRepository } from './DrizzlePredictionRepository'
import { DrizzleRankingRepository } from './DrizzleRankingRepository'
import type { PredictionRepository } from '../../domain/prediction/PredictionRepository.port'
import type { RankingRepository } from '../../domain/ranking/RankingRepository.port'
```

2. Add the two fields to the `TransactionalRepositories` type:

```typescript
  predictions: PredictionRepository
  ranking: RankingRepository
```

3. Construct them inside `run`’s transaction callback (mirroring the existing lines):

```typescript
  run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) =>
      work({
        payments: new DrizzlePaymentRepository(tx),
        pools: new DrizzlePoolRepository(tx),
        statsUnlocks: new DrizzleStatsUnlockRepository(tx),
        predictions: new DrizzlePredictionRepository(tx),
        ranking: new DrizzleRankingRepository(tx),
      }),
    )
  }
```

- [ ] **Step 3: Extend the calcPoints test to lock the atomic contract**

In `apps/api/src/jobs/calcPoints.test.ts`, the container is mocked with `vi.doMock('../container', …)`. Add `unitOfWork` to the mocked container so the new code path is exercised, and assert that `updatePointsBatch` runs **before** `recomputeStandings` inside a single `run`. Add this test alongside the existing one:

```typescript
it('writes points and recomputes standings inside one unit-of-work, in order', async () => {
  const order: string[] = []
  const matchId = 'm1'

  vi.resetModules()
  vi.doMock('../container', () => {
    const predictionRepo = {
      findByMatch: async () => [
        { id: 'p1', poolId: 'pool1', userId: 'u1', homeScore: 2, awayScore: 1, advancePick: null },
      ],
      updatePointsBatch: async () => {
        order.push('updatePointsBatch')
      },
    }
    const rankingRepo = {
      recomputeStandings: async () => {
        order.push('recomputeStandings')
      },
    }
    return {
      getContainer: () => ({
        matchRepo: {
          findById: async () => ({ id: matchId, status: 'finished', homeScore: 2, awayScore: 1 }),
        },
        predictionRepo,
        rankingRepo,
        poolRepo: { findById: async () => ({ scoringPolicy: () => RangeScoringPolicy }) },
        statsRepo: { recomputeSnapshot: async () => {} },
        statsUnlockRepo: { listUnlockedUsers: async () => [] },
        // The unit of work runs `work` with tx-bound repos; here it reuses the
        // same spies so we can assert ordering.
        unitOfWork: {
          run: async (work: (r: unknown) => Promise<unknown>) =>
            work({ predictions: predictionRepo, ranking: rankingRepo }),
        },
      }),
    }
  })

  const { calcPointsForMatch } = await import('./calcPoints')
  await calcPointsForMatch(matchId)

  expect(order).toEqual(['updatePointsBatch', 'recomputeStandings'])
})
```

> Import `RangeScoringPolicy` at the top of the test file if not already present:
> `import { RangeScoringPolicy } from '../domain/scoring/ScoringPolicy'`

- [ ] **Step 4: Run the test, verify it fails**

Run: `pnpm --filter @m5nita/api exec vitest run src/jobs/calcPoints.test.ts`
Expected: FAIL — `calcPoints` does not call `unitOfWork.run` yet (and may throw on the missing/extra mock).

- [ ] **Step 5: Make the writes atomic in calcPoints**

In `apps/api/src/jobs/calcPoints.ts`, change the destructure (lines 8-9) to also pull `unitOfWork`:

```typescript
  const { matchRepo, predictionRepo, poolRepo, unitOfWork, statsRepo, statsUnlockRepo } =
    getContainer()
```

Then replace the write section (lines 52-69 — from the `await predictionRepo.updatePointsBatch(pointUpdates)` line through the end of the `for` loop) with:

```typescript
  const affectedPools = [...new Set(predictions.map((p) => p.poolId))]

  // Atomic: write every prediction's points AND recompute the affected pools'
  // standings in one transaction, so a concurrent ranking read sees either the
  // pre-finish state (points still null → counted as provisional) or the
  // post-finish state (points set → counted in standings), never the gap where
  // a just-finished match's points belong to neither bucket.
  await unitOfWork.run(async (repos) => {
    await repos.predictions.updatePointsBatch(pointUpdates)
    for (const poolId of affectedPools) {
      await repos.ranking.recomputeStandings(poolId)
    }
  })

  // After the commit, bust the in-process caches and refresh per-user stats
  // snapshots so the next read reflects the finished match immediately.
  for (const poolId of affectedPools) {
    invalidateRankingAggregate(poolId)

    const unlockedUsers = await statsUnlockRepo.listUnlockedUsers(poolId)
    for (const userId of unlockedUsers) {
      await statsRepo.recomputeSnapshot(poolId, userId)
    }
    invalidateParticipantStatsAggregate(poolId)
  }
```

> Note: `predictionRepo` is still destructured because it is used earlier (`findByMatch`). `rankingRepo` is no longer used directly in this file — remove it from the destructure to satisfy the no-unused / no-dead-code rule and Biome. (The standings recompute now goes through `unitOfWork`.)

- [ ] **Step 6: Run the calcPoints unit tests, verify they pass**

Run: `pnpm --filter @m5nita/api exec vitest run src/jobs/calcPoints.test.ts`
Expected: PASS (both the original test and the new ordering test).

- [ ] **Step 7: Re-run the scoring/ranking integration test (real DB end-to-end)**

Run: `DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test pnpm --filter @m5nita/api test:integration -- predictions-and-scoring`
Expected: PASS — standings are correct after `calcPointsForMatch` (now via the unit of work).

- [ ] **Step 8: Guardrails + commit**

```bash
pnpm check:arch && pnpm check:leaks
pnpm biome check --write apps/api/src/infrastructure/persistence/DrizzleUnitOfWork.ts apps/api/src/jobs/calcPoints.ts apps/api/src/jobs/calcPoints.test.ts
git add apps/api/src/infrastructure/persistence/DrizzleUnitOfWork.ts apps/api/src/jobs/calcPoints.ts apps/api/src/jobs/calcPoints.test.ts
git commit -m "fix(api): atomic points-write + standings-recompute at match finish"
```

---

# PART C — Adaptive, budget-aware live-sync

Independently shippable: scores reach the backend every ~30s during live windows, only calling football-data for competitions with live/imminent matches, never exceeding the configured calls/min.

---

### Task C1: Per-minute call budget

**Files:**
- Create: `apps/api/src/lib/callBudget.ts`
- Test: `apps/api/src/lib/callBudget.test.ts`

**Interfaces:**
- Produces:
  - `class CallBudget { constructor(maxPerMinute: number, now?: () => number); available(): number; take(n: number): number }`
  - `take(n)` grants `min(n, available)` calls, records them at `now()`, and returns the granted count. A rolling 60s window caps starts to `maxPerMinute`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/lib/callBudget.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { CallBudget } from './callBudget'

describe('CallBudget', () => {
  it('grants up to the per-minute max', () => {
    let t = 0
    const b = new CallBudget(10, () => t)
    expect(b.available()).toBe(10)
    expect(b.take(4)).toBe(4)
    expect(b.available()).toBe(6)
  })

  it('caps a single take at the remaining budget', () => {
    let t = 0
    const b = new CallBudget(10, () => t)
    expect(b.take(8)).toBe(8)
    expect(b.take(5)).toBe(2) // only 2 left
    expect(b.take(1)).toBe(0) // exhausted
  })

  it('refills as the 60s window slides', () => {
    let t = 0
    const b = new CallBudget(10, () => t)
    expect(b.take(10)).toBe(10)
    expect(b.available()).toBe(0)
    t = 59_999
    expect(b.available()).toBe(0) // still within the window
    t = 60_001
    expect(b.available()).toBe(10) // the early calls aged out
    expect(b.take(10)).toBe(10)
  })

  it('never grants more than max across any 60s window', () => {
    let t = 0
    const b = new CallBudget(10, () => t)
    let granted = 0
    for (let i = 0; i < 120; i++) {
      granted += b.take(1)
      t += 5_000 // a take every 5s for 10 minutes
    }
    // 10 minutes at <=10/min => <=100 grants, and never >10 in any minute.
    expect(granted).toBeLessThanOrEqual(120)
    expect(granted).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @m5nita/api exec vitest run src/lib/callBudget.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `CallBudget`**

Create `apps/api/src/lib/callBudget.ts`:

```typescript
/**
 * Rolling-window per-minute call budget. Caps the number of external calls
 * "started" in any 60s window to `maxPerMinute`. Pure and deterministic given an
 * injected `now`, so the live-sync scheduler can enforce the football-data rate
 * limit (20/min now, 10/min after the World Cup) and degrade gracefully when more
 * competitions are live than the budget allows.
 */
const WINDOW_MS = 60_000

export class CallBudget {
  private readonly starts: number[] = []

  constructor(
    private readonly maxPerMinute: number,
    private readonly now: () => number = Date.now,
  ) {}

  private prune(t: number): void {
    const cutoff = t - WINDOW_MS
    while (this.starts.length > 0 && (this.starts[0] as number) <= cutoff) {
      this.starts.shift()
    }
  }

  available(): number {
    const t = this.now()
    this.prune(t)
    return Math.max(0, this.maxPerMinute - this.starts.length)
  }

  /** Grant min(n, available) calls, recording them at `now`. Returns the granted count. */
  take(n: number): number {
    if (n <= 0) return 0
    const granted = Math.min(n, this.available())
    const t = this.now()
    for (let i = 0; i < granted; i++) this.starts.push(t)
    return granted
  }
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `pnpm --filter @m5nita/api exec vitest run src/lib/callBudget.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm biome check --write apps/api/src/lib/callBudget.ts apps/api/src/lib/callBudget.test.ts
git add apps/api/src/lib/callBudget.ts apps/api/src/lib/callBudget.test.ts
git commit -m "feat(api): rolling per-minute call budget"
```

---

### Task C2: Find competitions with a live or imminent match (no external call)

**Files:**
- Modify: `apps/api/src/domain/match/MatchRepository.port.ts` (add method to interface)
- Modify: `apps/api/src/infrastructure/persistence/DrizzleMatchRepository.ts` (implement)
- Test: `apps/api/tests/integration/scenarios/competitions-live-imminent.test.ts` (create)

**Interfaces:**
- Produces: `MatchRepository.findCompetitionIdsWithLiveOrImminent(preKickoffMs: number, postKickoffGraceMs: number, now: Date): Promise<string[]>` — distinct `competitionId`s that have a `live` match, or a `scheduled`/`timed` match whose `matchDate` is within `[now - postKickoffGraceMs, now + preKickoffMs]`.

- [ ] **Step 1: Write the failing integration test**

Create `apps/api/tests/integration/scenarios/competitions-live-imminent.test.ts`:

```typescript
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { workerConnectionString } from '../support/db-utils'
import { buildContainer } from '../../../src/container'

const PRE = 10 * 60_000
const GRACE = 30 * 60_000

describe('findCompetitionIdsWithLiveOrImminent', () => {
  let sql: ReturnType<typeof postgres>
  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })
  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  it('returns competitions with a live or imminent match, excludes far-off / finished', async () => {
    const now = new Date('2026-06-26T18:00:00.000Z')
    const compLive = await makeCompetition(sql)
    const compImminent = await makeCompetition(sql)
    const compFar = await makeCompetition(sql)
    const compFinished = await makeCompetition(sql)

    await makeMatch(sql, { competitionId: compLive, status: 'live', matchDate: now })
    await makeMatch(sql, {
      competitionId: compImminent,
      status: 'scheduled',
      matchDate: new Date(now.getTime() + 5 * 60_000),
    })
    await makeMatch(sql, {
      competitionId: compFar,
      status: 'scheduled',
      matchDate: new Date(now.getTime() + 6 * 60 * 60_000),
    })
    await makeMatch(sql, {
      competitionId: compFinished,
      status: 'finished',
      matchDate: new Date(now.getTime() - 3 * 60 * 60_000),
    })

    const { matchRepo } = buildContainer()
    const ids = await matchRepo.findCompetitionIdsWithLiveOrImminent(PRE, GRACE, now)

    expect(ids.sort()).toEqual([compLive, compImminent].sort())
  })
})

// Minimal seed helpers (raw SQL keeps the test independent of HTTP flows).
async function makeCompetition(sql: ReturnType<typeof postgres>): Promise<string> {
  const ext = `ext-${Math.floor(performance.now() * 1000)}`
  const [row] = await sql<{ id: string }[]>`
    insert into competition (external_id, name, season, type, status, featured)
    values (${ext}, 'Test', '2026', 'cup', 'active', true) returning id`
  return (row as { id: string }).id
}
async function makeMatch(
  sql: ReturnType<typeof postgres>,
  m: { competitionId: string; status: string; matchDate: Date },
): Promise<void> {
  const ext = Math.floor(performance.now() * 1000)
  await sql`
    insert into match (competition_id, external_id, home_team, away_team, stage, match_date, status, updated_at)
    values (${m.competitionId}, ${ext}, 'A', 'B', 'group', ${m.matchDate}, ${m.status}, now())`
}
```

> `performance.now()` is allowed in app/test code (only `Date.now()`/`Math.random()` are restricted inside Workflow scripts, not here). If the test DB rejects a duplicate `external_id`, switch to a module-level incrementing counter.

- [ ] **Step 2: Add the method to the port**

In `apps/api/src/domain/match/MatchRepository.port.ts`, add to the `MatchRepository` interface (next to `findLive`):

```typescript
  /** Distinct competition ids that have a live match, or a scheduled/timed match
   * kicking off within [now - postKickoffGraceMs, now + preKickoffMs]. */
  findCompetitionIdsWithLiveOrImminent(
    preKickoffMs: number,
    postKickoffGraceMs: number,
    now: Date,
  ): Promise<string[]>
```

- [ ] **Step 3: Run it, verify it fails**

Run: `DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test pnpm --filter @m5nita/api test:integration -- competitions-live-imminent`
Expected: FAIL — `findCompetitionIdsWithLiveOrImminent is not a function`.

- [ ] **Step 4: Implement it in the Drizzle repository**

In `apps/api/src/infrastructure/persistence/DrizzleMatchRepository.ts`, add the method (near `findLive`). Ensure the drizzle imports include `and`, `or`, `eq`, `gte`, `lte`, `inArray`, `sql` (add any missing):

```typescript
  async findCompetitionIdsWithLiveOrImminent(
    preKickoffMs: number,
    postKickoffGraceMs: number,
    now: Date,
  ): Promise<string[]> {
    const from = new Date(now.getTime() - postKickoffGraceMs)
    const to = new Date(now.getTime() + preKickoffMs)
    const rows = await this.db
      .selectDistinct({ competitionId: match.competitionId })
      .from(match)
      .where(
        or(
          eq(match.status, 'live'),
          and(
            inArray(match.status, ['scheduled', 'timed']),
            gte(match.matchDate, from),
            lte(match.matchDate, to),
          ),
        ),
      )
    return rows.map((r) => r.competitionId)
  }
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test pnpm --filter @m5nita/api test:integration -- competitions-live-imminent`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
pnpm biome check --write apps/api/src/domain/match/MatchRepository.port.ts apps/api/src/infrastructure/persistence/DrizzleMatchRepository.ts apps/api/tests/integration/scenarios/competitions-live-imminent.test.ts
git add apps/api/src/domain/match/MatchRepository.port.ts apps/api/src/infrastructure/persistence/DrizzleMatchRepository.ts apps/api/tests/integration/scenarios/competitions-live-imminent.test.ts
git commit -m "feat(api): query competitions with a live or imminent match"
```

---

### Task C3: Budget-aware competition provider for live-sync

A factory that returns the per-tick `findActiveCompetitions` function the live-sync use case calls: it intersects active competitions with the live/imminent set, orders them least-recently-synced first (round-robin under a cap), and consumes the call budget so the returned list never exceeds what we can afford this tick.

**Files:**
- Create: `apps/api/src/application/match/liveSyncCompetitionProvider.ts`
- Test: `apps/api/src/application/match/liveSyncCompetitionProvider.test.ts`

**Interfaces:**
- Consumes: `CallBudget` (Task C1); `MatchRepository.findCompetitionIdsWithLiveOrImminent` (Task C2); `CompetitionInfo` from `SyncLiveScoresUseCase`.
- Produces:
  - `createLiveSyncCompetitionProvider(deps: { listActive: () => Promise<CompetitionInfo[]>; findLiveOrImminentCompetitionIds: (now: Date) => Promise<string[]>; budget: CallBudget; clock: Clock; preKickoffMs?: number; postKickoffGraceMs?: number }): () => Promise<CompetitionInfo[]>`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/application/match/liveSyncCompetitionProvider.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { CallBudget } from '../../lib/callBudget'
import { createLiveSyncCompetitionProvider } from './liveSyncCompetitionProvider'
import type { CompetitionInfo } from './SyncLiveScoresUseCase'

const comp = (id: string): CompetitionInfo => ({ id, externalId: `x-${id}`, name: id })
const clock = (ms: number) => ({ now: () => new Date(ms) })

describe('createLiveSyncCompetitionProvider', () => {
  it('returns only active competitions that are live/imminent', async () => {
    const provider = createLiveSyncCompetitionProvider({
      listActive: async () => [comp('a'), comp('b'), comp('c')],
      findLiveOrImminentCompetitionIds: async () => ['b'],
      budget: new CallBudget(10, () => 0),
      clock: clock(0),
    })
    const result = await provider()
    expect(result.map((c) => c.id)).toEqual(['b'])
  })

  it('returns empty (and spends no budget) when nothing is live/imminent', async () => {
    const budget = new CallBudget(10, () => 0)
    const provider = createLiveSyncCompetitionProvider({
      listActive: async () => [comp('a')],
      findLiveOrImminentCompetitionIds: async () => [],
      budget,
      clock: clock(0),
    })
    expect(await provider()).toEqual([])
    expect(budget.available()).toBe(10)
  })

  it('caps the returned list to the remaining budget and consumes it', async () => {
    const budget = new CallBudget(2, () => 0)
    const provider = createLiveSyncCompetitionProvider({
      listActive: async () => [comp('a'), comp('b'), comp('c')],
      findLiveOrImminentCompetitionIds: async () => ['a', 'b', 'c'],
      budget,
      clock: clock(0),
    })
    const result = await provider()
    expect(result).toHaveLength(2)
    expect(budget.available()).toBe(0)
  })

  it('round-robins under a persistent cap so every competition gets served', async () => {
    let t = 0
    // Budget of 2/min, 3 live competitions, ticking every 30s.
    const budget = new CallBudget(2, () => t)
    const provider = createLiveSyncCompetitionProvider({
      listActive: async () => [comp('a'), comp('b'), comp('c')],
      findLiveOrImminentCompetitionIds: async () => ['a', 'b', 'c'],
      budget,
      clock: { now: () => new Date(t) },
    })
    const served = new Set<string>()
    for (let i = 0; i < 4; i++) {
      const picked = await provider()
      for (const c of picked) served.add(c.id)
      t += 30_000
    }
    expect(served).toEqual(new Set(['a', 'b', 'c'])) // none starved
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @m5nita/api exec vitest run src/application/match/liveSyncCompetitionProvider.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the provider**

Create `apps/api/src/application/match/liveSyncCompetitionProvider.ts`:

```typescript
import type { Clock } from '../../domain/shared/Clock'
import type { CallBudget } from '../../lib/callBudget'
import type { CompetitionInfo } from './SyncLiveScoresUseCase'

/** Start polling a competition this long before its match kicks off. */
const DEFAULT_PRE_KICKOFF_MS = 10 * 60_000
/** Keep polling this long after a kickoff that hasn't flipped to live yet. */
const DEFAULT_POST_KICKOFF_GRACE_MS = 30 * 60_000

export type LiveSyncProviderDeps = {
  listActive: () => Promise<CompetitionInfo[]>
  findLiveOrImminentCompetitionIds: (now: Date) => Promise<string[]>
  budget: CallBudget
  clock: Clock
  preKickoffMs?: number
  postKickoffGraceMs?: number
}

/**
 * Returns the `findActiveCompetitions` function the live-sync use case calls each
 * tick. It only yields competitions that actually have a live/imminent match
 * (every yielded competition costs one football-data call), ordered
 * least-recently-synced first, and capped to the remaining per-minute call
 * budget — so the sync stays within the football-data rate limit and degrades
 * by round-robin instead of overrunning it.
 */
export function createLiveSyncCompetitionProvider(
  deps: LiveSyncProviderDeps,
): () => Promise<CompetitionInfo[]> {
  const preKickoffMs = deps.preKickoffMs ?? DEFAULT_PRE_KICKOFF_MS
  const postKickoffGraceMs = deps.postKickoffGraceMs ?? DEFAULT_POST_KICKOFF_GRACE_MS
  const lastSyncedAt = new Map<string, number>()

  return async () => {
    const now = deps.clock.now()
    const liveOrImminent = new Set(await deps.findLiveOrImminentCompetitionIds(now))
    if (liveOrImminent.size === 0) return []

    const candidates = (await deps.listActive()).filter((c) => liveOrImminent.has(c.id))
    if (candidates.length === 0) return []

    // Least-recently-synced first so that, when the budget can't cover them all
    // this tick, the ones skipped last tick get priority next tick.
    candidates.sort((a, b) => (lastSyncedAt.get(a.id) ?? 0) - (lastSyncedAt.get(b.id) ?? 0))

    const affordable = deps.budget.take(candidates.length)
    const chosen = candidates.slice(0, affordable)
    if (chosen.length < candidates.length) {
      console.warn(
        `[LiveSync] call budget: syncing ${chosen.length}/${candidates.length} live/imminent competitions this tick`,
      )
    }

    const nowMs = now.getTime()
    for (const c of chosen) lastSyncedAt.set(c.id, nowMs)
    return chosen
  }
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `pnpm --filter @m5nita/api exec vitest run src/application/match/liveSyncCompetitionProvider.test.ts`
Expected: PASS.

- [ ] **Step 5: Guardrails + commit**

```bash
pnpm check:arch && pnpm check:leaks
pnpm biome check --write apps/api/src/application/match/liveSyncCompetitionProvider.ts apps/api/src/application/match/liveSyncCompetitionProvider.test.ts
git add apps/api/src/application/match/liveSyncCompetitionProvider.ts apps/api/src/application/match/liveSyncCompetitionProvider.test.ts
git commit -m "feat(api): budget-aware live-sync competition provider"
```

---

### Task C4: Wire the adaptive sync — 30s tick, budgeted provider, env config

**Files:**
- Modify: `apps/api/src/index.ts` (`buildMatchSyncRunners`, the env read, the `live-score-sync` cron `intervalMs`)
- Modify: `.env.example` (document the new var)

**Interfaces:**
- Consumes: `CallBudget` (C1), `createLiveSyncCompetitionProvider` (C3), `findActiveCompetitionsForSync` (existing), `getContainer().matchRepo` + `clock`.

- [ ] **Step 1: Add the env var read**

In `apps/api/src/index.ts`, next to the existing `const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY ?? ''` line, add:

```typescript
// football-data.org limit: 20 calls/min today, 10/min after the World Cup.
// The live-sync self-throttles to stay at or under this; flip it via env, no deploy code change.
const FOOTBALL_DATA_MAX_CALLS_PER_MIN = Number(process.env.FOOTBALL_DATA_MAX_CALLS_PER_MIN ?? '20')
```

- [ ] **Step 2: Use the budget-aware provider for live-sync only**

In `apps/api/src/index.ts`, update `buildMatchSyncRunners` so the live-sync use case uses the budgeted provider (fixtures sync keeps the plain provider). Add the imports at the top of the file:

```typescript
import { CallBudget } from './lib/callBudget'
import { createLiveSyncCompetitionProvider } from './application/match/liveSyncCompetitionProvider'
```

Then inside `buildMatchSyncRunners`, after `const { matchRepo, clock } = getContainer()`, build the provider and pass it to `SyncLiveScoresUseCase` (replace its `findActiveCompetitions: findActiveCompetitionsForSync` line):

```typescript
  const liveSyncBudget = new CallBudget(FOOTBALL_DATA_MAX_CALLS_PER_MIN)
  const liveSyncCompetitions = createLiveSyncCompetitionProvider({
    listActive: findActiveCompetitionsForSync,
    findLiveOrImminentCompetitionIds: (now) =>
      matchRepo.findCompetitionIdsWithLiveOrImminent(10 * 60_000, 30 * 60_000, now),
    budget: liveSyncBudget,
    clock,
  })

  const syncLiveScoresUseCase = new SyncLiveScoresUseCase({
    footballApi,
    matchRepo,
    clock,
    findActiveCompetitions: liveSyncCompetitions,
    onMatchFinished: calcPointsForMatch,
    onAllMatchesChecked: checkAndClosePools,
  })
```

> `findActiveCompetitionsForSync` returns the full `CompetitionInfo` shape the use case needs; the provider just filters/caps it. The fixtures use case (`SyncFixturesUseCase`) is unchanged and still uses `findActiveCompetitionsForSync` directly.

- [ ] **Step 3: Tighten the live-score cron to a 30s tick**

In `apps/api/src/index.ts`, change the `live-score-sync` cron registration’s `intervalMs` from `60 * 1000` to `30 * 1000` (leave `crontab: '* * * * *'` — Sentry tolerates the extra mid-minute check-in; the runner self-gates external calls so the faster tick costs ~0 when nothing is live):

```typescript
  scheduleCron({
    slug: 'live-score-sync',
    crontab: '* * * * *',
    // 30s tick: only competitions with a live/imminent match are actually
    // fetched, and the per-minute call budget caps external calls — so idle
    // ticks just run one cheap indexed DB query and return.
    intervalMs: 30 * 1000,
    checkinMargin: 2,
    maxRuntime: 5,
    run: matchSync.syncLiveScores,
  })
```

- [ ] **Step 4: Document the env var**

In `.env.example`, under the football-data key line, add:

```
# Max football-data.org calls per minute the live-sync may make (default 20; set 10 after the World Cup)
FOOTBALL_DATA_MAX_CALLS_PER_MIN=20
```

- [ ] **Step 5: Verify build + the existing live-sync unit test**

Run: `pnpm --filter @m5nita/api exec vitest run src/application/match/SyncLiveScoresUseCase.test.ts && pnpm --filter @m5nita/api exec tsc -b`
Expected: PASS + clean typecheck. (The use case is unchanged; only its injected `findActiveCompetitions` differs at wiring time.)

- [ ] **Step 6: Manual verification**

With `pnpm dev` and `FOOTBALL_DATA_API_KEY` set:
1. With no live/imminent match, confirm the logs show the live-score cron running ~every 30s with no football-data request (the provider returns `[]`).
2. Seed/await a live match in a featured active competition; confirm football-data is called for that competition roughly every 30s and scores update; confirm calls/min never exceed `FOOTBALL_DATA_MAX_CALLS_PER_MIN`.
3. Set `FOOTBALL_DATA_MAX_CALLS_PER_MIN=10`, restart, repeat — still under budget.

- [ ] **Step 7: Commit**

```bash
pnpm biome check --write apps/api/src/index.ts .env.example
git add apps/api/src/index.ts .env.example
git commit -m "feat(api): 30s adaptive live-sync within a configurable call budget"
```

---

# Finalization

- [ ] **Run the full unit suite and guardrails**

```bash
pnpm test
pnpm check:arch && pnpm check:leaks
```
Expected: all pass.

- [ ] **Run the integration suite**

```bash
docker compose up -d postgres-test
DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test pnpm --filter @m5nita/api test:integration
```
Expected: all pass (including the three new scenarios).

- [ ] **Finish the branch** — use the `superpowers:finishing-a-development-branch` skill to open the PR (per project notes, push works but the GitHub API is blocked on the work network → open the PR via the web compare URL).

---

## Self-Review (filled by author)

**Spec coverage:**
- FR-001/002 (focus + reconnect refresh) → Task A2. FR-003 (live poll while foregrounded, pause hidden) → unchanged TanStack default + A3 staleTime. FR-004 (imminent heartbeat) → A1 + A3. FR-005 (focus not stampeding the aggregate) → A2 relies on the existing 25s cache + single-flight (documented). FR-006 (stats/header refresh on focus) → A2 (global flag flips them on). FR-007 (no prediction-submit refetch) → honored: predictions mutation untouched. FR-008 (front cadence aligned to backend) → A3 + C4 both ~30s.
- FR-009 (stable order) → B1. FR-010 (no live reorder) → honored: ranking still sorts by finalized points, `Ranking.build` untouched. FR-011/012 (no finish vanish / no double count) → B2 + B3.
- FR-013/014 (30s adaptive, DB-driven competition selection) → C2 + C3 + C4. FR-015 (budget self-throttle) → C1 + C3. FR-016 (env-configurable budget) → C4.
- SC-001..007 mapped to A2/A3 (focus latency), A3 (kickoff auto-live), B1 (stable order), B2/B3 (no vanish), C4 (≤30s freshness), C1/C3 (budget), and the "no new infra" constraint.

**Placeholder scan:** none — every code step has complete code; integration tests reuse documented seed helpers and say so explicitly.

**Type consistency:** `matchesPollMs`/`poolsPollMs` signatures match their call sites; `CallBudget.take/available`, `findCompetitionIdsWithLiveOrImminent(preKickoffMs, postKickoffGraceMs, now)`, and `createLiveSyncCompetitionProvider` deps are used identically in C3/C4; `TransactionalRepositories` gains `predictions`/`ranking` used by B3’s calcPoints.
