# Implementation Plan: "Meu desempenho" — global bettor overview

**Branch**: `033-global-player-stats` | **Date**: 2026-07-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/033-global-player-stats/spec.md`

## Summary

Add a free, per-user **global** performance view ("Meu desempenho") that aggregates
a user's history across **all** their pools: participei, vitórias/derrotas, em
andamento, aproveitamento, gastei, prêmios conquistados, **saldo** (net P&L),
a sacar, maior prêmio, and a saldo-evolution series — plus a compact summary card
on the home screen. It is **read-only reporting** that reuses the existing
winner/prize/payment truth.

Technical approach: one new API endpoint `GET /api/users/me/performance` backed by
a new application use case that runs **~3 batched queries** (no N+1) and delegates
all money/tiebreak math to the domain — reusing `Ranking.build`, `PrizeCalculation`,
`FeePolicy`, `EntryFee`, `Money`, and one new signed-money value object `Balance`.
The frontend adds a guarded `/performance` route (a "wallet" dashboard reusing
the existing inline-SVG stats primitives) and a self-gating home card, with a nav
entry in the app shell. **No database schema changes; no new runtime dependencies.**

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node.js ≥ 22 (monorepo, pnpm)
**Primary Dependencies**: Hono (HTTP), Drizzle ORM, Better Auth (auth middleware); React 19, TanStack Router + Query, Tailwind v4 (`@theme` tokens). No new deps.
**Storage**: PostgreSQL 16 — **reuses** `pool`, `pool_member`, `pool_standing`, `payment`, `prize_withdrawal`. **No new tables, no migration.**
**Testing**: Vitest — domain unit tests (100% on new domain), application use-case tests with fakes, infrastructure/integration tests against real Postgres (docker `postgres-test`, port 5433), one route contract test, and a query-count/benchmark guard on the endpoint.
**Target Platform**: Node API (`apps/api`) + browser PWA (`apps/web`).
**Project Type**: Web monorepo (`apps/api`, `apps/web`, `packages/shared`).
**Performance Goals**: endpoint **p95 < 200ms**; full screen usable **< 2s for ≤ 50 pools** (SC-004); **≤ 3 batched DB round-trips**, never O(pools) (no N+1 ranking scans).
**Constraints**: production is a small box (≈3 vCPU / 4 GB) already pressured by ranking re-aggregation + live-poll traffic — so the endpoint MUST be batched and rely only on **existing** indexes (`payment(userId,poolId)` leading column, `pool_standing(poolId,userId)`, `pool_member(userId)`); money & ranking/tiebreak math MUST live in `domain/` (no SQL RANK() duplicating the tiebreaker, no inline fee math).
**Scale/Scope**: strictly the current authenticated user's own data; 1 new endpoint, 1 new screen + 1 home card + 1 nav entry, ~4 new domain units, ~3 batched read methods.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Assessment | How this plan complies |
|-----------|------------|------------------------|
| **I. Code Quality** | PASS | New monetary primitive `Balance` is a value object (not a raw signed number); functions single-purpose; no dead code; reuses `formatCurrency`/`formatBrl`. No inline fee math (guardrail G2). |
| **II. Testing Standards** | PASS *(with documented deviation)* | New domain (`Balance`, `PerformanceCalculation`, `PerformanceSummary`) gets 100% unit coverage incl. the reconciliation property (SC-003/005), no-data aproveitamento, ties, free pools. Adapter/integration tests on real Postgres; route contract test; benchmark/query-count guard for Principle IV. **Frontend components ship without automated coverage** (no web component-test runner is wired) — deviation recorded in Complexity Tracking; the at-risk logic lives in the API domain at 100%. |
| **III. UX Consistency** | PASS | Reuses the design system tokens and the existing stats inline-SVG primitives (`EfficiencyDonut`, `EvolutionLineChart`, `RankingHero`), the `Loading`/`ErrorMessage`/empty-state patterns, and predictable nav. Distinct name "Meu desempenho" avoids collision with the paid "Estatísticas". BRL formatting via the shared util. |
| **IV. Performance** | PASS | Replaces the `GetPendingPrizesUseCase` N+1 loop with ~3 batched queries; no per-pool round-trips; relies on existing indexes; p95<200ms target enforced by a benchmark test; loading state < 200ms via `Loading`. |
| **V. Hexagonal & SOLID** | PASS | domain (`Balance`, `PerformanceSummary`, `PerformanceCalculation`, `PerformanceReadRepository` port; reuse `Ranking`, `PrizeCalculation`) → application (`GetMyPerformanceUseCase`) → infrastructure (`DrizzlePerformanceReadRepository`, `DrizzleRankingRepository.getStandingsForPools`, Hono route, `container.ts` wiring). Dependencies point inward; ports are focused (ISP); no new DI framework. |

**Result: PASS — no violations. Complexity Tracking left empty.**

## Project Structure

### Documentation (this feature)

```text
specs/033-global-player-stats/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── get-my-performance.md
├── checklists/
│   └── requirements.md  # (from /speckit.specify)
└── tasks.md             # (created later by /speckit.tasks)
```

### Source Code (repository root)

```text
apps/api/src/
├── domain/
│   ├── shared/
│   │   └── Balance.ts                         # ADD — signed-money VO (saldo can be negative)
│   ├── performance/
│   │   ├── PerformanceSummary.ts              # ADD — aggregate VO (the computed result)
│   │   ├── PerformanceCalculation.ts          # ADD — pure domain service (sums, classify, saldo, series)
│   │   └── PerformanceReadRepository.port.ts   # ADD — read port (pool facts, spend, withdrawn pools)
│   └── ranking/
│       ├── Ranking.ts                          # REUSE — Ranking.build (tiebreak stays here)
│       └── RankingRepository.port.ts           # MODIFY — add getStandingsForPools(poolIds)
├── application/
│   └── performance/
│       ├── GetMyPerformanceUseCase.ts          # ADD — orchestrates batched reads + domain math
│       └── GetMyPerformanceUseCase.test.ts     # ADD
├── infrastructure/
│   ├── persistence/
│   │   ├── DrizzlePerformanceReadRepository.ts  # ADD — the ~2 batched projections
│   │   └── DrizzleRankingRepository.ts          # MODIFY — add getStandingsForPools (inArray)
│   └── http/routes/
│       └── users.ts                             # MODIFY — add GET /users/me/performance
├── container.ts                                 # MODIFY — wire getMyPerformanceUseCase
└── (domain tests colocated: Balance.test.ts, PerformanceCalculation.test.ts, Ranking winnersOf reuse test)

packages/shared/src/types/
└── index.ts                                     # MODIFY — add MyPerformanceResponse (next to PendingPrizesResponse)

apps/web/src/
├── routes/
│   ├── performance.tsx                        # ADD — guarded route (requireAuthGuard)
│   └── __root.tsx                                # MODIFY — add nav item to BOTH arrays
├── components/
│   ├── performance/                              # ADD — new dir (mirrors components/pool/stats/)
│   │   ├── PerformanceScreen.tsx                 #   composition
│   │   ├── SaldoHero.tsx                         #   from RankingHero
│   │   ├── SaldoSparkline.tsx                    #   from EvolutionLineChart
│   │   ├── AproveitamentoDonut.tsx               #   from EfficiencyDonut
│   │   ├── MoneyTiles.tsx                        #   gastei / prêmios / a sacar
│   │   ├── MyPerformanceCard.tsx                 #   compact home summary (self-gating)
│   │   └── types.ts                              #   response type (or import from @m5nita/shared)
│   └── home/DashboardHome.tsx                    # MODIFY — insert <MyPerformanceCard/> near top
└── lib/performance.ts                            # ADD (optional) — useMyPerformance() hook
```

**Structure Decision**: Existing web monorepo with a strict hexagonal backend. This
feature is a **domain-first, read-only aggregation**: build the domain (`Balance`,
`PerformanceSummary`, `PerformanceCalculation`, read port) → the use case → the
Drizzle adapter + Hono route → the React screen + home card. It reuses the pool /
ranking / payment / withdrawal tables and the pool-stats SVG component family with
no schema change and no new dependency.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| New frontend code (`apps/web/src/components/performance/*`, `apps/web/src/routes/performance.tsx`, the home card) ships **without automated unit-test coverage** — below Principle II's ≥80% new-code gate. | The repo has **no web component/e2e test runner** wired (Vitest has no RTL/jsdom setup; the `apps/web/tests/*.spec.ts` Playwright specs are not runnable). All at-risk logic — money, tiebreak, aggregation, reconciliation — lives in the API domain/application at **100% coverage + integration**. The new frontend is presentational reuse of the already-shipped pool-stats SVG primitives (`EfficiencyDonut`, `EvolutionLineChart`, `RankingHero`). | Wiring Vitest + React Testing Library + jsdom for the whole web app (new devDeps + config) is a **separate infrastructure change** beyond this feature's scope. Manual verification per `quickstart.md` covers the presentational surfaces; follow-up task **T037** tracks adding a web component-test harness so these components can be covered later. |
