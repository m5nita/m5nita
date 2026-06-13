# Phase 0 Research: Per-Participant Pool Statistics

All decisions below are grounded in the current codebase (file:line). The spec marked product decisions as validated; this document resolves the **technical** unknowns.

---

## D1 — Where the statistics math lives

**Decision**: All derivation (%, deltas vs average/leader, trend, efficiency, points-left-on-table, pending-match impact) lives in `apps/api/src/domain/stats/`. Infrastructure repositories return **raw aggregated rows** (sums/counts per dimension); the domain turns them into the read model.

**Rationale**: This is the exact split already used by ranking — `infrastructure/persistence/DrizzleRankingRepository.ts:51` aggregates `sum(prediction.points)` + exact counts, and `domain/ranking/Ranking.ts:27` positions/tiebreaks. Mirroring it keeps stats math out of `services/`/`infrastructure/`/`jobs/`/front (constitution V) and satisfies `check:leaks`/`_architecture.test.ts`.

**Alternatives considered**: Computing percentages/deltas in the Drizzle repo or in the route — rejected: leaks domain math into infrastructure (G2/G3 failure) and makes the logic untestable without a DB.

---

## D2 — Reuse scoring; never re-derive points

**Decision**: Stats aggregate the already-persisted `prediction.points` (`db/schema/prediction.ts:23`). For "points left on the table" the per-match maximum (10 range / 14 single-match) is obtained from a **new `ScoringPolicy.maxPoints()`** method, selected via `pool.scoringPolicy()` (`domain/pool/Pool.ts:95`).

**Rationale**: `prediction.points` is computed once by `jobs/calcPoints.ts` using `ScoringPolicy`/`Score`/`SingleMatchScore`. Re-deriving would duplicate scoring (Rule of Three / SRP violation) and risk drift. The 10/14 maxima already exist as `SCORING.EXACT_MATCH` (`packages/shared/src/constants/index.ts:2`) and `BONUS_CAP = 4` (`domain/scoring/SingleMatchScore.ts:3`). Exposing `maxPoints()` puts the constant behind the policy so stats never hardcode `10`/`14` (which `check:leaks` would flag) and never branch on `scope.kind`.

**Change required**: add `maxPoints(): number` to the `ScoringPolicy` interface (`domain/scoring/ScoringPolicy.ts:11`); `RangeScoringPolicy.maxPoints()` → `SCORING.EXACT_MATCH` (10); `SingleMatchScoringPolicy.maxPoints()` → `SCORING.EXACT_MATCH + BONUS_CAP` (14). Pure, TDD-covered.

**Alternatives considered**: Hardcoding 10/14 in the stats SQL — rejected (G2 leak + drift). Reading max from a config — rejected (scoring already owns the rule).

---

## D3 — What the snapshot/aggregate must store (poolStanding is insufficient)

**Decision**: Introduce `participant_pool_stats` (per-user snapshot) because `poolStanding` only carries `pointsTotal` + `exactMatches` (`db/schema/poolStanding.ts:23-24`) — it has **no** result-hit count and **no** per-dimension (home/away, goal-band) counts that Blocks A/C require.

Snapshot columns (raw counts only; domain derives ratios):
`finished_count`, `exact_count`, `result_count`, `points_total`, `home_correct`, `home_total`, `away_correct`, `away_total`, `low_goals_correct`, `low_goals_total`, `high_goals_correct`, `high_goals_total`, plus `last_position`, `prev_position` (for the trend), `updated_at`.

**Rationale**: All are literal SQL aggregations over `prediction ⋈ match WHERE match.status='finished'` — the same class of query as `recomputeStandings` and using the same indexes (`prediction(pool_id,user_id)` at `prediction.ts:33`, `match(status)` at `match.ts:29`). `result_count` is computed by literal outcome comparison (`sign(predHome−predAway) = sign(actualHome−actualAway)`), exactly how `exactMatches` is computed literally today (`DrizzleRankingRepository.ts:52-54`) — no scoring re-derivation. `points_max_total` is intentionally **not** stored; the domain computes it as `finished_count × scoringPolicy.maxPoints()` (see D2).

**Alternatives considered**: Add columns to `poolStanding` — rejected: `poolStanding` is the hot ranking path read by every viewer; widening it risks the ranking budget. A separate, unlocked-only snapshot keeps the hot path untouched.

---

## D4 — Two-level cache, invalidated at the ranking event

**Decision**: Mirror the ranking cache.
1. **Pool aggregate** — new `services/statsCache.ts` exporting a `participantStatsAggregateCache` built with the same `createTtlCache` (TTL `25_000`, single-flight `getOrCompute`) used by `services/rankingCache.ts:21`, keyed by `poolId`, plus `invalidateParticipantStatsAggregate(poolId)`. Holds per-pool dimension averages + leader + finished-match base. Shared across all viewers.
2. **Per-user snapshot** — persisted `participant_pool_stats`, recomputed at match-finish **only for unlocked users**.

Both are refreshed at the existing ranking event in `jobs/calcPoints.ts:48-51`: after `recomputeStandings(poolId)` + `invalidateRankingAggregate(poolId)`, add (a) snapshot recompute for unlocked users in the pool and (b) `invalidateParticipantStatsAggregate(poolId)`.

**Rationale**: Same invalidation point ⇒ stats freshness tracks the leaderboard with zero new event plumbing. The in-process cache collapses focus/refetch bursts; the persisted snapshot survives restart/deploy (the in-process cache does not). The unlocked set is small (paid feature), so the added match-finish work is bounded.

**Single-query optimization**: one grouped aggregation per pool yields every member's per-dimension counts; it serves both (a) the pool aggregate cache value and (b) the upsert of `participant_pool_stats` rows for unlocked users — avoiding two scans. Cost class ≈ existing `recomputeStandings`.

**Alternatives considered**: Recompute on every read — rejected (re-aggregation per request on a 3 vCPU box; explicitly forbidden by FR-024). A cron/interval recompute — rejected (the match-finish event already exists and is precise).

---

## D5 — Keep the stats tab OFF the 30s live-poll path

**Decision**: The web stats query MUST NOT use `livePollMs()` (`apps/web/src/lib/poll.ts:6`, 30–40s). It uses refetch-on-focus + a long interval; during live matches it shows "stats update when matches finish".

**Rationale**: The known prod bottleneck is ranking re-aggregation + the 30s polling storm. Stats is heavy read aggregation; putting it on the hot cycle would compound the storm. The aggregate is only meaningful after a match finishes anyway. Ranking/predictions keep their conditional `refetchInterval: hasLiveMatch ? livePollMs() : false` (`routes/pools/$poolId/ranking.tsx:28`); stats does not adopt it.

---

## D6 — Upcoming-match impact heuristic (bounded, no simulation)

**Decision**: For **all** of the participant's **own not-yet-started** matches in the pool — **whether or not a prediction already exists** — score
`impact = pointsAtStake × reachableRivalDensity`, where `pointsAtStake = scoringPolicy.maxPoints()` and `reachableRivalDensity` = number of rivals within a reachable points band around the participant's current standing position (from the cached aggregate), normalized. Complexity `O(upcoming + members)`. Computed at read time with a short-lived per-user cache. Each entry carries `match.matchDate` (kickoff, `match.ts:23`) as the deadline plus a `hasPrediction` flag, so the reminder's call to action is **submit** (no prediction yet) or **change/review** (a prediction already exists and is still editable until kickoff). Surfaced as reminders ordered by impact.

**Rationale**: The point of the feature is to let the user act before kickoff — including **swapping an existing palpite** on a high-impact game, not only filling gaps — so the impact list must include already-predicted matches. The query is therefore "all in-scope not-started matches for the pool, LEFT JOIN the user's prediction to set `hasPrediction`", not "matches missing a prediction". Cheap, explainable, and never enumerates outcome combinations (FR-017). Uses only data already loaded for the panel (the pool's not-started matches + the user's prediction-existence + the pool aggregate's standings). No third-party prediction is read, so FR-021/022 hold by construction (we only read whether *the viewer* has a prediction).

**Alternatives considered**: Listing only not-yet-predicted matches — **rejected** per this adjustment (it would hide the opportunity to improve an existing high-impact prediction). Monte-Carlo / full combinatorial "what-if" — rejected (cost + complexity; explicitly out of scope). Using pool consensus on the not-started match to weight impact — **prohibited** (herd effect, FR-022).

---

## D7 — Block B (ranking evolution) scope

**Decision**: Deliver (1) points-per-finished-round series (a small grouped query of `prediction.points` by `match.matchday` for the user), (2) current position + gap to leader (reuse `Ranking.build()` output), and (3) a trend (rising/falling/stable) derived from `last_position` vs `prev_position` stored on the snapshot.

**Rationale**: Full position-per-round history requires reconstructing every member's cumulative standings at each past round — heavy and unbounded on the small box. Storing the previous position on the snapshot gives an O(1) trend that satisfies the user-facing need ("am I climbing?") without the cost. Recorded as a deliberate cost trade-off; full per-round position history is deferred.

**Alternatives considered**: Per-round full standings recompute — rejected (cost). No trend at all — rejected (Block B value is the trajectory).

---

## D8 — Entitlement, payment type, and idempotency

**Decision**: New `stats_unlock` table, unique `(user_id, pool_id)`. New `payment.type = 'stats_unlock'` (the column is plain `text` — `db/schema/payment.ts:21` — so only the shared constant `PAYMENT.TYPES` at `constants/index.ts` needs the value added; no enum migration). Completion reuses the idempotent CAS in `services/payment.ts:10` (`UPDATE … WHERE status != 'completed'`). The new branch does `INSERT … ON CONFLICT (user_id,pool_id) DO NOTHING` into `stats_unlock` and triggers the user's snapshot recompute. It **never** writes `poolMember` or activates a pool.

**Rationale**: Double idempotency — the payment CAS guarantees completion runs once; the `stats_unlock` unique + `ON CONFLICT DO NOTHING` guarantees a single entitlement even under retries (FR-007, SC-002). Reusing the existing webhook/CAS means **no gateway or webhook route changes** (`infrastructure/http/routes/webhooks.ts` unchanged except the type-dispatch inside `handleCheckoutCompleted`).

**Money-safety proof (FR-008 / SC-003)**: Prize is computed as `entryFee × memberCount` by `PrizeCalculation.calculatePrizeTotal` (`domain/prize/PrizeCalculation.ts:8`) and `getPoolPrizeTotal` counts `poolMember` rows (`services/ranking.ts`). Since the stats_unlock branch never inserts `poolMember`, and the payment is `type='stats_unlock'` (not `'entry'`), prize and `FeePolicy` are mathematically unaffected — independent of how many unlocks occur.

**Alternatives considered**: Reuse the `payment` table without a `stats_unlock` table — rejected: querying "is unlocked?" would scan payments by type/status; a dedicated unique entitlement row is the clean gate. A new dedicated webhook route — rejected: the existing CAS already gives idempotency.

---

## D9 — Threading `type` through the PaymentGateway port

**Decision**: Extend `CheckoutParams` (`application/ports/PaymentGateway.port.ts:1`) with optional `type?: PaymentType` (default `'entry'`) and `description?: string`. Each adapter uses `params.type ?? 'entry'` when inserting the payment row (today all four hardcode `type:'entry'` — `MercadoPagoPaymentGateway.ts:33`, `InfinitePayPaymentGateway.ts:100`, `StripePaymentGateway.ts:28`, `MockPaymentGateway.ts`). For `stats_unlock`, `platformFee = amount` (100% platform; descriptive only — not read by prize).

**Mock unification**: `MockPaymentGateway` currently inserts `type:'entry'` with `status:'completed'` and then inlines pool activation + `poolMember` insert. It will instead insert the payment as `status:'pending'` with the requested `type`, then call `handleCheckoutCompleted(payment.id)` so completion runs through the single dispatch (entry → member; stats_unlock → grant). This removes duplicated completion logic (constitution SRP / Rule of Three) and ensures the dev/test path exercises the same idempotent branch as real webhooks.

**Rationale**: Minimal, additive port change; preserves all existing entry flows (default keeps `'entry'`). Unifying the mock's completion path prevents the dev bug where a stats unlock would wrongly create a `poolMember`.

**Alternatives considered**: A separate `createStatsCheckout` method on the port — rejected (ISP allows a narrow extension, but a second method duplicates 90% of each adapter; a single param is leaner and LSP-safe).

---

## D10 — Server-side gate and read assembly

**Decision**: `GET /api/pools/:poolId/stats` is handled by `GetParticipantStatsUseCase`:
1. Require authenticated user + **membership** (`poolMember`) → else 403/404.
2. `statsUnlockRepo.isUnlocked(userId, poolId)` → if false, return `{ unlocked:false, teaser, price }` (price from `StatsUnlockPrice`, pre-formatted). No computed statistics in the locked payload.
3. If true, load: pool aggregate (from `statsCache` getOrCompute), the user's `participant_pool_stats` snapshot, and the user's pending matches; build the four blocks via `ParticipantPoolStats` + `StatsComparisonPolicy`, and the impact/suggestions via `PendingMatchImpactPolicy`. Return the full, pre-computed, anonymized payload.

**Grant-time bootstrap**: because a freshly unlocked user has no snapshot yet, `grant()` triggers an initial snapshot recompute for that `(user, pool)` so the first read is populated.

**Rationale**: Gate is entirely server-side (FR-002/003); the front never decides access or computes price (FR-005). Aggregates only ever expose averages + leader figures, never an individual prediction (FR-023).

---

## D11 — Frontend: zero-dependency inline SVG, reuse Pix flow

**Decision**: No chart library (confirmed absent in `apps/web/package.json`). Build a `Sparkline` (Block B trajectory) and `CompareBar` (Blocks A/C/D comparisons) as small inline-SVG components using the existing `@theme` tokens (`--color-green`, `--color-red`, `--color-gray-*` in `styles/app.css`), dark/light aware. The paywall reuses the locked-state pattern from `components/pool/PrizeWithdrawal.tsx` and `formatCurrency` (`lib/utils.ts`). Unlock POSTs to `/stats/unlock`, redirects to `checkoutUrl`, and returns through the existing `routes/pools/payment-success.tsx` polling (`MAX_ATTEMPTS=6`, `POLL_INTERVAL_MS=2000`) back to the stats tab.

**Rationale**: Keeps the PWA bundle within budget (constitution IV; no +KB lib), matches the custom Barlow/Inter design system, and reuses a proven payment-confirmation flow.

**Alternatives considered**: recharts/visx — rejected (bundle cost for a few simple charts; design-system mismatch).

---

## Resolved unknowns summary

| Unknown | Resolution |
|---|---|
| Where stats math lives | `domain/stats/` (D1) |
| Re-derive scoring? | No — aggregate `prediction.points`; `maxPoints()` for maxima (D2) |
| Is `poolStanding` enough? | No — new `participant_pool_stats` snapshot (D3) |
| Cache strategy | Sibling 25s aggregate cache + persisted snapshot, invalidated at `calcPoints.ts:50` (D4) |
| Live polling | Stats tab excluded from `livePollMs()` (D5) |
| Impact heuristic | `O(pending+members)`, no simulation (D6) |
| Block B cost | Points-per-round + O(1) trend; full position history deferred (D7) |
| Entitlement + idempotency | `stats_unlock` table + reuse payment CAS; prize provably untouched (D8) |
| Payment type plumbing | Additive `type` on `CheckoutParams`; unify Mock completion (D9) |
| Gate | Server-side membership+entitlement; grant bootstraps snapshot (D10) |
| Charts | Zero-dep inline SVG; reuse Pix `payment-success` flow (D11) |
