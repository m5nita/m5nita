---
description: "Task list for 033-global-player-stats"
---

# Tasks: "Meu desempenho" — global bettor overview

**Input**: Design documents from `/specs/033-global-player-stats/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/get-my-performance.md

**Tests**: REQUIRED — the constitution (Principle II) and the spec (SC-003 / SC-005
"verified by automated tests") mandate them. **Backend** tests are automated (Vitest
+ real-Postgres integration). **Frontend** verification is **manual per
`quickstart.md`** because no web component/e2e runner is wired in this repo; this is
a **documented deviation** recorded in `plan.md` → Complexity Tracking, with
follow-up **T037** to add a component-test harness.

**Organization**: The single endpoint `GET /api/users/me/performance` serves all
three user stories, so the whole backend lives in **Foundational (Phase 2)**. Each
frontend surface is then an independently-testable story: US1 = dedicated screen
(MVP), US2 = home card, US3 = share.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (user-story phases only)

---

## Phase 1: Setup (Shared contract)

- [ ] T001 [P] Add `MyPerformanceResponse` DTO (fields per `contracts/get-my-performance.md`) to `packages/shared/src/types/index.ts`, next to `PendingPrizesResponse`.

---

## Phase 2: Foundational (Backend — BLOCKS all user stories)

**⚠️ CRITICAL**: The endpoint, domain, and wiring below must be complete before any
frontend story. TDD order: write the failing test, then implement to green.

### Domain (pure, 100% coverage)

- [ ] T002 [P] Define read port `PerformanceReadRepository` (methods `getUserPoolFacts(userId)`, `getUserWithdrawnPoolIds(userId)` + `UserPoolFact` projection type per data-model.md) in `apps/api/src/domain/performance/PerformanceReadRepository.port.ts`.
- [ ] T003 [P] Extend `RankingRepository` port with `getStandingsForPools(poolIds: string[]): Promise<Array<StandingRow & { poolId: string }>>` in `apps/api/src/domain/ranking/RankingRepository.port.ts`.
- [ ] T004 [P] Write failing unit tests for the `Balance` VO (`of` integer guard, signed values, `isPositive`/`isNegative`/`isZero`, `abs()→Money`) in `apps/api/src/domain/shared/Balance.test.ts`.
- [ ] T005 Implement `Balance` signed-money VO in `apps/api/src/domain/shared/Balance.ts` to pass T004.
- [ ] T006 Define `PerformanceSummary` aggregate VO + `PoolContribution`/`EvolutionPoint` shapes (per data-model.md §C) in `apps/api/src/domain/performance/PerformanceSummary.ts`.
- [ ] T007 Write failing unit tests for `PerformanceCalculation.summarize` in `apps/api/src/domain/performance/PerformanceCalculation.test.ts`: saldo, aproveitamento **null** when no decided pools, vitórias/derrotas counts, **ties** (co-winners), **free pools** (R$0 money but counted), maior prêmio, a sacar (excludes withdrawn), cumulative evolução, and the reconciliation invariants (SC-003: `saldo == Σ(winnerShare − entryPaid)`; SC-005: `vitórias+derrotas == closed count`).
- [ ] T008 Implement `PerformanceCalculation` domain service (uses `PrizeCalculation`, `FeePolicy.from`, `EntryFee.hydrate`, `Money`, `Balance`) in `apps/api/src/domain/performance/PerformanceCalculation.ts` to pass T007.

### Application

- [ ] T009 Write failing unit test for `GetMyPerformanceUseCase` with fake repos (groups standings per pool, reuses `Ranking.build` for position-1, composes summary; empty-user case) in `apps/api/src/application/performance/GetMyPerformanceUseCase.test.ts`.
- [ ] T010 Implement `GetMyPerformanceUseCase.execute({ userId })` in `apps/api/src/application/performance/GetMyPerformanceUseCase.ts` (fetch facts + batched standings + withdrawn ids; per closed pool `Ranking.build`→winners; assemble `PoolContribution[]`; call `PerformanceCalculation.summarize`) to pass T009.

### Infrastructure

- [ ] T011 [P] Implement `DrizzlePerformanceReadRepository` (`getUserPoolFacts`: one query joining `pool_member→pool`, coupon join for `discountPercent`, correlated `COUNT` for `memberCount`, `payment` join via `pool_member.payment_id` for `entryPaidCentavos`, `ne(pool.status,'cancelled')`; `getUserWithdrawnPoolIds`) in `apps/api/src/infrastructure/persistence/DrizzlePerformanceReadRepository.ts`.
- [ ] T012 [P] Implement `getStandingsForPools(poolIds)` (`inArray(poolMember.poolId, poolIds)`, LEFT JOIN standing coalesced to 0, `ORDER BY poolId, points_total DESC, exact_matches DESC, name ASC, userId ASC`) in `apps/api/src/infrastructure/persistence/DrizzleRankingRepository.ts`.
- [ ] T013 Wire `getMyPerformanceUseCase` (construct `DrizzlePerformanceReadRepository`, inject with `rankingRepo`) and expose it on the container in `apps/api/src/container.ts`.
- [ ] T014 Add `usersRoutes.get('/users/me/performance', …)` — read `c.get('user').id`, call the use case, map `PerformanceSummary`→`MyPerformanceResponse` (signed `saldoCentavos`) — in `apps/api/src/infrastructure/http/routes/users.ts`.

### Backend tests (verify Foundational)

- [ ] T015 [P] Contract test asserting the response schema + invariants from `contracts/get-my-performance.md` (incl. empty-user payload, `aproveitamento` null iff no decided pools, and that the endpoint is reachable with only `requireAuth` — **no** `stats_unlock`, i.e. it is free [FR-002/SC-008]) in `apps/api/tests/integration/performance.contract.test.ts`.
- [ ] T016 [P] Integration test on real Postgres (port 5433): seed the fixture (17 non-cancelled pools: 6 won incl. one tie, 9 lost, 2 active; entries + one withdrawal) and assert the full payload matches spec US1 #1/#2, and reconciles with `GetPrizeInfoUseCase` per pool (SC-003), in `apps/api/tests/integration/performance.integration.test.ts`.
- [ ] T017 Query-count / performance guard: assert the endpoint issues **≤ 3 DB round-trips** (no per-pool loop) and meets the budget, **and capture `EXPLAIN` plans for `getUserPoolFacts` + `getStandingsForPools` to confirm index scans (no full table scan)** per Principle IV, in `apps/api/tests/integration/performance.perf.test.ts`.

**Checkpoint**: `GET /api/users/me/performance` returns correct, reconciled, fast data. Frontend stories can now proceed in parallel.

---

## Phase 3: User Story 1 — Dedicated "Meu desempenho" screen (Priority: P1) 🎯 MVP

**Goal**: A logged-in user opens `/performance` and sees saldo (hero), record,
aproveitamento, money tiles, a sacar (with a withdraw link), maior prêmio, and the
saldo-evolution curve — in the approved "Carteira" layout, light and dark.

**Independent Test**: Log in (dev phone `+5511999999999`, console OTP), open the
screen; verify every number matches the seeded data; verify the empty state (new
user), negative-saldo styling, and the "a sacar" link.

- [ ] T018 [P] [US1] Add `useMyPerformance()` (inline `useQuery`, `queryKey: ['my-performance']`, via `apiFetch('/api/users/me/performance')`) in `apps/web/src/lib/performance.ts`.
- [ ] T019 [P] [US1] `AproveitamentoDonut.tsx` (reuse the `EfficiencyDonut` ring pattern; render "sem dados ainda" when `aproveitamento == null`) in `apps/web/src/components/performance/AproveitamentoDonut.tsx`.
- [ ] T020 [P] [US1] `SaldoSparkline.tsx` (reuse `EvolutionLineChart`; single series from `evolucao`, colored by sign, endpoint dot) in `apps/web/src/components/performance/SaldoSparkline.tsx`.
- [ ] T021 [P] [US1] `SaldoHero.tsx` (reuse `RankingHero` panel; `+`/green for lucro, `−`/red for prejuízo; `formatCurrency`) in `apps/web/src/components/performance/SaldoHero.tsx`.
- [ ] T022 [P] [US1] `MoneyTiles.tsx` (gastei / prêmios / a sacar tiles + record `V–D` + em andamento + **maior prêmio** highlight [FR-013]; hide maior prêmio when null) in `apps/web/src/components/performance/MoneyTiles.tsx`.
- [ ] T023 [US1] `PerformanceScreen.tsx` composition — wires the hook + components; `Loading` while pending, `ErrorMessage` on error, empty state (dashed `Insufficient` pattern) when `participei === 0` — in `apps/web/src/components/performance/PerformanceScreen.tsx`.
- [ ] T024 [US1] Wire the **"a sacar" CTA** to the **existing** pending-prizes / per-pool withdrawal surface (link to the pending-prizes list / `PrizeWithdrawal` flow; shown only when `aSacarCentavos > 0`) — in `MoneyTiles.tsx`/`PerformanceScreen.tsx` [FR-012/SC-006].
- [ ] T025 [US1] Route `apps/web/src/routes/performance.tsx` (`createFileRoute('/performance')` + `beforeLoad: () => requireAuthGuard()`, renders `PerformanceScreen`).
- [ ] T026 [US1] Add `{ to: '/performance' as const, label: 'Meu desempenho' }` to **both** nav arrays (desktop ~L68–72 and mobile ~L158–163) in `apps/web/src/routes/__root.tsx`.
- [ ] T027 [US1] Manual verification per `quickstart.md`: screen states (data / empty / negative saldo / error), the "a sacar" link routing to withdrawal, and light–dark parity vs the approved mockup.

**Checkpoint**: MVP — the dedicated screen is fully functional and independently testable.

---

## Phase 4: User Story 2 — Home summary card (Priority: P2)

**Goal**: Logged-in users see a compact saldo + record card at the top of the home
dashboard that links to `/performance`.

**Independent Test**: On the logged-in home, the card shows saldo + record and links
to the full view; logged-out home shows no card.

- [ ] T028 [P] [US2] `MyPerformanceCard.tsx` compact summary (reuses `useMyPerformance`; saldo + `V–D` record + segmented bar + "Ver tudo →"; **returns `null` when `participei === 0`**, matching `PendingPrizesSection`) in `apps/web/src/components/performance/MyPerformanceCard.tsx`.
- [ ] T029 [US2] Insert `<MyPerformanceCard />` near the top of `apps/web/src/components/home/DashboardHome.tsx` (after the hero header ~L191, before `<PendingPrizesSection />` ~L225).
- [ ] T030 [US2] Manual verification per `quickstart.md`: card visible + links when logged in; absent when logged out; hidden for a user with no pools.

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: User Story 3 — Share my bettor card (Priority: P3)

**Goal**: From the screen, the user can share a visual card summarizing their career.

**Independent Test**: Tap "Compartilhar" on the screen → a shareable card of
saldo/record/aproveitamento/prêmios is produced.

- [ ] T031 [P] [US3] `sharePerformance` util (mirror `apps/web/src/lib/shareRanking.ts`) producing the shareable card in `apps/web/src/lib/sharePerformance.ts`.
- [ ] T032 [US3] Add a "Compartilhar" action to `apps/web/src/components/performance/PerformanceScreen.tsx` wired to `sharePerformance`.
- [ ] T033 [US3] Manual verification per `quickstart.md`: the share action generates the card with the current user's stats.

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T034 [P] Run guardrails and fix any findings: `pnpm check:leaks`, `pnpm check:arch`, `pnpm biome check --write .`.
- [ ] T035 [P] Verify coverage/suites: new domain at 100%, new backend-code ≥ 80%; `pnpm test` and `pnpm --filter @m5nita/api test:integration` (DATABASE_URL on 5433) green.
- [ ] T036 **Accessibility pass (WCAG 2.1 AA, Principle III)**: `aria-label`/`role="img"` on the donut + sparkline SVGs, visible keyboard focus on the nav item / "Ver tudo" / "a sacar" / "Compartilhar" controls, honor `prefers-reduced-motion`, and confirm green/red/amber contrast on both themes.
- [ ] T037 [P] **(Follow-up — addresses the documented Principle II deviation)** Add a web component-test harness (Vitest + React Testing Library + jsdom) and render tests for the performance components (saldo / record / empty-state / negative-saldo). May be deferred to a dedicated infra change; tracked here so it is not lost.
- [ ] T038 Confirm light/dark parity of the screen + home card against the approved "Carteira" mockup.
- [ ] T039 Run the full `quickstart.md` acceptance mapping (US1 #1–#5, US2, US3, SC-003/004/005/006).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → no deps.
- **Foundational (P2)** → depends on T001; **blocks all user stories**.
- **US1 / US2 / US3 (P3–P5)** → each depends only on Foundational (the endpoint). They can proceed in parallel once Phase 2 is done; US3's action lives in the US1 screen, so T032 depends on T023.
- **Polish (P6)** → after the desired stories.

### Key ordering within Foundational

- Ports (T002, T003) before impls that use them.
- Domain: T004→T005, T006→T007→T008 (test before impl).
- Application: T009→T010 (needs domain + ports).
- Infra: T011 ‖ T012 → T013 (wiring, needs T010–T012) → T014 (route).
- Backend tests T015–T017 after T014.

### Within US1

- T018–T022 in parallel (different component files) → T023 composition → T024 (withdraw link, depends on T023 + the existing withdrawal surface) → T025 route → T026 nav → T027 verify.

### Parallel opportunities

- T002, T003, T004 in parallel (different files).
- T011 ‖ T012 (different repos).
- T015 ‖ T016 (different test files).
- US1 building blocks T018–T022 all `[P]`.
- Whole stories US1 ‖ US2 ‖ US3 once Foundational is green (different surfaces).

## Parallel Example: Foundational domain + US1 components

```bash
# Foundational, in parallel (different files):
Task: "Define PerformanceReadRepository port (T002)"
Task: "Extend RankingRepository port with getStandingsForPools (T003)"
Task: "Write Balance VO failing tests (T004)"

# US1 view building blocks, in parallel (after the endpoint exists):
Task: "AproveitamentoDonut (T019)"
Task: "SaldoSparkline (T020)"
Task: "SaldoHero (T021)"
Task: "MoneyTiles + maior prêmio (T022)"
```

## Implementation Strategy

### MVP (Foundational + US1)

1. Phase 1 (Setup) → Phase 2 (Foundational: endpoint green, reconciled, fast).
2. Phase 3 (US1 screen incl. the "a sacar" link) → **STOP & VALIDATE** per quickstart.
3. Deploy/demo — this alone answers "quanto participei / ganhei / perdi / gastei / ganhei".

### Incremental delivery

- + US2 (home card) → test → demo.
- + US3 (share) → test → demo.
- Each story adds value without breaking the previous ones.

## Notes

- `[P]` = different files, no incomplete-task dependency.
- Backend follows the constitution's domain→application→infrastructure order with
  tests first; money/tiebreak math stays in the domain (reuse `Ranking.build`,
  `PrizeCalculation`) — no SQL `RANK()` or inline fee math (G2/G3 guardrails).
- No DB migration and no new **runtime** dependency in this feature (T037's test
  harness is dev-only and optional/follow-up).
- Frontend automated-test gap is a **documented deviation** (plan.md → Complexity
  Tracking); manual verification per quickstart covers the presentational surfaces.
- Commit after each task or logical group; stop at any checkpoint to validate a
  story independently.
