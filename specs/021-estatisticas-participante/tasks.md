---
description: "Task list for Per-Participant Pool Statistics (021)"
---

# Tasks: Per-Participant Pool Statistics

**Input**: Design documents from `/specs/021-estatisticas-participante/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED — the constitution (Principle II) and plan mandate TDD (domain 100% coverage) and real-DB integration tests for the gate, idempotency and prize-invariance. Domain/unit tests are co-located (`src/**/*.test.ts`); integration tests live in `apps/api/tests/integration/` (spec 016 real-DB harness, excluded from the default `vitest` run).

**Organization**: Tasks are grouped by user story. The two P1 stories together form the demo-able MVP (US1 = unlock + gate; US2 = the panel content). US3/US4 layer onto the same endpoint.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: US1–US4 (matches spec.md user stories). Setup/Foundational/Polish carry no story label.

## Path Conventions (from plan.md)

- API (hexagonal): `apps/api/src/{domain,application,infrastructure,services,jobs,db}/…`, composition root `apps/api/src/container.ts`, app wiring `apps/api/src/app.ts`
- Web (PWA): `apps/web/src/{routes,components,lib}/…`
- Shared: `packages/shared/src/constants/index.ts`
- Unit tests co-located `*.test.ts`; integration tests `apps/api/tests/integration/*.test.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Constants and accepted values that everything else references.

- [x] T001 [P] Extend shared constants in `packages/shared/src/constants/index.ts`: add `'stats_unlock'` to `PAYMENT.TYPES`; add `STATS = { UNLOCK_PRICE_CENTAVOS_DEFAULT: 199, LOW_GOALS_MAX: 2 } as const` (goal-band threshold lives here, never magic-numbered in SQL).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schemas, ports, scoring change, and the price VO that ALL stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 [P] Create Drizzle schema `apps/api/src/db/schema/statsUnlock.ts` — `stats_unlock` (id, user_id→user.id, pool_id→pool.id, payment_id→payment.id, unlocked_at) with `unique(user_id, pool_id)`.
- [x] T003 [P] Create Drizzle schema `apps/api/src/db/schema/participantPoolStats.ts` — `participant_pool_stats` (pool_id, user_id, finished_count, exact_count, result_count, points_total, home_correct/total, away_correct/total, low_goals_correct/total, high_goals_correct/total, last_position, prev_position, updated_at) with `unique(pool_id, user_id)`. Raw counts only (no ratios, no points_max_total).
- [x] T004 Generate + apply migration for T002/T003: `pnpm drizzle-kit generate` then `pnpm drizzle-kit migrate`; confirm the diff is additive only (no change to prize/fee/`payment` column DDL). (depends on T002, T003)
- [x] T005 [P] Define port `apps/api/src/domain/stats/StatsRepository.port.ts` — `participantRow`, `poolAggregate`, `roundPoints`, `pendingMatches`, `recomputeSnapshot` (interfaces + the raw row types `ParticipantStatsRow`, `PoolStatsAggregateRow`, `RoundPointsRow`, `PendingMatchRow` per data-model §2.2).
- [x] T006 [P] Define port `apps/api/src/domain/stats/StatsUnlockRepository.port.ts` — `isUnlocked(userId, poolId)`, `grant(userId, poolId, paymentId)`, `listUnlockedUsers(poolId)`.
- [x] T007 [P] Write failing tests for `ScoringPolicy.maxPoints()` in `apps/api/src/domain/scoring/ScoringPolicy.test.ts` (and assert via Score/SingleMatchScore): Range → 10, SingleMatch → 14.
- [x] T008 Implement `maxPoints(): number` on the `ScoringPolicy` interface + `RangeScoringPolicy` (`SCORING.EXACT_MATCH`) and `SingleMatchScoringPolicy` (`SCORING.EXACT_MATCH + BONUS_CAP`) in `apps/api/src/domain/scoring/ScoringPolicy.ts` / `Score.ts` / `SingleMatchScore.ts`. No hardcoded 10/14 anywhere else. (depends on T007)
- [x] T009 [P] Write failing tests for `StatsUnlockPrice` VO in `apps/api/src/domain/stats/StatsUnlockPrice.test.ts` (default 199, env override, `.centavos`, `.formatted()`; never imports FeePolicy/PrizeCalculation).
- [x] T010 Implement `StatsUnlockPrice` VO in `apps/api/src/domain/stats/StatsUnlockPrice.ts` (wraps `Money`, default from `STATS.UNLOCK_PRICE_CENTAVOS_DEFAULT`). (depends on T009)
- [x] T011 Create empty stats route group `apps/api/src/infrastructure/http/routes/stats.ts` (auth middleware, `:poolId` param) and register it in `apps/api/src/app.ts` under `/api`.

**Checkpoint**: Schemas migrated, ports + scoring max + price VO ready, route mounted. User stories can begin.

---

## Phase 3: User Story 1 - Unlock statistics for a pool (Priority: P1) 🎯 MVP

**Goal**: A member can unlock a pool's stats with one idempotent Pix payment; the section is gated server-side (locked → teaser+price; unlocked → panel shell). Prize is provably untouched.

**Independent Test**: Non-member → 404; member without entitlement → `{unlocked:false, teaser, price}`; member completes one payment → unlocked; duplicate webhook → one charge + one entitlement; pool prize identical before/after unlock.

### Tests for User Story 1 (write first; must FAIL before impl) ⚠️

- [x] T012 [P] [US1] Integration test `apps/api/tests/integration/stats-gate.test.ts`: `GET /api/pools/:poolId/stats` → non-member 404; member-no-entitlement returns only `{unlocked:false, teaser, price}` (no computed stat); member-with-entitlement returns `unlocked:true`.
- [x] T013 [P] [US1] Integration test `apps/api/tests/integration/stats-unlock-idempotency.test.ts`: invoking `handleCheckoutCompleted` twice for one `stats_unlock` payment → payment completed once, exactly one `stats_unlock` row (SC-002).
- [x] T014 [P] [US1] Integration test `apps/api/tests/integration/stats-prize-invariance.test.ts`: `getPoolPrizeTotal`/`PrizeCalculation` identical before vs after N unlocks (0 cents); assert no `poolMember` row created by an unlock (SC-003, FR-008/009).
- [x] T015 [P] [US1] Unit test `apps/api/src/application/stats/UnlockStatsUseCase.test.ts`: rejects non-member; returns 409 when already unlocked; builds checkout with `type:'stats_unlock'`, `amount = price.centavos`, and never calls FeePolicy/PrizeCalculation.

### Implementation for User Story 1

- [x] T016 [US1] Implement `apps/api/src/infrastructure/persistence/DrizzleStatsUnlockRepository.ts` — `isUnlocked`, `grant` (`INSERT … ON CONFLICT (user_id,pool_id) DO NOTHING`), `listUnlockedUsers`.
- [x] T017 [US1] Extend `CheckoutParams` with optional `type?: PaymentType` (default `'entry'`) and `description?: string` in `apps/api/src/application/ports/PaymentGateway.port.ts`.
- [x] T018 [US1] Thread `params.type ?? 'entry'` (+ description as item title) into the payment insert in `MercadoPagoPaymentGateway.ts`, `InfinitePayPaymentGateway.ts`, `StripePaymentGateway.ts` under `apps/api/src/infrastructure/external/`. (depends on T017)
- [x] T019 [US1] Refactor `handleCheckoutCompleted` in `apps/api/src/services/payment.ts` into a type-dispatch (extract existing `entry` branch unchanged) and add the `stats_unlock` branch: `statsUnlockRepo.grant(...)` + `statsRepo.recomputeSnapshot(poolId, userId)` (bootstrap); MUST NOT touch `poolMember`/pool activation/prize.
- [x] T020 [US1] Unify `apps/api/src/infrastructure/external/MockPaymentGateway.ts`: insert payment as `status:'pending'` with the requested `type`, then delegate to `handleCheckoutCompleted(payment.id)` (removes duplicated pool-activation/member logic). (depends on T017, T019)
- [x] T021 [US1] Implement `apps/api/src/application/stats/UnlockStatsUseCase.ts` — membership check, already-unlocked guard, `paymentGateway.createCheckoutSession({ type:'stats_unlock', amount, platformFee: amount, description })`. (depends on T010, T016, T017)
- [x] T022 [US1] Implement `apps/api/src/application/stats/GetParticipantStatsUseCase.ts` — gate (auth + membership + `isUnlocked`); locked → `{unlocked:false, teaser, price}`; unlocked → minimal shell `{unlocked:true, blocks:{}, pendingImpact:[], suggestions:[]}` (blocks filled by US2+).
- [x] T023 [US1] Implement routes `GET /api/pools/:poolId/stats` + `POST /api/pools/:poolId/stats/unlock` in `apps/api/src/infrastructure/http/routes/stats.ts`; wire `DrizzleStatsUnlockRepository`, `UnlockStatsUseCase`, `GetParticipantStatsUseCase`, and `StatsUnlockPrice` (env `STATS_UNLOCK_PRICE_CENTAVOS`) in `apps/api/src/container.ts`. (depends on T016, T021, T022)

**Checkpoint**: Unlock + gate fully functional and independently testable (T012–T015 green). Webhook routes unchanged.

---

## Phase 4: User Story 2 - See my performance versus the rest of the pool (Priority: P1)

**Goal**: The unlocked payload returns the four comparison blocks (A hit-rate vs avg/leader, B ranking evolution, C strengths/weaknesses, D points left on the table), cached and refreshed at match-finish, with a front panel.

**Independent Test**: With finished matches + an unlocked user, the panel renders all four blocks with the viewer's numbers vs pool average + leader; no individual third-party prediction appears; after a match finishes the figures update on next view (not mid-match).

### Tests for User Story 2 (write first; must FAIL before impl) ⚠️

- [x] T024 [P] [US2] Unit test `apps/api/src/domain/stats/StatsComparisonPolicy.test.ts`: exact%/result% for viewer vs pool average vs leader; efficiency and deltas; only aggregates in/out (no individual prediction).
- [x] T025 [P] [US2] Unit test `apps/api/src/domain/stats/ParticipantPoolStats.test.ts`: blocks A–D with range (max 10) and single-match (max 14) via `scoringPolicy.maxPoints()`; "insufficient_data" state when `finished_count == 0` or a dimension total is 0.
- [x] T026 [P] [US2] Integration test `apps/api/tests/integration/stats-blocks.test.ts`: unlocked payload contains blocks A–D; no individual third-party prediction present; after `calcPoints` finishes a match the aggregate cache is invalidated and unlocked users' snapshots reflect the new result on next read (SC-004, SC-006).

### Implementation for User Story 2

- [x] T027 [US2] Implement `apps/api/src/infrastructure/persistence/DrizzleStatsRepository.ts` — `participantRow`, `poolAggregate` (per-member grouped), `roundPoints` (points by `match.matchday`), `recomputeSnapshot` (upsert). Literal exact/result comparison + home/away + low/high goal-band counts; uses indexes `prediction(pool_id,user_id)` and `match(status)`; no hardcoded 10/14.
- [x] T028 [US2] Implement `apps/api/src/services/statsCache.ts` — sibling aggregate cache via `createTtlCache` (TTL `25_000`, single-flight) keyed by `poolId` + `invalidateParticipantStatsAggregate(poolId)` (mirrors `services/rankingCache.ts`).
- [x] T029 [US2] Hook `apps/api/src/jobs/calcPoints.ts`: in the per-pool loop after `recomputeStandings(poolId)` + `invalidateRankingAggregate(poolId)`, recompute snapshots for `listUnlockedUsers(poolId)` and call `invalidateParticipantStatsAggregate(poolId)`.
- [x] T030 [US2] Implement `apps/api/src/domain/stats/StatsComparisonPolicy.ts` (deltas vs avg/leader, efficiency; anonymized). (depends on T024)
- [x] T031 [US2] Implement `apps/api/src/domain/stats/ParticipantPoolStats.ts` aggregate (blocks A–D; `pointsMax = finished_count × scoringPolicy.maxPoints()`). (depends on T025, T030, T008)
- [x] T032 [US2] Extend `GetParticipantStatsUseCase` unlocked payload with blocks A–D (read snapshot via `DrizzleStatsRepository` + pool aggregate via `statsCache.getOrCompute`). (depends on T027, T028, T031)
- [x] T033 [P] [US2] Add `'statistics'` to the `activeTab` union + an "Estatísticas" tab `Link` in `apps/web/src/components/pool/PoolHub.tsx`, and create route `apps/web/src/routes/pools/$poolId/estatisticas.tsx` (uses `apiFetch`, refetch-on-focus + long interval, **not** `livePollMs()`).
- [x] T034 [P] [US2] Create `apps/web/src/components/pool/stats/StatsPaywall.tsx` — teaser + `formatCurrency` price + unlock CTA (POST `/stats/unlock` → `window.location.href = checkoutUrl` → `payment-success` polling → back to tab), reusing the `PrizeWithdrawal` locked-state pattern.
- [x] T035 [US2] Create `apps/web/src/components/pool/stats/StatsPanel.tsx` (blocks A–D) + `Sparkline.tsx` + `CompareBar.tsx` (zero-dep inline SVG, `@theme` tokens, dark/light). (depends on T033)

**Checkpoint**: US1 + US2 = demo-able MVP — pay, unlock, see the four comparison blocks.

---

## Phase 5: User Story 3 - Act on the upcoming matches that matter most (Priority: P2)

**Goal**: The payload ranks **all** the viewer's own not-yet-started matches (predicted or not) by impact, each with a submit-or-change action linking to the existing predictions flow.

**Independent Test**: With not-started matches (some predicted, some not), the impact list includes all of them ranked, each labeled `submit`/`change`; acting on a `change` entry edits the prediction until kickoff; no third-party prediction or consensus ever shown (FR-016/018/019, FR-021/022, SC-009).

### Tests for User Story 3 (write first; must FAIL before impl) ⚠️

- [x] T036 [P] [US3] Unit test `apps/api/src/domain/stats/PendingMatchImpactPolicy.test.ts`: complexity bounded (`O(upcoming+members)`, no outcome-combination simulation); includes both predicted and unpredicted matches; derived `action` = `submit` when `!hasPrediction` else `change`; never reads any third-party prediction.
- [x] T037 [P] [US3] Integration test `apps/api/tests/integration/stats-pending-impact.test.ts`: `pendingImpact` lists every not-started in-scope match for the viewer (predicted + unpredicted) with correct `action`; payload exposes no third-party prediction and no per-match consensus (SC-004, SC-009).

### Implementation for User Story 3

- [x] T038 [US3] Implement `DrizzleStatsRepository.pendingMatches(poolId, userId)` in `apps/api/src/infrastructure/persistence/DrizzleStatsRepository.ts` — all not-started in-scope matches LEFT JOIN the viewer's prediction → `hasPrediction` (never reads others' predictions).
- [x] T039 [US3] Implement `apps/api/src/domain/stats/PendingMatchImpactPolicy.ts` — `impact = scoringPolicy.maxPoints() × reachableRivalDensity`, coarse `impact` bucket, derived `action`. (depends on T036, T008)
- [x] T040 [US3] Extend `GetParticipantStatsUseCase` payload with `pendingImpact` (read-time, short per-user cache). (depends on T038, T039)
- [x] T041 [US3] Add the pending-impact section to `apps/web/src/components/pool/stats/StatsPanel.tsx` — impact-ranked list with kickoff deadline and a submit/change CTA that links into the existing predictions flow. (depends on T035)

**Checkpoint**: US1–US3 independently functional; users can act (submit or change) on high-impact upcoming matches.

---

## Phase 6: User Story 4 - Get suggestions from my own historical pattern (Priority: P2)

**Goal**: The payload includes prediction tips derived solely from the viewer's own past hits.

**Independent Test**: Tips reflect the viewer's own tendencies (home/away, goal bands), the rationale references only their own history, and insufficient history shows a neutral state.

### Tests for User Story 4 (write first; must FAIL before impl) ⚠️

- [x] T042 [P] [US4] Unit test (in `apps/api/src/domain/stats/ParticipantPoolStats.test.ts` or a dedicated `SuggestionPolicy.test.ts`): suggestions use only the viewer's per-user dimension counts; `basis` always `own_history`; "not enough history yet" when below threshold.

### Implementation for User Story 4

- [x] T043 [US4] Implement own-history suggestion derivation from the viewer's dimension counts in `apps/api/src/domain/stats/` (extend `ParticipantPoolStats` or add `SuggestionPolicy.ts`). (depends on T031)
- [x] T044 [US4] Extend `GetParticipantStatsUseCase` payload with `suggestions` (basis `own_history`). (depends on T043)
- [x] T045 [US4] Add the suggestions display to `apps/web/src/components/pool/stats/StatsPanel.tsx`. (depends on T035)

**Checkpoint**: All four user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T046 [P] Run `pnpm check:leaks` — confirm no inline fee math, no hardcoded `10`/`14`, no `scope.kind` branching in stats; no new `// leak-allow`.
- [x] T047 [P] Run `pnpm test apps/api/src/_architecture.test.ts` — domain `stats/` imports no ORM/HTTP, application imports no infrastructure, routes delegate to use cases; `BASELINE_*` allow-lists unchanged.
- [x] T048 [P] Perf: `EXPLAIN` the per-user aggregation, `poolAggregate`, and `pendingMatches` queries — confirm use of `prediction(pool_id,user_id)` and `match(status)` indexes and no new full scan; add an index only if measured necessary (record the measurement).
- [x] T049 [P] Accessibility + theme pass on `StatsPaywall`/`StatsPanel`/`Sparkline`/`CompareBar` (WCAG 2.1 AA, dark/light tokens, loading/empty states) and confirm the tab issues zero requests on the 30s poll cycle (SC-005).
- [x] T050 [P] `pnpm biome check --write .`
- [x] T051 Run `quickstart.md` validation (manual Mock-gateway flow + full `pnpm test`) and obtain reviewer sign-off with `file:line` evidence (stats math only in `domain/stats/`; scoring reused; idempotent unlock; prize untouched; tab off poll path; guardrails green). No rubber-stamp.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; **BLOCKS all stories**.
- **US1 (Phase 3)**: depends on Foundational. The MVP foundation.
- **US2 (Phase 4)**: depends on Foundational; **extends the `GET /stats` endpoint created in US1** (T022/T023) — build US1 before US2.
- **US3 (Phase 5)** and **US4 (Phase 6)**: depend on Foundational; extend the US2 payload (T032) and front panel (T035). US3 and US4 are independent of each other and can run in parallel once US2 lands.
- **Polish (Phase 7)**: after the desired stories are complete.

### User Story Dependencies

- **US1 (P1)**: independent (entitlement seeded directly in its own tests).
- **US2 (P1)**: layered on US1's endpoint; its domain tests (T024/T025/T030/T031) need no US1 runtime — only the wired payload (T032) does.
- **US3 (P2)** / **US4 (P2)**: each adds an independently testable slice to the US2 payload + panel; independent of each other.

### Within Each Story

- Tests first (must fail) → repository/adapter → domain policy/aggregate → use-case wiring → frontend.
- Models/ports before services; services before endpoints; core before integration.

### Parallel Opportunities

- **Setup**: T001 alone.
- **Foundational**: T002, T003, T005, T006, T007, T009 in parallel; then T004 (after T002/T003), T008 (after T007), T010 (after T009), T011.
- **US1 tests**: T012–T015 in parallel. Impl: T016/T017 parallel; T018 after T017; T019 then T020; T021 after T010/T016/T017; T022 parallel with T021; T023 last.
- **US2 tests**: T024/T025/T026 parallel. Impl: T027/T028 parallel; T029 after T027/T028; T030 after T024; T031 after T025/T030/T008; T032 after T027/T028/T031; T033/T034 parallel; T035 after T033.
- **US3/US4** can be developed by different people in parallel after US2.

---

## Parallel Example: User Story 1

```bash
# Tests first (parallel):
Task: "Integration test stats gate in apps/api/tests/integration/stats-gate.test.ts"
Task: "Integration test idempotent unlock in apps/api/tests/integration/stats-unlock-idempotency.test.ts"
Task: "Integration test prize invariance in apps/api/tests/integration/stats-prize-invariance.test.ts"
Task: "Unit test UnlockStatsUseCase in apps/api/src/application/stats/UnlockStatsUseCase.test.ts"

# Then independent impl pieces (parallel):
Task: "DrizzleStatsUnlockRepository in apps/api/src/infrastructure/persistence/DrizzleStatsUnlockRepository.ts"
Task: "Extend CheckoutParams in apps/api/src/application/ports/PaymentGateway.port.ts"
```

---

## Implementation Strategy

### MVP First

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1: unlock + gate). **STOP & VALIDATE**: T012–T015 green; prize invariant proven.
2. Phase 4 (US2: four blocks). Now demo-able: pay → unlock → see comparison panel.

### Incremental Delivery

US1 (gate/unlock) → US2 (blocks) → US3 (upcoming-match impact + submit/change) → US4 (own-history suggestions). Each ships an independently testable increment without breaking the previous.

### Notes

- [P] = different files, no incomplete-task dependency.
- Verify each test fails before implementing.
- Commit after each task or logical group.
- Keep stats math strictly in `domain/stats/`; reuse `prediction.points` + `scoringPolicy.maxPoints()` — never re-score, never hardcode 10/14, never branch on `scope.kind` (G2/G3).
