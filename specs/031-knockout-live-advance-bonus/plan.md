# Live Advance Bonus + Opponent Advance Picks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the knockout advance bonus (+2) live during extra time (following whoever currently leads the aggregate), decomposed on screen as `+scoreline +2`, and surface each opponent's advance pick in the predictions list.

**Architecture:** A new pure domain function derives the *provisional* advancing side from the live extra-time aggregate and feeds the existing `AdvanceBonus`/`KnockoutContext` seam — so the +2 stays single-sourced. The live-points calculators (card + ranking) thread the already-synced knockout fields (`duration`, extra-time sub-scores) plus the member's `advancePick` into that seam. The frontend decomposes points into `+scoreline +advance` and renders an advance-pick chip.

**Tech Stack:** TypeScript (strict), Vitest, Hono (API), Drizzle ORM, React 19 + Tailwind v4 (web), `@m5nita/shared` workspace types.

## Global Constraints

- Scoreline grading stays **regular-time only** — do NOT change `gradedScoreline` or the 10/8/7/5/0 scale.
- The +2 rule lives **once** in `domain/scoring/AdvanceBonus.ts` (`SCORING.ADVANCE_BONUS`); never re-derive it. Guardrails G2 (`pnpm check:leaks`) and G3 (`pnpm check:arch`) must stay green.
- **No schema changes, no new dependencies, no provider changes** — all fields (`duration`, `extra_time_*`, `advance_pick`) already exist and are already synced.
- Monetary/none here; all scores are plain integers.
- Live penalty shootouts show **no** provisional +2 (deferred to settlement). Provisional +2 is **extra time only**.
- API single-file test: `pnpm --filter @m5nita/api exec vitest run <path>`. Web single-file test: `pnpm --filter @m5nita/web exec vitest run <path>`.

---

### Task 1: Rename `decidedInOvertime` → `pastRegularTime` on `KnockoutContext`

Renames the context flag so it reads correctly for both the settled case ("decided in overtime") and the new live case ("currently past regular time"). Pure rename — no behavior change.

**Files:**
- Modify: `apps/api/src/domain/scoring/AdvanceBonus.ts`
- Modify: `apps/api/src/domain/match/KnockoutResult.ts:41-52`
- Test: `apps/api/src/domain/scoring/AdvanceBonus.test.ts`
- Test: `apps/api/src/domain/match/KnockoutResult.test.ts`

**Interfaces:**
- Produces: `type KnockoutContext = { pastRegularTime: boolean; advancingSide: 'home' | 'away'; predictedAdvance: 'home' | 'away' | null }` and `AdvanceBonus.apply(score, knockout?)` (unchanged signature).

- [ ] **Step 1: Update the two tests to the new field name (these now fail to compile/run)**

In `AdvanceBonus.test.ts`, change the `ctx` helper and the regular-time case:

```typescript
function ctx(over: Partial<KnockoutContext>): KnockoutContext {
  return { pastRegularTime: true, advancingSide: 'home', predictedAdvance: 'home', ...over }
}
```

```typescript
  it('adds nothing when the match stayed in regular time', () => {
    expect(AdvanceBonus.apply(exactDraw, ctx({ pastRegularTime: false })).points).toBe(10)
  })
```

In `KnockoutResult.test.ts`, replace every `decidedInOvertime:` with `pastRegularTime:` (three occurrences in the `knockoutContextFor` expectations).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @m5nita/api exec vitest run src/domain/scoring/AdvanceBonus.test.ts src/domain/match/KnockoutResult.test.ts`
Expected: FAIL — `pastRegularTime` does not exist on `KnockoutContext`.

- [ ] **Step 3: Rename the field in the domain**

In `AdvanceBonus.ts`, update the type and the guard:

```typescript
export type KnockoutContext = {
  /** True when the match is in or past regular time — settled in overtime, OR live in extra time. */
  pastRegularTime: boolean
  advancingSide: 'home' | 'away'
  predictedAdvance: 'home' | 'away' | null
}

export const AdvanceBonus = {
  apply(score: Score, knockout?: KnockoutContext): Score {
    if (!knockout?.pastRegularTime) return score
    if (knockout.predictedAdvance !== knockout.advancingSide) return score
    return score.withAdvanceBonus(SCORING.ADVANCE_BONUS)
  },
}
```

In `KnockoutResult.ts`, update `knockoutContextFor`'s return:

```typescript
  return {
    pastRegularTime: match.duration === 'extra_time' || match.duration === 'penalty_shootout',
    advancingSide: match.winner === 'home' ? 'home' : 'away',
    predictedAdvance,
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @m5nita/api exec vitest run src/domain/scoring/AdvanceBonus.test.ts src/domain/match/KnockoutResult.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domain/scoring/AdvanceBonus.ts apps/api/src/domain/scoring/AdvanceBonus.test.ts apps/api/src/domain/match/KnockoutResult.ts apps/api/src/domain/match/KnockoutResult.test.ts
git commit -m "refactor(domain): rename KnockoutContext.decidedInOvertime to pastRegularTime"
```

---

### Task 2: Domain — `liveAdvancingSide` + `liveKnockoutContextFor`

The pure rule for "who is provisionally advancing" while a knockout is live in extra time.

**Files:**
- Modify: `apps/api/src/domain/match/KnockoutResult.ts`
- Test: `apps/api/src/domain/match/KnockoutResult.test.ts`

**Interfaces:**
- Consumes: `isKnockout(stage)` (already imported), `KnockoutContext` (from Task 1).
- Produces:
  - `type LiveKnockoutState = { status: string; stage: string; duration: string | null; regHome: number | null; regAway: number | null; extraHome: number | null; extraAway: number | null }`
  - `liveAdvancingSide(s: LiveKnockoutState): 'home' | 'away' | null`
  - `liveKnockoutContextFor(s: LiveKnockoutState, predictedAdvance: 'home' | 'away' | null): KnockoutContext | undefined`

- [ ] **Step 1: Write the failing tests**

Append to `KnockoutResult.test.ts`:

```typescript
import { liveAdvancingSide, liveKnockoutContextFor } from './KnockoutResult'

describe('liveAdvancingSide (extra time, live)', () => {
  const base = {
    status: 'live',
    stage: 'final',
    duration: 'extra_time' as string | null,
    regHome: 1 as number | null,
    regAway: 1 as number | null,
    extraHome: 0 as number | null,
    extraAway: 0 as number | null,
  }

  it('returns the side leading the aggregate (home scored in ET)', () => {
    expect(liveAdvancingSide({ ...base, extraHome: 1 })).toBe('home')
  })

  it('returns the side leading the aggregate (away scored in ET)', () => {
    expect(liveAdvancingSide({ ...base, extraAway: 1 })).toBe('away')
  })

  it('returns null when the aggregate is level', () => {
    expect(liveAdvancingSide(base)).toBeNull()
  })

  it('returns null during a live penalty shootout (resolved only at the end)', () => {
    expect(liveAdvancingSide({ ...base, duration: 'penalty_shootout' })).toBeNull()
  })

  it('returns null during regulation time', () => {
    expect(liveAdvancingSide({ ...base, duration: 'regular' })).toBeNull()
  })

  it('returns null when the match is not live (finished)', () => {
    expect(liveAdvancingSide({ ...base, status: 'finished', extraHome: 1 })).toBeNull()
  })

  it('returns null for a non-knockout match', () => {
    expect(liveAdvancingSide({ ...base, stage: 'group', extraHome: 1 })).toBeNull()
  })
})

describe('liveKnockoutContextFor', () => {
  const state = {
    status: 'live',
    stage: 'final',
    duration: 'extra_time' as string | null,
    regHome: 1 as number | null,
    regAway: 1 as number | null,
    extraHome: 1 as number | null,
    extraAway: 0 as number | null,
  }

  it('builds a context naming the provisional leader', () => {
    expect(liveKnockoutContextFor(state, 'home')).toEqual({
      pastRegularTime: true,
      advancingSide: 'home',
      predictedAdvance: 'home',
    })
  })

  it('returns undefined when there is no provisional leader', () => {
    expect(liveKnockoutContextFor({ ...state, extraHome: 0 }, 'home')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @m5nita/api exec vitest run src/domain/match/KnockoutResult.test.ts`
Expected: FAIL — `liveAdvancingSide`/`liveKnockoutContextFor` not exported.

- [ ] **Step 3: Implement in `KnockoutResult.ts`**

Append:

```typescript
export type LiveKnockoutState = {
  status: string
  stage: string
  duration: string | null
  regHome: number | null
  regAway: number | null
  extraHome: number | null
  extraAway: number | null
}

/**
 * The provisional advancing side while a knockout is LIVE in extra time:
 * whoever leads the aggregate (regular-time + extra-time) score. Returns null
 * during regulation, during a live penalty shootout (resolved only at the end),
 * when the aggregate is level, or for any non-live / non-knockout match.
 */
export function liveAdvancingSide(s: LiveKnockoutState): 'home' | 'away' | null {
  if (s.status !== 'live') return null
  if (!isKnockout(s.stage)) return null
  if (s.duration !== 'extra_time') return null
  if (s.regHome === null || s.regAway === null) return null
  const aggHome = s.regHome + (s.extraHome ?? 0)
  const aggAway = s.regAway + (s.extraAway ?? 0)
  if (aggHome === aggAway) return null
  return aggHome > aggAway ? 'home' : 'away'
}

/**
 * Knockout context for a match LIVE in extra time, built from the provisional
 * advancing side. Returns undefined when there is no provisional leader, so the
 * shared AdvanceBonus rule simply adds nothing.
 */
export function liveKnockoutContextFor(
  s: LiveKnockoutState,
  predictedAdvance: 'home' | 'away' | null,
): KnockoutContext | undefined {
  const advancingSide = liveAdvancingSide(s)
  if (!advancingSide) return undefined
  return { pastRegularTime: true, advancingSide, predictedAdvance }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @m5nita/api exec vitest run src/domain/match/KnockoutResult.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domain/match/KnockoutResult.ts apps/api/src/domain/match/KnockoutResult.test.ts
git commit -m "feat(domain): provisional advancing side for live extra time"
```

---

### Task 3: `computeLivePoints` — apply the live +2 and expose `advanceBonus`

**Files:**
- Modify: `apps/api/src/application/prediction/computeLivePoints.ts`
- Test: `apps/api/src/application/prediction/computeLivePoints.test.ts`

**Interfaces:**
- Consumes: `liveKnockoutContextFor` (Task 2), `AdvanceSide` from `domain/prediction/Prediction`.
- Produces:
  - `type LiveBreakdown = { total: number; category: number; bonus: number; advanceBonus: number }`
  - `computeLivePoints(prediction: { homeScore: number; awayScore: number; advancePick?: AdvanceSide | null }, match: { status: string; homeScore: number | null; awayScore: number | null; stage?: string; duration?: string | null; extraTimeHomeScore?: number | null; extraTimeAwayScore?: number | null }, storedPoints: number | null, scoringPolicy: ScoringPolicy): LivePoints`

- [ ] **Step 1: Write the failing tests**

Append to `computeLivePoints.test.ts`:

```typescript
describe('computeLivePoints — live extra-time advance bonus', () => {
  const liveET = {
    status: 'live',
    homeScore: 1, // regular-time (90') score
    awayScore: 1,
    stage: 'final',
    duration: 'extra_time' as string | null,
    extraTimeHomeScore: 1, // home leads the aggregate 2-1
    extraTimeAwayScore: 0,
  }

  it('adds +2 to an exact 90 draw when the picked side leads in ET (range → breakdown)', () => {
    const result = computeLivePoints(
      { homeScore: 1, awayScore: 1, advancePick: 'home' },
      liveET,
      null,
      RangeScoringPolicy,
    )
    expect(result).toEqual({ total: 12, category: 10, bonus: 0, advanceBonus: 2 })
  })

  it('decomposes a correct non-exact draw as 5 + 2', () => {
    const result = computeLivePoints(
      { homeScore: 0, awayScore: 0, advancePick: 'home' },
      liveET,
      null,
      RangeScoringPolicy,
    )
    expect(result).toEqual({ total: 7, category: 5, bonus: 0, advanceBonus: 2 })
  })

  it('decomposes a missed scoreline that still called the leader as 0 + 2', () => {
    const result = computeLivePoints(
      { homeScore: 2, awayScore: 1, advancePick: 'home' },
      liveET,
      null,
      RangeScoringPolicy,
    )
    expect(result).toEqual({ total: 2, category: 0, bonus: 0, advanceBonus: 2 })
  })

  it('adds no bonus when the pick named the other side (plain number)', () => {
    const result = computeLivePoints(
      { homeScore: 0, awayScore: 0, advancePick: 'away' },
      liveET,
      null,
      RangeScoringPolicy,
    )
    expect(result).toBe(5)
  })

  it('adds no bonus during a live penalty shootout', () => {
    const result = computeLivePoints(
      { homeScore: 0, awayScore: 0, advancePick: 'home' },
      { ...liveET, duration: 'penalty_shootout', extraTimeHomeScore: 0 },
      null,
      RangeScoringPolicy,
    )
    expect(result).toBe(5)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @m5nita/api exec vitest run src/application/prediction/computeLivePoints.test.ts`
Expected: FAIL — bonus not applied / `advanceBonus` missing.

- [ ] **Step 3: Implement**

Replace the contents of `computeLivePoints.ts`:

```typescript
import { liveKnockoutContextFor } from '../../domain/match/KnockoutResult'
import type { AdvanceSide } from '../../domain/prediction/Prediction'
import type { ScoringPolicy } from '../../domain/scoring/ScoringPolicy'

type PredictionScores = { homeScore: number; awayScore: number; advancePick?: AdvanceSide | null }
type MatchState = {
  status: string
  homeScore: number | null
  awayScore: number | null
  stage?: string
  duration?: string | null
  extraTimeHomeScore?: number | null
  extraTimeAwayScore?: number | null
}

export type LiveBreakdown = { total: number; category: number; bonus: number; advanceBonus: number }
export type LivePoints = number | null | LiveBreakdown

export function computeLivePoints(
  prediction: PredictionScores,
  match: MatchState,
  storedPoints: number | null,
  scoringPolicy: ScoringPolicy,
): LivePoints {
  if (match.status !== 'live') return storedPoints
  if (match.homeScore === null || match.awayScore === null) return null

  const knockout = liveKnockoutContextFor(
    {
      status: match.status,
      stage: match.stage ?? '',
      duration: match.duration ?? null,
      regHome: match.homeScore,
      regAway: match.awayScore,
      extraHome: match.extraTimeHomeScore ?? null,
      extraAway: match.extraTimeAwayScore ?? null,
    },
    prediction.advancePick ?? null,
  )

  const score = scoringPolicy.score(
    prediction.homeScore,
    prediction.awayScore,
    match.homeScore,
    match.awayScore,
    knockout,
  )

  if (score.breakdown) {
    return {
      total: score.points,
      category: score.breakdown.category,
      bonus: score.breakdown.bonus,
      advanceBonus: score.breakdown.advanceBonus,
    }
  }
  return score.points
}
```

> Note: existing single-match tests expect `{ total, category, bonus }`. Update those two expectations to include `advanceBonus: 0` (e.g. `{ total: 9, category: 7, bonus: 2, advanceBonus: 0 }`).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @m5nita/api exec vitest run src/application/prediction/computeLivePoints.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/application/prediction/computeLivePoints.ts apps/api/src/application/prediction/computeLivePoints.test.ts
git commit -m "feat(scoring): live extra-time advance bonus in computeLivePoints"
```

---

### Task 4: Live ranking — provisional +2 (extra time) and settled +2 (just-finished)

`computeLivePointsByUser` currently sums provisional points with no knockout context. Thread `advancePick` + the match's knockout fields and apply the right context per status.

**Files:**
- Create: `apps/api/src/application/prediction/provisionalKnockout.ts`
- Create: `apps/api/src/application/prediction/provisionalKnockout.test.ts`
- Modify: `apps/api/src/services/ranking.ts:40-98`

**Interfaces:**
- Consumes: `liveKnockoutContextFor`, `knockoutContextFor` (Task 2 / existing).
- Produces: `provisionalKnockoutContext(m: ProvisionalMatchState, advancePick: 'home' | 'away' | null): KnockoutContext | undefined` where `ProvisionalMatchState = { status: string; stage: string; duration: string | null; winner: string | null; home: number; away: number; extraHome: number | null; extraAway: number | null }`.

- [ ] **Step 1: Write the failing test**

Create `provisionalKnockout.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { provisionalKnockoutContext } from './provisionalKnockout'

describe('provisionalKnockoutContext', () => {
  it('uses the live extra-time leader while the match is live', () => {
    const ctx = provisionalKnockoutContext(
      {
        status: 'live',
        stage: 'semi',
        duration: 'extra_time',
        winner: null,
        home: 1,
        away: 1,
        extraHome: 1,
        extraAway: 0,
      },
      'home',
    )
    expect(ctx).toEqual({ pastRegularTime: true, advancingSide: 'home', predictedAdvance: 'home' })
  })

  it('uses the settled winner once the match is finished (penalty-decided)', () => {
    const ctx = provisionalKnockoutContext(
      {
        status: 'finished',
        stage: 'final',
        duration: 'penalty_shootout',
        winner: 'away',
        home: 1,
        away: 1,
        extraHome: 0,
        extraAway: 0,
      },
      'away',
    )
    expect(ctx).toEqual({ pastRegularTime: true, advancingSide: 'away', predictedAdvance: 'away' })
  })

  it('returns undefined for a live shootout (no provisional leader)', () => {
    const ctx = provisionalKnockoutContext(
      {
        status: 'live',
        stage: 'final',
        duration: 'penalty_shootout',
        winner: null,
        home: 1,
        away: 1,
        extraHome: 0,
        extraAway: 0,
      },
      'home',
    )
    expect(ctx).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @m5nita/api exec vitest run src/application/prediction/provisionalKnockout.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `provisionalKnockout.ts`**

```typescript
import { knockoutContextFor, liveKnockoutContextFor } from '../../domain/match/KnockoutResult'
import type { KnockoutContext } from '../../domain/scoring/AdvanceBonus'

export type ProvisionalMatchState = {
  status: string
  stage: string
  duration: string | null
  winner: string | null
  home: number
  away: number
  extraHome: number | null
  extraAway: number | null
}

/**
 * The knockout context to use for a match still being scored "live" in the
 * ranking: the provisional extra-time leader while live, or the settled winner
 * once finished (covers the brief window before calcPoints persists points).
 */
export function provisionalKnockoutContext(
  m: ProvisionalMatchState,
  advancePick: 'home' | 'away' | null,
): KnockoutContext | undefined {
  if (m.status === 'live') {
    return liveKnockoutContextFor(
      {
        status: m.status,
        stage: m.stage,
        duration: m.duration,
        regHome: m.home,
        regAway: m.away,
        extraHome: m.extraHome,
        extraAway: m.extraAway,
      },
      advancePick,
    )
  }
  return knockoutContextFor({ stage: m.stage, winner: m.winner, duration: m.duration }, advancePick)
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @m5nita/api exec vitest run src/application/prediction/provisionalKnockout.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it into `computeLivePointsByUser` (`services/ranking.ts`)**

Add the import at the top:

```typescript
import { provisionalKnockoutContext } from '../application/prediction/provisionalKnockout'
```

Extend the `liveMatches` selection to carry the knockout fields:

```typescript
  const liveMatches = await db
    .select({
      id: matchTable.id,
      home: matchTable.homeScore,
      away: matchTable.awayScore,
      status: matchTable.status,
      stage: matchTable.stage,
      duration: matchTable.duration,
      winner: matchTable.winner,
      extraHome: matchTable.extraTimeHomeScore,
      extraAway: matchTable.extraTimeAwayScore,
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
```

Add `advancePick` to the `livePreds` selection:

```typescript
  const livePreds = await db
    .select({
      userId: prediction.userId,
      predHome: prediction.homeScore,
      predAway: prediction.awayScore,
      matchId: prediction.matchId,
      advancePick: prediction.advancePick,
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
```

Apply the context inside the loop:

```typescript
  const byUser = new Map<string, number>()
  for (const row of livePreds) {
    const m = scoreByMatch.get(row.matchId)
    if (!m || m.home === null || m.away === null) continue
    const advancePick = row.advancePick === 'home' || row.advancePick === 'away' ? row.advancePick : null
    const knockout = provisionalKnockoutContext(
      {
        status: m.status,
        stage: m.stage,
        duration: m.duration,
        winner: m.winner,
        home: m.home,
        away: m.away,
        extraHome: m.extraHome,
        extraAway: m.extraAway,
      },
      advancePick,
    )
    const pts = scoringPolicy.score(row.predHome, row.predAway, m.home, m.away, knockout).points
    byUser.set(row.userId, (byUser.get(row.userId) ?? 0) + pts)
  }
  return byUser
```

- [ ] **Step 6: Run the ranking + provisional tests and guardrails**

Run: `pnpm --filter @m5nita/api exec vitest run src/application/prediction/provisionalKnockout.test.ts`
Run: `pnpm check:leaks && pnpm check:arch`
Expected: PASS / green.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/application/prediction/provisionalKnockout.ts apps/api/src/application/prediction/provisionalKnockout.test.ts apps/api/src/services/ranking.ts
git commit -m "feat(ranking): provisional advance bonus in live standings"
```

---

### Task 5: `GetUserPredictionsUseCase` — thread live knockout data + expose `advanceBonus` for range

**Files:**
- Modify: `apps/api/src/application/prediction/GetUserPredictionsUseCase.ts:37-79`
- Test: `apps/api/src/application/prediction/GetUserPredictionsUseCase.test.ts`

**Interfaces:**
- Consumes: extended `computeLivePoints` (Task 3), `knockoutContextFor` (existing).
- Produces: each returned prediction carries `category?`, `bonus?`, `advanceBonus?` for **range** knockout matches too (previously single-match only).

- [ ] **Step 1: Write the failing tests**

Add to `GetUserPredictionsUseCase.test.ts` (range pool via `makeUseCase`):

```typescript
describe('GetUserPredictionsUseCase — knockout advance bonus (range pool)', () => {
  it('exposes advanceBonus on a finished penalty-decided knockout (range)', async () => {
    const pred = basePwm()
    pred.homeScore = 1
    pred.awayScore = 1
    pred.advancePick = 'home'
    pred.points = 12
    pred.match.stage = 'final'
    pred.match.status = 'finished'
    pred.match.homeScore = 1
    pred.match.awayScore = 1
    pred.match.winner = 'home'
    pred.match.duration = 'penalty_shootout'

    const uc = makeUseCase([pred])
    const res = await uc.execute({ userId: 'u-1', poolId: 'pool-1' })

    expect(res[0]?.points).toBe(12)
    expect(res[0]?.advanceBonus).toBe(2)
    expect(res[0]?.category).toBe(10)
  })

  it('adds a live +2 during extra time when the picked side leads (range)', async () => {
    const pred = basePwm()
    pred.homeScore = 0
    pred.awayScore = 0
    pred.advancePick = 'home'
    pred.points = null
    pred.match.stage = 'semi'
    pred.match.status = 'live'
    pred.match.homeScore = 1
    pred.match.awayScore = 1
    pred.match.duration = 'extra_time'
    pred.match.extraTimeHomeScore = 1
    pred.match.extraTimeAwayScore = 0

    const uc = makeUseCase([pred])
    const res = await uc.execute({ userId: 'u-1', poolId: 'pool-1' })

    expect(res[0]?.points).toBe(7) // 5 (correct draw) + 2
    expect(res[0]?.advanceBonus).toBe(2)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @m5nita/api exec vitest run src/application/prediction/GetUserPredictionsUseCase.test.ts`
Expected: FAIL — `advanceBonus` undefined for range / live +2 not applied.

- [ ] **Step 3: Implement**

Replace the body of the `predictions.map(...)` callback (lines ~37-79):

```typescript
    const withLivePoints = predictions.map((p) => {
      const predScores = {
        homeScore: p.homeScore,
        awayScore: p.awayScore,
        advancePick: toAdvanceSide(p.advancePick),
      }
      const matchState = {
        status: p.match.status,
        homeScore: p.match.homeScore,
        awayScore: p.match.awayScore,
        stage: p.match.stage,
        duration: p.match.duration,
        extraTimeHomeScore: p.match.extraTimeHomeScore,
        extraTimeAwayScore: p.match.extraTimeAwayScore,
      }

      const live = computeLivePoints(predScores, matchState, p.points, scoringPolicy)

      let points: number | null
      let category: number | undefined
      let bonus: number | undefined
      let advanceBonus: number | undefined

      if (typeof live === 'object' && live !== null) {
        points = live.total
        category = live.category
        bonus = live.bonus
        advanceBonus = live.advanceBonus
      } else {
        points = live
        if (points !== null && p.match.homeScore !== null && p.match.awayScore !== null) {
          const knockout = knockoutContextFor(p.match, toAdvanceSide(p.advancePick))
          const s = scoringPolicy.score(
            p.homeScore,
            p.awayScore,
            p.match.homeScore,
            p.match.awayScore,
            knockout,
          )
          category = s.breakdown?.category
          bonus = s.breakdown?.bonus
          advanceBonus = s.breakdown?.advanceBonus
        }
      }

      return { ...p, points, category, bonus, advanceBonus }
    })
```

(The `includesBonus` local is now unused — delete its declaration on line ~35.)

- [ ] **Step 4: Run to verify pass (and the existing suite still green)**

Run: `pnpm --filter @m5nita/api exec vitest run src/application/prediction/GetUserPredictionsUseCase.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/application/prediction/GetUserPredictionsUseCase.ts apps/api/src/application/prediction/GetUserPredictionsUseCase.test.ts
git commit -m "feat(predictions): live + range advance bonus in user predictions"
```

---

### Task 6: `GetMatchPredictionsUseCase` + shared type — expose `advancePick` and range `advanceBonus`

**Files:**
- Modify: `packages/shared/src/types/index.ts` (`MatchPredictor`)
- Modify: `apps/api/src/application/prediction/GetMatchPredictionsUseCase.ts:81-134`
- Test: `apps/api/src/application/prediction/GetMatchPredictionsUseCase.test.ts`

**Interfaces:**
- Consumes: extended `computeLivePoints` (Task 3).
- Produces: `MatchPredictor` gains `advancePick?: AdvanceSide | null`; each predictor carries `advanceBonus` for range knockout too.

- [ ] **Step 1: Extend the shared type**

In `packages/shared/src/types/index.ts`, add to `MatchPredictor`:

```typescript
  /** Knockout only: which side this predictor picked to advance (home/away/null). */
  advancePick?: AdvanceSide | null
```

(Confirm `AdvanceSide` is already exported in that file — it is used by `Prediction`.)

- [ ] **Step 2: Write the failing test**

Add to `GetMatchPredictionsUseCase.test.ts` (follow the file's existing mock setup; a range pool, a locked knockout match, one opponent with `advancePick: 'home'`):

```typescript
  it('exposes each predictor advancePick and advanceBonus on a finished knockout', async () => {
    // Arrange a finished penalty-decided knockout (1-1, home advances) with an
    // opponent who predicted 1-1 and picked home. Use the file's existing
    // builders; key assertions below.
    const res = await execute() // however this test file invokes the use case
    const opponent = res.predictors[0]
    expect(opponent?.advancePick).toBe('home')
    expect(opponent?.advanceBonus).toBe(2)
  })
```

> When implementing: mirror the arrangement already used by the sibling tests in this file (same repo mocks, `findByPoolMatch` returning a predictor with `advancePick: 'home'`, match `stage:'final'`, `status:'finished'`, `winner:'home'`, `duration:'penalty_shootout'`, `homeScore:1`, `awayScore:1`).

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @m5nita/api exec vitest run src/application/prediction/GetMatchPredictionsUseCase.test.ts`
Expected: FAIL — `advancePick`/`advanceBonus` not present.

- [ ] **Step 4: Implement**

In the `predictors` map, build `matchState` with the live knockout fields and pass `advancePick` into `computeLivePoints`:

```typescript
        const predScores = {
          homeScore: p.homeScore,
          awayScore: p.awayScore,
          advancePick: toAdvanceSide(p.advancePick),
        }
        const matchState = {
          status: match.status.value,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          stage: matchData.stage,
          duration: matchData.duration,
          extraTimeHomeScore: matchData.extraTimeHomeScore,
          extraTimeAwayScore: matchData.extraTimeAwayScore,
        }
```

Replace the `if (typeof live === 'object' …) { … } else { … }` block so the breakdown is read for range too (drop the `includesBonus` guard):

```typescript
        const live: LivePoints = computeLivePoints(predScores, matchState, p.points, scoringPolicy)

        if (typeof live === 'object' && live !== null) {
          points = live.total
          category = live.category
          bonus = live.bonus
          advanceBonus = live.advanceBonus
        } else {
          points = live
          if (points !== null && match.homeScore !== null && match.awayScore !== null) {
            const knockout = knockoutContextFor(matchData, toAdvanceSide(p.advancePick))
            const s = scoringPolicy.score(
              p.homeScore,
              p.awayScore,
              match.homeScore,
              match.awayScore,
              knockout,
            )
            category = s.breakdown?.category
            bonus = s.breakdown?.bonus
            advanceBonus = s.breakdown?.advanceBonus
          }
        }

        return {
          userId: p.userId,
          name: p.name,
          homeScore: p.homeScore,
          awayScore: p.awayScore,
          advancePick: toAdvanceSide(p.advancePick),
          points,
          category,
          bonus,
          advanceBonus,
        }
```

(The `includesBonus` local declared near line 63 is now unused — delete it.)

- [ ] **Step 5: Run to verify pass**

Run: `pnpm --filter @m5nita/api exec vitest run src/application/prediction/GetMatchPredictionsUseCase.test.ts`
Run: `pnpm --filter @m5nita/shared exec tsc --noEmit`
Expected: PASS / no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types/index.ts apps/api/src/application/prediction/GetMatchPredictionsUseCase.ts apps/api/src/application/prediction/GetMatchPredictionsUseCase.test.ts
git commit -m "feat(predictions): expose advancePick + range advanceBonus for opponents"
```

---

### Task 7: Frontend — decompose `+scoreline +2` on the prediction card

**Files:**
- Modify: `apps/web/src/components/prediction/ScoreInput.tsx`
- Test: `apps/web/src/components/prediction/ScoreInput.test.tsx`

**Interfaces:**
- Consumes: existing props `points`, `advanceBonus` (already passed in `predictions.tsx`).
- Produces: when `advanceBonus > 0`, the footer renders two tokens (`+{points - advanceBonus}` and `+{advanceBonus}`) instead of a single `+{points} pts`.

- [ ] **Step 1: Write the failing test**

Add a test that renders a finished knockout prediction with an advance bonus and asserts both tokens appear. Extend `renderInput` (or add a focused helper) to pass `matchStatus="finished"`, `points={7}`, `advanceBonus={2}`, `actualHomeScore={1}`, `actualAwayScore={1}`, `category={5}`, `bonus={0}`, `stage="final"`, `winner="home"`, `duration="penalty_shootout"`, `homeScore={0}`, `awayScore={0}`:

```typescript
it('decomposes points as "+5 +2" when there is an advance bonus', () => {
  renderFinishedKnockout({ points: 7, advanceBonus: 2 })
  expect(screen.getByText('+5')).toBeInTheDocument()
  expect(screen.getByText('+2')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @m5nita/web exec vitest run src/components/prediction/ScoreInput.test.tsx`
Expected: FAIL — only a combined `+7 pts` is rendered.

- [ ] **Step 3: Implement the decomposition**

Add a small presentational helper near the other footer pieces in `ScoreInput.tsx`:

```tsx
function PointsLabel({
  total,
  advanceBonus,
  className,
}: {
  total: number
  advanceBonus: number
  className: string
}) {
  if (advanceBonus > 0) {
    const scoreline = total - advanceBonus
    return (
      <span className={`flex items-center gap-1 ${className}`}>
        <span>+{scoreline}</span>
        <span>+{advanceBonus}</span>
      </span>
    )
  }
  const label = total === 1 ? '+1 pt' : `+${total} pts`
  return <span className={className}>{label}</span>
}
```

In `ScoreResultFooter`, replace the plain `+{points} pts` spans (the `live` non-`scoreReady` span and the `finished` else-branch span) with `<PointsLabel total={points ?? 0} advanceBonus={advanceBonus ?? 0} className="font-display text-xs font-black …" />`, keeping the existing color classes (`text-red` live / `text-green` finished). For the `ScoreBreakdownToggle`, pass through `advanceBonus` and render the same decomposition in place of `totalLabel` when `advanceBonus > 0` (keep the `?` affordance).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @m5nita/web exec vitest run src/components/prediction/ScoreInput.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/prediction/ScoreInput.tsx apps/web/src/components/prediction/ScoreInput.test.tsx
git commit -m "feat(web): decompose +scoreline +2 on the prediction card"
```

---

### Task 8: Frontend — advance-pick chip + decomposed points in the opponents list

**Files:**
- Modify: `apps/web/src/components/prediction/MatchPredictionsList.tsx`
- Modify: `apps/web/src/routes/pools/$poolId/predictions.tsx:31-49,156-168`
- Test: `apps/web/src/components/prediction/MatchPredictionsList.test.tsx` (create)

**Interfaces:**
- Consumes: `MatchPredictor.advancePick` + `advanceBonus` (Task 6), team names/flags passed from the route.
- Produces: `MatchPredictionsList` gains props `stage`, `homeTeam`, `awayTeam`, `homeFlag`, `awayFlag`.

- [ ] **Step 1: Write the failing test**

Create `MatchPredictionsList.test.tsx`:

```tsx
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MatchPredictionsList } from './MatchPredictionsList'

afterEach(cleanup)

const base = {
  matchId: 'm1',
  matchStatus: 'finished' as const,
  isLocked: true,
  totalMembers: 2,
  viewerIncluded: true,
  viewerDidPredict: true,
  nonPredictors: [],
}

it('renders the advance-pick chip with the picked team name on a knockout match', () => {
  render(
    <MatchPredictionsList
      data={{
        ...base,
        predictors: [
          { userId: 'u2', name: 'Alberto', homeScore: 1, awayScore: 1, points: 7, advanceBonus: 2, advancePick: 'home' },
        ],
      }}
      stage="final"
      homeTeam="Brasil"
      awayTeam="Argentina"
      homeFlag={null}
      awayFlag={null}
    />,
  )
  expect(screen.getByText('Brasil')).toBeInTheDocument()
  expect(screen.getByText('+5')).toBeInTheDocument()
  expect(screen.getByText('+2')).toBeInTheDocument()
})

it('renders no chip on a group-stage match', () => {
  render(
    <MatchPredictionsList
      data={{ ...base, predictors: [{ userId: 'u2', name: 'Alberto', homeScore: 2, awayScore: 1, points: 5, advancePick: 'home' }] }}
      stage="group"
      homeTeam="Brasil"
      awayTeam="Argentina"
      homeFlag={null}
      awayFlag={null}
    />,
  )
  expect(screen.queryByText('Brasil')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @m5nita/web exec vitest run src/components/prediction/MatchPredictionsList.test.tsx`
Expected: FAIL — props/chip absent.

- [ ] **Step 3: Implement**

Add to `MatchPredictionsListProps`: `stage: string`, `homeTeam: string`, `awayTeam: string`, `homeFlag: string | null`, `awayFlag: string | null`. Add the helpers and chip:

```tsx
const NON_KNOCKOUT_STAGES = new Set(['group', 'league'])

function AdvancePickChip({
  pick,
  homeTeam,
  awayTeam,
  homeFlag,
  awayFlag,
}: {
  pick: 'home' | 'away' | null | undefined
  homeTeam: string
  awayTeam: string
  homeFlag: string | null
  awayFlag: string | null
}) {
  if (pick !== 'home' && pick !== 'away') return null
  const team = pick === 'home' ? homeTeam : awayTeam
  const flag = pick === 'home' ? homeFlag : awayFlag
  return (
    <span
      className="flex shrink-0 items-center gap-1 border border-border/60 px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-gray-dark"
      title={`Classifica: ${team}`}
    >
      {flag && <img src={flag} alt="" className="h-3 w-3 rounded-full object-cover" />}
      <span className="max-w-[72px] truncate">{team}</span>
    </span>
  )
}

function PointsLabel({ total, advanceBonus, className, pulse }: { total: number; advanceBonus: number | undefined; className: string; pulse: boolean }) {
  if ((advanceBonus ?? 0) > 0) {
    return (
      <span className={`flex items-center gap-1 ${className}`}>
        {pulse && <span className="h-1 w-1 animate-pulse rounded-full bg-red" aria-hidden="true" />}
        <span>+{total - (advanceBonus as number)}</span>
        <span>+{advanceBonus}</span>
      </span>
    )
  }
  return null // fall back to existing single-value rendering
}
```

Thread `stage`, team names and flags into `PredictorRow`, render `<AdvancePickChip>` (only when `!NON_KNOCKOUT_STAGES.has(stage)`) between the scoreline and the points, and use `PointsLabel` when `advanceBonus > 0` (otherwise keep the current `formatPoints` single-value span). Keep the row `aria-label` accurate (append the picked team when present).

- [ ] **Step 4: Pass team data from the route**

In `predictions.tsx`, give `MatchPredictionsAccordion` the match identity and forward it:

```tsx
function MatchPredictionsAccordion({
  poolId,
  matchId,
  isLive,
  stage,
  homeTeam,
  awayTeam,
  homeFlag,
  awayFlag,
}: {
  poolId: string
  matchId: string
  isLive: boolean
  stage: string
  homeTeam: string
  awayTeam: string
  homeFlag: string | null
  awayFlag: string | null
}) {
  /* …existing query… */
  return (
    <MatchPredictionsList
      data={data}
      stage={stage}
      homeTeam={homeTeam}
      awayTeam={awayTeam}
      homeFlag={homeFlag}
      awayFlag={awayFlag}
    />
  )
}
```

And in `renderExpandedContent`:

```tsx
  const renderExpandedContent = useCallback(
    (matchId: string) => {
      const match = matches.find((x) => x.id === matchId)
      return (
        <MatchPredictionsAccordion
          poolId={poolId}
          matchId={matchId}
          isLive={match?.status === 'live'}
          stage={match?.stage ?? 'group'}
          homeTeam={match?.homeTeam ?? ''}
          awayTeam={match?.awayTeam ?? ''}
          homeFlag={match?.homeFlag ?? null}
          awayFlag={match?.awayFlag ?? null}
        />
      )
    },
    [poolId, matches],
  )
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm --filter @m5nita/web exec vitest run src/components/prediction/MatchPredictionsList.test.tsx`
Expected: PASS.

- [ ] **Step 6: Full check + commit**

```bash
pnpm biome check --write apps/web/src/components/prediction/MatchPredictionsList.tsx apps/web/src/routes/pools/\$poolId/predictions.tsx
pnpm --filter @m5nita/api exec vitest run && pnpm --filter @m5nita/web exec vitest run
git add apps/web/src/components/prediction/MatchPredictionsList.tsx apps/web/src/components/prediction/MatchPredictionsList.test.tsx apps/web/src/routes/pools/\$poolId/predictions.tsx
git commit -m "feat(web): opponent advance-pick chip + decomposed points"
```

---

## Self-Review

**Spec coverage:**
- FR-001/002/003 (provisional leader, +2, exclusions) → Task 2 (`liveAdvancingSide`) + Task 3 (`computeLivePoints`).
- FR-004 (settlement unchanged) → Task 1 keeps `knockoutContextFor` behavior; Task 5/6 keep storedPoints path.
- FR-005 (live ranking) → Task 4.
- FR-006/007 (decomposed display, total preserved) → Task 7 (card) + Task 8 (list); total still flows as `points`.
- FR-008 (advancePick + advanceBonus in opponents payload, range too) → Task 6.
- FR-009 (chip, knockout only, none for no-pick / non-knockout) → Task 8.
- FR-010 (rule in domain, reuse AdvanceBonus) → Task 2 reuses `AdvanceBonus`; guardrails checked in Task 4/8.

**Placeholder scan:** Task 6 Step 2 and Task 8 intentionally defer to the sibling test file's existing arrangement helpers (those builders already exist); all code steps include concrete code. No TBD/TODO.

**Type consistency:** `KnockoutContext.pastRegularTime` (Task 1) is used by `liveKnockoutContextFor` (Task 2) and `provisionalKnockoutContext` (Task 4). `LiveBreakdown` gains `advanceBonus` (Task 3) consumed by Tasks 5/6. `MatchPredictor.advancePick` (Task 6) consumed by Task 8. Names align across tasks.

## Out of Scope (per spec)
- No schema/grading/provider changes; no backfill; no live +2 during penalty shootouts.
