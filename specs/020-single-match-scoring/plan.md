# Single-Match Scoring (Proximity Bonus) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 10/7/5/0 scoring with a finer-grained `category + proximity bonus` formula (total 0–14) in single-match pools only, to reduce ties.

**Architecture:** Add a new pure domain class `SingleMatchScore` parallel to the existing `Score`, kept unchanged for multi-match pools. Branch by `pool.matchId` at the application boundaries (job, use cases, ranking service). API responses for single-match pools surface the decomposition (`category`, `bonus`, `total`) so the UI can render `10 + 4 = 14`. No schema changes — the existing `prediction.points` column stores 0–14 for single-match pools and 0–10 for range pools.

**Tech Stack:** TypeScript 5.x, Node.js ≥ 22, Vitest, Hono, Drizzle ORM, React 19, Tailwind v4. No new runtime dependencies.

---

## File Structure

**Create:**
- `apps/api/src/domain/scoring/SingleMatchScore.ts` — pure domain class with `calculate()`
- `apps/api/src/domain/scoring/SingleMatchScore.test.ts` — covers all spec worked examples

**Modify:**
- `apps/api/src/jobs/calcPoints.ts` — branch formula by pool scope; load pool info for each prediction
- `apps/api/src/application/prediction/computeLivePoints.ts` — accept `isSingleMatchPool` flag
- `apps/api/src/application/prediction/computeLivePoints.test.ts` — add single-match cases
- `apps/api/src/application/prediction/GetMatchPredictionsUseCase.ts` — pass scope flag + return category/bonus decomposition
- `apps/api/src/application/prediction/GetMatchPredictionsUseCase.test.ts` — assert decomposition for single-match
- `apps/api/src/application/prediction/GetUserPredictionsUseCase.ts` — pass scope flag + return decomposition
- `apps/api/src/services/ranking.ts` — single-match pools use `SingleMatchScore` for live points
- `packages/shared/src/types/index.ts` — extend `MatchPredictor` and `Prediction` with optional `category`/`bonus`
- `apps/web/src/components/prediction/MatchPredictionsList.tsx` — render decomposition when present
- `apps/web/src/routes/pools/$poolId/predictions.tsx` — pass `category`/`bonus` from prediction data; show tooltip in single-match pools

---

## Task 1: Domain class — `SingleMatchScore`

**Files:**
- Create: `apps/api/src/domain/scoring/SingleMatchScore.ts`
- Test: `apps/api/src/domain/scoring/SingleMatchScore.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/domain/scoring/SingleMatchScore.test.ts
import { describe, expect, it } from 'vitest'
import { SingleMatchScore } from './SingleMatchScore'

describe('SingleMatchScore', () => {
  describe('category points (unchanged from Score)', () => {
    it('awards 10 + 4 bonus for exact match (total 14)', () => {
      const s = SingleMatchScore.calculate(2, 1, 2, 1)
      expect(s.category).toBe(10)
      expect(s.bonus).toBe(4)
      expect(s.total).toBe(14)
      expect(s.distance).toBe(0)
    })

    it('awards 7 + bonus for correct winner and goal difference', () => {
      // real 2x1, pred 3x2 → diff correct, dist=2
      const s = SingleMatchScore.calculate(3, 2, 2, 1)
      expect(s.category).toBe(7)
      expect(s.distance).toBe(2)
      expect(s.bonus).toBe(2)
      expect(s.total).toBe(9)
    })

    it('awards 5 + bonus for correct winner only', () => {
      // real 2x1, pred 3x1 → winner correct, dist=1
      const s = SingleMatchScore.calculate(3, 1, 2, 1)
      expect(s.category).toBe(5)
      expect(s.distance).toBe(1)
      expect(s.bonus).toBe(3)
      expect(s.total).toBe(8)
    })

    it('awards 5 + bonus for draw without exact score', () => {
      // real 0x0, pred 1x1 → draw correct, dist=2
      const s = SingleMatchScore.calculate(1, 1, 0, 0)
      expect(s.category).toBe(5)
      expect(s.distance).toBe(2)
      expect(s.bonus).toBe(2)
      expect(s.total).toBe(7)
    })

    it('caps bonus at 4 for very small distances on correct outcome', () => {
      // real 3x0, pred 3x0 → exact (handled above); test 4x0 (winner only, dist=1)
      const s = SingleMatchScore.calculate(4, 0, 3, 0)
      expect(s.category).toBe(5)
      expect(s.distance).toBe(1)
      expect(s.bonus).toBe(3)
      expect(s.total).toBe(8)
    })
  })

  describe('distance — signed-sum on winner inversion', () => {
    it('predicts away wins when real is home wins: sums the away column', () => {
      // real 2x1 (home wins), pred 1x2 (away wins, inverted)
      // home: |2-1|=1, away: 1+2=3, total=4 → bonus 0
      const s = SingleMatchScore.calculate(1, 2, 2, 1)
      expect(s.category).toBe(0)
      expect(s.distance).toBe(4)
      expect(s.bonus).toBe(0)
      expect(s.total).toBe(0)
    })

    it('predicts home wins when real is away wins: sums the home column', () => {
      // real 1x2 (away wins), pred 2x1 (home wins, inverted)
      // home: 1+2=3, away: |2-1|=1, total=4 → bonus 0
      const s = SingleMatchScore.calculate(2, 1, 1, 2)
      expect(s.category).toBe(0)
      expect(s.distance).toBe(4)
      expect(s.bonus).toBe(0)
      expect(s.total).toBe(0)
    })

    it('inversion always zeros bonus (gap of 5 between categories preserved)', () => {
      // real 2x1, pred 0x1 (away wins, inverted)
      // home: |2-0|=2, away: 1+1=2, total=4 → bonus 0
      const s = SingleMatchScore.calculate(0, 1, 2, 1)
      expect(s.total).toBe(0)
    })

    it('high-scoring inversion has large distance', () => {
      // real 5x3, pred 3x5 (inverted)
      // home: |5-3|=2, away: 3+5=8, total=10
      const s = SingleMatchScore.calculate(3, 5, 5, 3)
      expect(s.distance).toBe(10)
      expect(s.total).toBe(0)
    })
  })

  describe('wrong-winner without inversion (predicted draw, real winner)', () => {
    it('predicted draw, real home wins: uses absolute distance', () => {
      // real 2x1, pred 1x1 → draw vs home win, no inversion
      // dist = |2-1| + |1-1| = 1
      const s = SingleMatchScore.calculate(1, 1, 2, 1)
      expect(s.category).toBe(0)
      expect(s.distance).toBe(1)
      expect(s.bonus).toBe(3)
      expect(s.total).toBe(3)
    })

    it('predicted home wins, real draw: uses absolute distance', () => {
      // real 0x0, pred 1x0 → home win vs draw, no inversion (real has no winner to invert)
      // dist = |0-1| + |0-0| = 1
      const s = SingleMatchScore.calculate(1, 0, 0, 0)
      expect(s.category).toBe(0)
      expect(s.distance).toBe(1)
      expect(s.bonus).toBe(3)
      expect(s.total).toBe(3)
    })
  })

  describe('hierarchy guarantee', () => {
    it('any wrong-winner total is strictly less than any correct-winner total', () => {
      // real 2x1
      const worstCorrectWinner = SingleMatchScore.calculate(9, 0, 2, 1) // winner only, dist=8 → 5+0=5
      const bestWrongWinner = SingleMatchScore.calculate(1, 1, 2, 1) // draw close, dist=1 → 0+3=3
      expect(bestWrongWinner.total).toBeLessThan(worstCorrectWinner.total)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @m5nita/api test src/domain/scoring/SingleMatchScore.test.ts
```

Expected: FAIL — `Cannot find module './SingleMatchScore'`.

- [ ] **Step 3: Implement `SingleMatchScore`**

```ts
// apps/api/src/domain/scoring/SingleMatchScore.ts
import { SCORING } from '@m5nita/shared'

const BONUS_CAP = 4

export type SingleMatchScoreBreakdown = {
  category: number
  bonus: number
  distance: number
  total: number
}

export class SingleMatchScore {
  static calculate(
    predictedHome: number,
    predictedAway: number,
    actualHome: number,
    actualAway: number,
  ): SingleMatchScoreBreakdown {
    const category = categoryPoints(predictedHome, predictedAway, actualHome, actualAway)
    const distance = computeDistance(predictedHome, predictedAway, actualHome, actualAway)
    const bonus = Math.max(0, BONUS_CAP - distance)
    return { category, bonus, distance, total: category + bonus }
  }
}

function categoryPoints(pH: number, pA: number, rH: number, rA: number): number {
  if (pH === rH && pA === rA) return SCORING.EXACT_MATCH
  const pDiff = pH - pA
  const rDiff = rH - rA
  if (pDiff === rDiff && pDiff !== 0) return SCORING.WINNER_AND_DIFF
  if (Math.sign(pDiff) === Math.sign(rDiff)) return SCORING.OUTCOME_CORRECT
  return SCORING.MISS
}

function computeDistance(pH: number, pA: number, rH: number, rA: number): number {
  const pSign = Math.sign(pH - pA)
  const rSign = Math.sign(rH - rA)
  const inverted = pSign !== 0 && rSign !== 0 && pSign !== rSign
  if (!inverted) return Math.abs(pH - rH) + Math.abs(pA - rA)
  // Winner inverted: sum the column where the loser became the winner.
  // If real says away lost (rA < rH) but pred says away wins (pA > pH), sum the away column.
  if (rSign > 0) return Math.abs(pH - rH) + (pA + rA) // real home wins, pred away wins
  return (pH + rH) + Math.abs(pA - rA) // real away wins, pred home wins
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @m5nita/api test src/domain/scoring/SingleMatchScore.test.ts
```

Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domain/scoring/SingleMatchScore.ts apps/api/src/domain/scoring/SingleMatchScore.test.ts
git commit -m "feat(020): add SingleMatchScore domain with proximity bonus"
```

---

## Task 2: Shared types — surface decomposition in API contract

**Files:**
- Modify: `packages/shared/src/types/index.ts:128-148`

- [ ] **Step 1: Add optional `category` and `bonus` fields**

In `packages/shared/src/types/index.ts`, locate the `Prediction` interface (around line 128) and the `MatchPredictor` interface (around line 137). Add two optional fields to both:

```ts
export interface Prediction {
  id: string
  matchId: string
  homeScore: number
  awayScore: number
  points: number | null
  /** Single-match pools only: the category portion of `points` (0/5/7/10). */
  category?: number | null
  /** Single-match pools only: the proximity bonus portion of `points` (0-4). */
  bonus?: number | null
  match?: Match
}

export interface MatchPredictor {
  userId: string
  name: string | null
  homeScore: number
  awayScore: number
  points: number | null
  /** Single-match pools only: the category portion (0/5/7/10). */
  category?: number | null
  /** Single-match pools only: the proximity bonus portion (0-4). */
  bonus?: number | null
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS — no type errors. Optional fields are backwards-compatible with existing callers.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/index.ts
git commit -m "feat(020): add category/bonus to Prediction and MatchPredictor"
```

---

## Task 3: `computeLivePoints` accepts pool scope

**Files:**
- Modify: `apps/api/src/application/prediction/computeLivePoints.ts`
- Modify: `apps/api/src/application/prediction/computeLivePoints.test.ts`

- [ ] **Step 1: Write failing test for single-match branch**

Append to `apps/api/src/application/prediction/computeLivePoints.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { computeLivePoints } from './computeLivePoints'

describe('computeLivePoints — single-match pool', () => {
  it('returns category + bonus for live single-match pool', () => {
    // real 2x1, pred 3x2 → category 7, dist 2, bonus 2 → total 9
    const result = computeLivePoints(
      { homeScore: 3, awayScore: 2 },
      { status: 'live', homeScore: 2, awayScore: 1 },
      null,
      { isSingleMatchPool: true },
    )
    expect(result).toEqual({ total: 9, category: 7, bonus: 2 })
  })

  it('returns plain number for multi-match pool (default behavior)', () => {
    const result = computeLivePoints(
      { homeScore: 3, awayScore: 2 },
      { status: 'live', homeScore: 2, awayScore: 1 },
      null,
      { isSingleMatchPool: false },
    )
    expect(result).toBe(7) // unchanged Score formula: winner+diff
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @m5nita/api test src/application/prediction/computeLivePoints.test.ts
```

Expected: FAIL — fourth argument doesn't exist; return type mismatch.

- [ ] **Step 3: Update `computeLivePoints` to branch by scope**

Replace `apps/api/src/application/prediction/computeLivePoints.ts` with:

```ts
import { Score } from '../../domain/scoring/Score'
import { SingleMatchScore } from '../../domain/scoring/SingleMatchScore'

type PredictionScores = { homeScore: number; awayScore: number }
type MatchState = { status: string; homeScore: number | null; awayScore: number | null }
type Options = { isSingleMatchPool: boolean }

export type LivePoints =
  | number
  | null
  | { total: number; category: number; bonus: number }

export function computeLivePoints(
  prediction: PredictionScores,
  match: MatchState,
  storedPoints: number | null,
  options: Options = { isSingleMatchPool: false },
): LivePoints {
  if (match.status !== 'live') return storedPoints
  if (match.homeScore === null || match.awayScore === null) return null

  if (options.isSingleMatchPool) {
    const s = SingleMatchScore.calculate(
      prediction.homeScore,
      prediction.awayScore,
      match.homeScore,
      match.awayScore,
    )
    return { total: s.total, category: s.category, bonus: s.bonus }
  }

  return Score.calculate(
    prediction.homeScore,
    prediction.awayScore,
    match.homeScore,
    match.awayScore,
  ).points
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @m5nita/api test src/application/prediction/computeLivePoints.test.ts
```

Expected: PASS — both new tests and existing tests green. (Existing callers use the default `options` so behavior is unchanged.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/application/prediction/computeLivePoints.ts apps/api/src/application/prediction/computeLivePoints.test.ts
git commit -m "feat(020): computeLivePoints branches on pool scope"
```

---

## Task 4: `GetMatchPredictionsUseCase` returns decomposition for single-match pools

**Files:**
- Modify: `apps/api/src/application/prediction/GetMatchPredictionsUseCase.ts`
- Modify: `apps/api/src/application/prediction/GetMatchPredictionsUseCase.test.ts`

- [ ] **Step 1: Inspect the current use case**

```bash
cat apps/api/src/application/prediction/GetMatchPredictionsUseCase.ts
```

Confirm the use case has access to `poolRepo` (or receives the pool in deps). If not, add it.

- [ ] **Step 2: Write failing test for single-match decomposition**

Append a test in `apps/api/src/application/prediction/GetMatchPredictionsUseCase.test.ts`:

```ts
it('returns category/bonus decomposition for predictors in a single-match pool', async () => {
  // Setup: pool with matchId set, one predictor with stored points
  const poolId = 'pool-single'
  const matchId = 'match-1'
  const poolRepo = {
    findById: async () => ({ id: poolId, matchId, /* ... rest as your fixture */ }),
  } as any
  const predictionRepo = {
    findByPoolMatch: async () => [
      { userId: 'u1', name: 'Alice', homeScore: 3, awayScore: 2, points: 9 },
    ],
  } as any
  const matchRepo = {
    findById: async () => ({ id: matchId, status: 'finished', homeScore: 2, awayScore: 1 }),
  } as any
  const poolMemberRepo = { findByPool: async () => [{ userId: 'u1' }] } as any

  const uc = new GetMatchPredictionsUseCase({ poolRepo, predictionRepo, matchRepo, poolMemberRepo })
  const result = await uc.execute({ poolId, matchId, userId: 'u1' })

  const alice = result.predictors.find((p) => p.userId === 'u1')!
  // real 2x1, pred 3x2 → category 7, bonus 2, total 9
  expect(alice.points).toBe(9)
  expect(alice.category).toBe(7)
  expect(alice.bonus).toBe(2)
})
```

Adjust the fixture to match the use case's actual constructor and repo shapes (read the existing tests for reference).

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @m5nita/api test src/application/prediction/GetMatchPredictionsUseCase.test.ts
```

Expected: FAIL — `category` and `bonus` are undefined.

- [ ] **Step 4: Update use case to compute decomposition**

In `GetMatchPredictionsUseCase.ts`:

1. After fetching the pool, compute `const isSingleMatchPool = pool.matchId !== null`.
2. When building each predictor entry, if `isSingleMatchPool` and the prediction has stored `points`, recompute `category` and `bonus` from `(prediction.homeScore, prediction.awayScore, match.homeScore, match.awayScore)` using `SingleMatchScore.calculate`. Use the existing `points` as `total` (which it already is).
3. When the match is `live`, pass `{ isSingleMatchPool }` to `computeLivePoints` and unpack the breakdown into `points` (total), `category`, `bonus`.
4. For multi-match pools, leave `category` and `bonus` undefined on the response.

Concrete patch (apply where points are assembled):

```ts
import { SingleMatchScore } from '../../domain/scoring/SingleMatchScore'

const isSingleMatchPool = pool.matchId !== null

// finished/stored points branch — derive decomposition
const live = computeLivePoints(
  { homeScore: pred.homeScore, awayScore: pred.awayScore },
  { status: match.status, homeScore: match.homeScore, awayScore: match.awayScore },
  pred.points,
  { isSingleMatchPool },
)

let points: number | null
let category: number | undefined
let bonus: number | undefined

if (typeof live === 'object' && live !== null) {
  points = live.total
  category = live.category
  bonus = live.bonus
} else {
  points = live
  if (
    isSingleMatchPool &&
    points !== null &&
    match.homeScore !== null &&
    match.awayScore !== null
  ) {
    const s = SingleMatchScore.calculate(pred.homeScore, pred.awayScore, match.homeScore, match.awayScore)
    category = s.category
    bonus = s.bonus
  }
}

return { userId: pred.userId, name: pred.name, homeScore: pred.homeScore, awayScore: pred.awayScore, points, category, bonus }
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @m5nita/api test src/application/prediction/GetMatchPredictionsUseCase.test.ts
```

Expected: PASS — new test green, existing tests still green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/application/prediction/GetMatchPredictionsUseCase.ts apps/api/src/application/prediction/GetMatchPredictionsUseCase.test.ts
git commit -m "feat(020): GetMatchPredictionsUseCase returns category/bonus for single-match pools"
```

---

## Task 5: `GetUserPredictionsUseCase` returns decomposition for single-match pools

**Files:**
- Modify: `apps/api/src/application/prediction/GetUserPredictionsUseCase.ts`
- Modify: `apps/api/src/application/prediction/GetUserPredictionsUseCase.test.ts`

- [ ] **Step 1: Write failing test**

Append to `GetUserPredictionsUseCase.test.ts`:

```ts
it('includes category/bonus on each prediction for single-match pools', async () => {
  // Setup: user in a single-match pool, one finished prediction with points
  // ... build minimal fixture mirroring existing tests in this file
  const result = await uc.execute({ userId: 'u1', poolId: 'pool-single' })
  const pred = result[0]
  expect(pred.points).toBe(9)
  expect(pred.category).toBe(7)
  expect(pred.bonus).toBe(2)
})

it('omits category/bonus for range (multi-match) pools', async () => {
  const result = await uc.execute({ userId: 'u1', poolId: 'pool-range' })
  expect(result[0].category).toBeUndefined()
  expect(result[0].bonus).toBeUndefined()
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @m5nita/api test src/application/prediction/GetUserPredictionsUseCase.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Update use case**

Mirror the pattern from Task 4: load the pool, set `isSingleMatchPool = pool.matchId !== null`, pass to `computeLivePoints`, derive `category`/`bonus` from `SingleMatchScore.calculate` for finished/stored cases.

```ts
import { SingleMatchScore } from '../../domain/scoring/SingleMatchScore'

const isSingleMatchPool = pool.matchId !== null

// inside the loop over predictions:
const live = computeLivePoints(
  { homeScore: pred.homeScore, awayScore: pred.awayScore },
  { status: pred.match.status, homeScore: pred.match.homeScore, awayScore: pred.match.awayScore },
  pred.points,
  { isSingleMatchPool },
)

let points: number | null
let category: number | undefined
let bonus: number | undefined

if (typeof live === 'object' && live !== null) {
  points = live.total
  category = live.category
  bonus = live.bonus
} else {
  points = live
  if (
    isSingleMatchPool &&
    points !== null &&
    pred.match.homeScore !== null &&
    pred.match.awayScore !== null
  ) {
    const s = SingleMatchScore.calculate(
      pred.homeScore,
      pred.awayScore,
      pred.match.homeScore,
      pred.match.awayScore,
    )
    category = s.category
    bonus = s.bonus
  }
}

return { ...pred, points, category, bonus }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @m5nita/api test src/application/prediction/GetUserPredictionsUseCase.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/application/prediction/GetUserPredictionsUseCase.ts apps/api/src/application/prediction/GetUserPredictionsUseCase.test.ts
git commit -m "feat(020): GetUserPredictionsUseCase returns category/bonus for single-match pools"
```

---

## Task 6: `calcPointsForMatch` job applies the right formula per pool

**Files:**
- Modify: `apps/api/src/jobs/calcPoints.ts`
- Modify: `apps/api/src/domain/pool/PoolRepository.port.ts` (only if a `findByIds` batch method doesn't exist)

- [ ] **Step 1: Verify available repo methods**

```bash
grep -n "findById\|findByIds" apps/api/src/domain/pool/PoolRepository.port.ts
grep -rn "poolRepo.findById" apps/api/src --include="*.ts" | head
```

If `PoolRepository` already has `findById`, use it. Batch fetching is a nice-to-have; for now per-poolId lookup with a small in-memory cache is fine because a match typically belongs to ≤ a few pools.

- [ ] **Step 2: Write a failing test for single-match calc**

Create `apps/api/src/jobs/calcPoints.test.ts` (or extend if one exists):

```ts
import { describe, expect, it, vi } from 'vitest'
import { calcPointsForMatch } from './calcPoints'

describe('calcPointsForMatch', () => {
  it('stores SingleMatchScore total for predictions in single-match pools', async () => {
    const matchId = 'm1'
    const updates: Array<{ id: string; points: number }> = []

    vi.doMock('../container', () => ({
      getContainer: () => ({
        matchRepo: {
          findById: async () => ({ id: matchId, status: 'finished', homeScore: 2, awayScore: 1 }),
        },
        predictionRepo: {
          findByMatch: async () => [
            { id: 'p1', poolId: 'pool-single', homeScore: 3, awayScore: 2 }, // single-match
            { id: 'p2', poolId: 'pool-range', homeScore: 3, awayScore: 2 }, // range
          ],
          updatePoints: async (id: string, points: number) => {
            updates.push({ id, points })
          },
        },
        poolRepo: {
          findById: async (poolId: string) => ({
            id: poolId,
            matchId: poolId === 'pool-single' ? matchId : null,
          }),
        },
      }),
    }))

    const { calcPointsForMatch: subject } = await import('./calcPoints')
    await subject(matchId)

    // single-match: 7 (winner+diff) + 2 (bonus for dist=2) = 9
    expect(updates).toContainEqual({ id: 'p1', points: 9 })
    // range: legacy Score → 7 (winner+diff)
    expect(updates).toContainEqual({ id: 'p2', points: 7 })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @m5nita/api test src/jobs/calcPoints.test.ts
```

Expected: FAIL — single-match path currently uses `Score` and would store `7`, not `9`.

- [ ] **Step 4: Update the job to branch by pool scope**

Replace `apps/api/src/jobs/calcPoints.ts` with:

```ts
import { getContainer } from '../container'
import { Score } from '../domain/scoring/Score'
import { SingleMatchScore } from '../domain/scoring/SingleMatchScore'

export async function calcPointsForMatch(matchId: string) {
  const { matchRepo, predictionRepo, poolRepo } = getContainer()

  const matchData = await matchRepo.findById(matchId)

  if (!matchData || matchData.status !== 'finished') {
    console.log(`[CalcPoints] Match ${matchId} not finished, skipping`)
    return
  }

  if (matchData.homeScore == null || matchData.awayScore == null) {
    console.log(`[CalcPoints] Match ${matchId} missing scores, skipping`)
    return
  }

  const predictions = await predictionRepo.findByMatch(matchId)

  const poolScopeCache = new Map<string, boolean>() // poolId → isSingleMatch
  async function isSingleMatch(poolId: string): Promise<boolean> {
    const cached = poolScopeCache.get(poolId)
    if (cached !== undefined) return cached
    const pool = await poolRepo.findById(poolId)
    const result = pool?.matchId !== null && pool?.matchId !== undefined
    poolScopeCache.set(poolId, result)
    return result
  }

  for (const pred of predictions) {
    const singleMatch = await isSingleMatch(pred.poolId)
    const points = singleMatch
      ? SingleMatchScore.calculate(
          pred.homeScore,
          pred.awayScore,
          matchData.homeScore,
          matchData.awayScore,
        ).total
      : Score.calculate(
          pred.homeScore,
          pred.awayScore,
          matchData.homeScore,
          matchData.awayScore,
        ).points

    if (pred.id) {
      await predictionRepo.updatePoints(pred.id, points)
    }
  }

  console.log(`[CalcPoints] Processed ${predictions.length} predictions for match ${matchId}`)
}
```

Note: the existing `pred.id!` non-null assertion is replaced with a guarded `if (pred.id)` — addresses the existing biome warning while we're in the file.

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @m5nita/api test src/jobs/calcPoints.test.ts
```

Expected: PASS — both predictions get the correct formula.

- [ ] **Step 6: Run the full API test suite to catch regressions**

```bash
pnpm --filter @m5nita/api test
```

Expected: PASS — all existing tests still green.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/jobs/calcPoints.ts apps/api/src/jobs/calcPoints.test.ts
git commit -m "feat(020): calcPointsForMatch applies SingleMatchScore for single-match pools"
```

---

## Task 7: Ranking service — live points use the right formula

**Files:**
- Modify: `apps/api/src/services/ranking.ts`

- [ ] **Step 1: Inspect the live-points block**

The function `getPoolRanking` iterates `livePreds` and computes live points via `Score.calculate`. For single-match pools, it must use `SingleMatchScore`.

- [ ] **Step 2: Update `ranking.ts`**

At the top, import `SingleMatchScore`:

```ts
import { SingleMatchScore } from '../domain/scoring/SingleMatchScore'
import { pool as poolTable } from '../db/schema/pool'
```

Inside `getPoolRanking`, before the live-points loop, fetch the pool's scope:

```ts
const [poolRow] = await db
  .select({ matchId: poolTable.matchId })
  .from(poolTable)
  .where(eq(poolTable.id, poolId))
const isSingleMatchPool = poolRow?.matchId != null
```

Then update the live-points loop:

```ts
const liveByUser = new Map<string, number>()
for (const row of livePreds) {
  if (row.actualHome === null || row.actualAway === null) continue
  const pts = isSingleMatchPool
    ? SingleMatchScore.calculate(row.predHome, row.predAway, row.actualHome, row.actualAway).total
    : Score.calculate(row.predHome, row.predAway, row.actualHome, row.actualAway).points
  liveByUser.set(row.userId, (liveByUser.get(row.userId) ?? 0) + pts)
}
```

Note on the ranking ORDER BY: the existing tiebreaker `count(case when points = 10 then 1 end)` keys off `10`. In a single-match pool, an exact match stores `14` and no row will ever be `10`, so the tiebreaker count is always 0 for everyone in single-match pools — effectively reducing the order to `totalPoints desc`, which is what we want. No SQL change needed.

- [ ] **Step 3: Run the ranking tests**

```bash
pnpm --filter @m5nita/api test src/infrastructure/http/routes/ranking.test.ts
```

Expected: PASS — no regressions on multi-match ranking.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/ranking.ts
git commit -m "feat(020): ranking live points use SingleMatchScore for single-match pools"
```

---

## Task 8: Frontend — render decomposition in `MatchPredictionsList`

**Files:**
- Modify: `apps/web/src/components/prediction/MatchPredictionsList.tsx`

- [ ] **Step 1: Replace the `formatPoints` helper and `PredictorRow` to show decomposition when present**

Replace the relevant section of `apps/web/src/components/prediction/MatchPredictionsList.tsx`:

```tsx
function formatPoints(predictor: MatchPredictor, matchStatus: MatchStatus) {
  if (predictor.points === null) return null
  const baseClass = matchStatus === 'live' ? 'text-red' : 'text-green'
  const pulse = matchStatus === 'live'

  const hasBreakdown =
    typeof predictor.category === 'number' && typeof predictor.bonus === 'number'

  if (hasBreakdown) {
    return {
      total: predictor.points === 1 ? '+1 pt' : `+${predictor.points} pts`,
      breakdown: `${predictor.category} + ${predictor.bonus}`,
      className: baseClass,
      pulse,
    }
  }

  return {
    total: predictor.points === 1 ? '+1 pt' : `+${predictor.points} pts`,
    breakdown: null,
    className: baseClass,
    pulse,
  }
}
```

Then in `PredictorRow`, render the breakdown line below the total when present:

```tsx
{points && (
  <span
    className={`shrink-0 flex min-w-[48px] flex-col items-end gap-0 font-display text-xs font-black ${points.className}`}
  >
    <span className="flex items-center gap-1">
      {points.pulse && (
        <span className="h-1 w-1 animate-pulse rounded-full bg-red" aria-hidden="true" />
      )}
      {points.total}
    </span>
    {points.breakdown && (
      <span
        className="text-[10px] font-bold text-gray-muted"
        title="Pontos da categoria + bônus por proximidade do placar"
      >
        {points.breakdown}
      </span>
    )}
  </span>
)}
```

- [ ] **Step 2: Update existing test to ensure no regression**

```bash
pnpm --filter @m5nita/web test
```

Expected: PASS. If there is an existing snapshot test for `MatchPredictionsList`, regenerate it after visually inspecting.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/prediction/MatchPredictionsList.tsx
git commit -m "feat(020): show category + bonus decomposition in MatchPredictionsList"
```

---

## Task 9: Frontend — predictions route passes decomposition + tooltip

**Files:**
- Modify: `apps/web/src/routes/pools/$poolId/predictions.tsx:145`

- [ ] **Step 1: Inspect the line where `points` is passed**

```bash
sed -n '140,155p' apps/web/src/routes/pools/$poolId/predictions.tsx
```

Confirm the component that receives `points` and pass `category` and `bonus` alongside it.

- [ ] **Step 2: Pass the new fields**

Wherever the props look like `<ScoreCell points={pred?.points ?? null} />`, change to:

```tsx
<ScoreCell
  points={pred?.points ?? null}
  category={pred?.category ?? null}
  bonus={pred?.bonus ?? null}
/>
```

If `ScoreCell` (or the equivalent component) doesn't accept `category`/`bonus` yet, add them as optional props and render the decomposition (`{category} + {bonus} = {points}`) when both are non-null, with the same tooltip text used in `MatchPredictionsList`.

- [ ] **Step 3: Verify in the browser**

Start the dev server, navigate to a single-match pool that has finished, and confirm:

```bash
pnpm dev
```

- Predictions show `7 + 2 = 9 pts` (or whatever the actual values are) with a tooltip.
- Predictions in a range pool show only `9 pts` with no decomposition.

- [ ] **Step 4: Run web tests**

```bash
pnpm --filter @m5nita/web test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/pools/\$poolId/predictions.tsx
git commit -m "feat(020): show category/bonus decomposition on prediction cards"
```

---

## Task 10: Full verification

- [ ] **Step 1: Run the full test suite**

```bash
pnpm test
```

Expected: PASS (all 328+ API tests, all 45+ web tests).

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Run lint**

```bash
pnpm biome check .
```

Expected: no new warnings introduced by this change. (Pre-existing warnings unrelated to 020 may remain.)

- [ ] **Step 4: Manual smoke test in dev**

```bash
pnpm dev
```

Walk through the user story from the spec:

1. Create a single-match pool with a finished match (or use a fixture).
2. Have 3+ test users submit varied predictions for that one match.
3. Confirm the leaderboard ranks them by total (with bonus), and exact-match tie clearly stands out at 14.
4. Confirm prediction cards show `category + bonus = total` with the tooltip.
5. Confirm a range pool with the same match shows the unchanged 0–10 scoring with no decomposition.

- [ ] **Step 5: Commit any final docs/changelog update if needed and ship**

The spec at `specs/020-single-match-scoring/spec.md` is the source of truth; no further docs needed unless the team has a public changelog.

---

## Self-Review Notes

- **Spec coverage:** Every FR (FR-001 through FR-008) maps to at least one task: FR-001/002/004 → Task 1+6; FR-003 → unchanged code path (Score) verified by existing tests; FR-005 → Task 3; FR-006/007 → existing behavior preserved by Task 7's no-op SQL note; FR-008 → Tasks 8+9.
- **Backwards compatibility:** Task 6 only changes the formula for predictions newly scored after the change. Already-finished single-match pools keep their old `points` values; UI will simply not show a decomposition for them (because `category`/`bonus` aren't recomputed on read for stored finished matches — only when match is currently `live`). If we want retroactive decomposition for already-finished single-match pools too, Tasks 4 and 5 already cover this: they recompute `category`/`bonus` from `SingleMatchScore.calculate` whenever the match is finished and the pool is single-match, regardless of when the points were stored. That said, the stored `points` may still be the old `Score.points` (≤10); the displayed `total` will mismatch `category + bonus`. To avoid surprise, an optional one-time backfill could be added later — out of scope here.
- **No placeholders:** every step has concrete code or commands.
- **Type consistency:** `SingleMatchScore.calculate` returns `{ category, bonus, distance, total }` throughout; `computeLivePoints` returns either `number | null` or `{ total, category, bonus }` — both branches handled by `typeof live === 'object'` discriminator at every caller.
