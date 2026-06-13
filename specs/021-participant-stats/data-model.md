# Phase 1 Data Model: Per-Participant Pool Statistics

Two new additive tables, one new accepted value for an existing text column, and the domain model in `apps/api/src/domain/stats/`. No prize/fee schema is touched.

---

## 1. Persistence (Drizzle schema)

### 1.1 `stats_unlock` (entitlement) — NEW

`apps/api/src/db/schema/statsUnlock.ts`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `defaultRandom()` |
| `user_id` | `text` NOT NULL | FK → `user.id` |
| `pool_id` | `uuid` NOT NULL | FK → `pool.id` |
| `payment_id` | `uuid` NOT NULL | FK → `payment.id` (the completed unlock payment) |
| `unlocked_at` | `timestamptz` NOT NULL | default `now()` |

Indexes / constraints:
- `unique (user_id, pool_id)` — the idempotent gate (one entitlement per participant per pool).

Validation rules:
- Granted only on a completed `payment` of `type='stats_unlock'`.
- Insert uses `ON CONFLICT (user_id, pool_id) DO NOTHING` (FR-007, SC-002).

### 1.2 `participant_pool_stats` (per-user snapshot) — NEW

`apps/api/src/db/schema/participantPoolStats.ts`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `defaultRandom()` |
| `pool_id` | `uuid` NOT NULL | FK → `pool.id` |
| `user_id` | `text` NOT NULL | FK → `user.id` |
| `finished_count` | `integer` NOT NULL default 0 | user's predictions on finished matches |
| `exact_count` | `integer` NOT NULL default 0 | literal exact-score hits |
| `result_count` | `integer` NOT NULL default 0 | literal outcome (W/D/L) hits |
| `points_total` | `integer` NOT NULL default 0 | `sum(prediction.points)` over finished |
| `home_correct` | `integer` NOT NULL default 0 | home-win outcomes correctly predicted |
| `home_total` | `integer` NOT NULL default 0 | finished matches that ended in a home win |
| `away_correct` | `integer` NOT NULL default 0 | away-win outcomes correctly predicted |
| `away_total` | `integer` NOT NULL default 0 | finished matches that ended in an away win |
| `low_goals_correct` | `integer` NOT NULL default 0 | result hits where total goals ≤ band threshold |
| `low_goals_total` | `integer` NOT NULL default 0 | finished low-scoring matches |
| `high_goals_correct` | `integer` NOT NULL default 0 | result hits where total goals > band threshold |
| `high_goals_total` | `integer` NOT NULL default 0 | finished high-scoring matches |
| `last_position` | `integer` NULL | most recent ranking position |
| `prev_position` | `integer` NULL | position before the last recompute (trend, D7) |
| `updated_at` | `timestamptz` NOT NULL | default `now()` |

Indexes / constraints:
- `unique (pool_id, user_id)` — one snapshot row per participant per pool (upsert target).

Notes:
- **Raw counts only** — no ratios, no `points_max_total` (the domain derives `points_max = finished_count × scoringPolicy.maxPoints()`, D2/D3).
- Goal-band threshold is a single named constant (e.g. total goals ≤ 2 = "low"); recorded in shared constants, not magic-numbered in SQL.
- Recomputed at match-finish **only for users with a `stats_unlock`** row (bounded set), and once at grant time to bootstrap.

### 1.3 `payment.type` — extend accepted values (no DDL)

`payment.type` is `text` (`db/schema/payment.ts:21`). Add `'stats_unlock'` to `PAYMENT.TYPES` in `packages/shared/src/constants/index.ts` (currently `['entry','refund','prize']`). No enum migration. A `stats_unlock` payment carries `platformFee = amount` (descriptive; not read by prize).

### 1.4 Indexes relied upon (no new index unless measured)

- `prediction(pool_id, user_id)` — `prediction.ts:33` (per-user aggregation).
- `prediction(pool_id, match_id)` — `prediction.ts:34` (pending-match lookup).
- `match(status)` — `match.ts:29` (finished/pending filtering).

Ops validates `EXPLAIN` shows index usage and no new full scan; adds an index only if a measurement requires it.

---

## 2. Domain model (`apps/api/src/domain/stats/`)

### 2.1 `StatsUnlockPrice` (value object)

- Wraps `Money` (centavos). Default `199` (from `STATS.UNLOCK_PRICE_CENTAVOS_DEFAULT` in shared constants); the env override is read at the composition root (`container.ts`), never inside the domain.
- API: `StatsUnlockPrice.of(centavos: number)`, `.centavos`, `.formatted()` (delegates to the shared currency formatter shape so the API returns a ready-to-display string).
- **Does not** import or delegate to `FeePolicy`/`PrizeCalculation`.

### 2.2 Raw repository row shapes (returned by infra, consumed by domain)

```text
ParticipantStatsRow {            // one row, the viewer
  finishedCount, exactCount, resultCount, pointsTotal,
  homeCorrect, homeTotal, awayCorrect, awayTotal,
  lowGoalsCorrect, lowGoalsTotal, highGoalsCorrect, highGoalsTotal,
  position, prevPosition
}

PoolStatsAggregateRow {          // per member, grouped — used to derive avg + leader
  userId, finishedCount, exactCount, resultCount, pointsTotal
}

RoundPointsRow { matchday, points }          // viewer's points per finished round (Block B)

PendingMatchRow {                            // ALL the pool's not-started in-scope matches (predicted or not)
  matchId, homeTeam, awayTeam, matchDate, hasPrediction   // hasPrediction is per-viewer (LEFT JOIN of the user's prediction)
}
```

### 2.3 `StatsComparisonPolicy` (policy)

- Pure functions over raw rows. Produces, **anonymized**:
  - exact% and result% for the viewer, the **pool average**, and the **leader** (leader = rank-1 from the aggregate rows, sorted points desc then exact desc, reusing the ranking tiebreak intent).
  - efficiency = `pointsTotal ÷ (finishedCount × maxPoints)`; deltas vs average/leader.
- Never receives or emits an individual third party's prediction — only aggregates (FR-023).

### 2.4 `PendingMatchImpactPolicy` (policy)

- Input: viewer's `PendingMatchRow[]` (**all** the pool's not-started in-scope matches, predicted or not), the pool aggregate (standings/points), viewer's current position, and `maxPoints`.
- Output: those matches ranked by `impact = maxPoints × reachableRivalDensity`, each with kickoff deadline, `hasPrediction` flag, and a derived `action` (`submit` when `!hasPrediction`, else `change`) for prioritized reminders. Already-predicted matches are included so the user can swap a high-impact palpite before kickoff (FR-016/019).
- Complexity `O(upcoming + members)`. No outcome-combination simulation (FR-016/017). Reads no third-party prediction — only whether the **viewer** has one (FR-021/022).

### 2.5 `ParticipantPoolStats` (aggregate root of the read model)

- `ParticipantPoolStats.build({ viewer: ParticipantStatsRow, aggregate, rounds, pending, scoringPolicy })` → the four blocks:
  - **A. Hit rate vs average** — exact% / result% for viewer, average, leader (via `StatsComparisonPolicy`).
  - **B. Ranking evolution** — points-per-round series, current position, gap to leader, trend (`position` vs `prevPosition`).
  - **C. Strengths & weaknesses** — home/away accuracy and low/high goal-band accuracy ratios; "own pattern" suggestions derived from the same per-user dimension counts (FR-020).
  - **D. Points left on the table** — `pointsMax − pointsTotal` where `pointsMax = finishedCount × scoringPolicy.maxPoints()`, efficiency, and efficiency comparison to rivals (from aggregate totals).
- Plus the impact ranking from `PendingMatchImpactPolicy`.
- Does not touch the DB and does not re-score (FR-014).
- Degrades to explicit "not enough data" states when `finishedCount` (or matching dimension total) is 0 (SC-008).

### 2.6 Ports (interfaces; Drizzle impls in `infrastructure/persistence/`)

`StatsRepository.port.ts`:
```text
participantRow(poolId, userId): Promise<ParticipantStatsRow>      // raw, for read path (snapshot or live agg)
poolAggregate(poolId): Promise<PoolStatsAggregateRow[]>           // per-member, for averages + leader
roundPoints(poolId, userId): Promise<RoundPointsRow[]>            // Block B series
pendingMatches(poolId, userId): Promise<PendingMatchRow[]>        // ALL not-started in-scope matches + whether THIS user predicted (LEFT JOIN); never reads others' predictions
recomputeSnapshot(poolId, userId): Promise<void>                 // upsert participant_pool_stats
```

`StatsUnlockRepository.port.ts`:
```text
isUnlocked(userId, poolId): Promise<boolean>
grant(userId, poolId, paymentId): Promise<void>                  // ON CONFLICT DO NOTHING
listUnlockedUsers(poolId): Promise<string[]>                     // bounded set for match-finish recompute
```

### 2.7 Scoring change (`domain/scoring/`)

- Add `maxPoints(): number` to `ScoringPolicy` (`ScoringPolicy.ts:11`).
- `RangeScoringPolicy.maxPoints()` → `SCORING.EXACT_MATCH` (10).
- `SingleMatchScoringPolicy.maxPoints()` → `SCORING.EXACT_MATCH + BONUS_CAP` (14).

---

## 3. State & lifecycle

```text
member (no entitlement) ──POST /stats/unlock──▶ pending payment ──(Pix paid)──▶ webhook/CAS completes
        │                                                                              │
        │ GET /stats → { unlocked:false, teaser, price }                               ▼
        │                                                          handleCheckoutCompleted dispatch
        │                                                          type==='stats_unlock':
        │                                                            stats_unlock INSERT … ON CONFLICT DO NOTHING
        │                                                            + recomputeSnapshot(pool,user)   ← bootstrap
        ▼                                                                              │
member (entitled) ◀───────────────────────────────────────────────────────────────────┘
        │ GET /stats → full panel (snapshot + cached aggregate + read-time impact)

match finishes → jobs/calcPoints.ts:
        recomputeStandings(pool) + invalidateRankingAggregate(pool)        [existing]
        for u in listUnlockedUsers(pool): recomputeSnapshot(pool, u)       [new]
        invalidateParticipantStatsAggregate(pool)                          [new]
```

Invariants:
- Entitlement is permanent; **view** still requires current `poolMember` membership.
- Granting never writes `poolMember`, never activates a pool, never alters prize/fee (FR-008/009; proof in research D8).
- Snapshot rows exist only for unlocked users.
