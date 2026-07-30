# Implementation Plan: Statistics tab only where statistics mean something

**Branch**: `035-stats-scope-gate` | **Date**: 2026-07-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/035-stats-scope-gate/spec.md`

## Summary

One rule, one home: `PoolScope.supportsParticipantStats()` returns true only for
`whole-competition`, and `Pool` delegates to it. Everything else consumes that.

`services/pool.ts:getPoolById` composes a per-viewer `statsAvailable` —
`scope.supportsParticipantStats() || viewer already holds an unlock` — and returns
it in the pool-detail payload, so the front end stops deriving anything from scope
fields (it currently branches on `pool.matchId != null`) and simply hides the tab.
`GetParticipantStatsUseCase` and `UnlockStatsUseCase` enforce the same rule
server-side with a new `StatsError` code, because hiding a tab is not a gate.

No schema change, no migration, no data touched.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node.js ≥ 22
**Primary Dependencies**: Hono, Drizzle ORM, Better Auth (API); React 19, TanStack
Router + Query (web). **No new dependencies.**
**Storage**: PostgreSQL 16 — **no changes**. Reads existing `pool` scope columns
and `stats_unlock`.
**Testing**: Vitest — domain unit tests for the new scope rule, use-case unit
tests with fake ports, a web component test for the hidden tab, and an integration
scenario for the grandfathered holder.
**Target Platform**: Node 22 server + browser PWA.
**Project Type**: pnpm monorepo — `apps/api` (hexagonal), `apps/web`,
`packages/shared`.
**Performance Goals**: `statsAvailable` must not add a round trip on the hot
pool-detail path — the unlock lookup runs inside the existing `Promise.all`.
**Constraints**: must not remove access from anyone who already paid; must not
change anything for whole-competition pools.
**Scale/Scope**: 21 matchday-range pools, 5 single-fixture, 3 whole-competition;
6 unlocks, 2 of them on range pools. ~7 files touched, 0 added tables.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Code Quality — PASS

Net removal of a decision, not an addition: the front-end's own scope branch is
deleted and replaced by a server-provided boolean. One new domain method, one new
error code, no new abstraction.

### II. Testing Standards — PASS

The new domain method is pure and covered for all three scope kinds. Both use
cases get failing-first tests for the refusal and for the grandfathered pass.
`PoolHub` gets a component test per branch (tab shown / hidden / redirect). An
integration scenario proves a real `stats_unlock` row still grants access on a
range pool — the outcome this change must not break.

### III. UX Consistency — PASS

The tab disappears rather than showing a paywall that cannot pay off. A direct URL
visit redirects to predictions (the pattern already used for single-match pools)
instead of surfacing an error, so navigation stays predictable.

### IV. Performance Requirements — PASS

One extra indexed lookup (`stats_unlock` by `(user_id, pool_id)`) on pool detail,
issued inside the existing `Promise.all` — no added latency on the critical path.
Fewer requests overall: members of shorter pools no longer load the stats query.

### V. Hexagonal Architecture & SOLID — PASS

The rule lives in the `PoolScope` value object with `Pool` delegating (OCP: adding
a scope kind later changes one method). Use cases consume ports only. The
composition in `services/pool.ts` calls the domain method rather than
re-implementing it, which is also what keeps `check:leaks` (G2) quiet — that
guardrail exists precisely to stop scope-branching from spreading outward.

**Result**: no violations. Complexity Tracking stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/035-stats-scope-gate/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (no schema change — reads only)
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── pool-detail-and-stats.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/api/src/
├── domain/
│   ├── shared/PoolScope.ts             # TOUCHED (+ supportsParticipantStats)
│   ├── pool/Pool.ts                    # TOUCHED (delegates)
│   └── stats/StatsError.ts             # TOUCHED (+ SCOPE_UNSUPPORTED)
├── application/stats/
│   ├── GetParticipantStatsUseCase.ts   # TOUCHED (refuse unless unlocked)
│   └── UnlockStatsUseCase.ts           # TOUCHED (refuse new purchases)
├── infrastructure/http/routes/stats.ts # TOUCHED (status map)
└── services/pool.ts                    # TOUCHED (compose statsAvailable)

packages/shared/src/types/index.ts       # TOUCHED (PoolDetail.statsAvailable)

apps/web/src/components/pool/PoolHub.tsx # TOUCHED (consume the flag)
```

**Structure Decision**: no new files in `apps/api/src`. This is a rule that
belongs on an existing value object and two existing use cases; creating a
`StatsAvailabilityPolicy` module for a one-line predicate would add a hop without
adding meaning. Test files are added alongside the code they cover, plus one
integration scenario.

## Complexity Tracking

> No constitutional violations. Section intentionally empty.
