# Tasks: Statistics tab only where statistics mean something

**Input**: Design documents from `/specs/035-stats-scope-gate/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: included. Constitution II mandates TDD, 100 % unit coverage for the
domain layer, and contract coverage for endpoints. Test tasks precede their
implementation task.

**No setup phase**: no migration, no dependency, no schema change
([data-model.md](./data-model.md)).

## Format

`- [ ] [TaskID] [P?] [Story?] Description with file path`

---

## Phase 1: Foundational — the rule and its single home

**⚠️ Blocking**: both user stories consume this.

- [X] T001 Add failing unit tests to `apps/api/src/domain/shared/PoolScope.test.ts` for `supportsParticipantStats()`: `true` for whole-competition, `false` for a single matchday, `false` for a range, `false` for single-match
- [X] T002 Add `supportsParticipantStats(): boolean` to `apps/api/src/domain/shared/PoolScope.ts` (`kind === 'whole-competition'`)
- [X] T003 Add a delegating `supportsParticipantStats()` to `apps/api/src/domain/pool/Pool.ts` so use cases ask the aggregate, not the scope
- [X] T004 [P] Add the `SCOPE_UNSUPPORTED` code to `apps/api/src/domain/stats/StatsError.ts` and map it to `404` in `STATUS_MAP` in `apps/api/src/infrastructure/http/routes/stats.ts`

**Checkpoint**: `pnpm --filter @m5nita/api exec vitest run src/domain/shared/PoolScope.test.ts` green.

---

## Phase 2: User Story 1 — No statistics offer where statistics are meaningless (Priority: P1)

**Goal**: shorter pools stop showing and stop selling the panel, on the screen and
at the endpoints.

**Independent test**: open a whole-competition pool and a matchday-range pool as a
member — tab present, then absent — and confirm both stats endpoints agree.

### Server enforcement

- [X] T005 [US1] Add failing tests to `apps/api/src/application/stats/GetParticipantStatsUseCase.test.ts`: a range-pool member with no unlock is refused with `SCOPE_UNSUPPORTED`, a single-match-pool member likewise, and a whole-competition member still gets the teaser
- [X] T006 [US1] Enforce it in `apps/api/src/application/stats/GetParticipantStatsUseCase.ts` — check order pool → membership → **unlock** → scope, so a holder never reaches the gate ([contracts/pool-detail-and-stats.md](./contracts/pool-detail-and-stats.md))
- [X] T007 [P] [US1] Add failing tests to `apps/api/src/application/stats/UnlockStatsUseCase.test.ts`: a range pool is refused with `SCOPE_UNSUPPORTED` **and the payment gateway is never called**; a whole-competition pool still creates the checkout
- [X] T008 [US1] Enforce it in `apps/api/src/application/stats/UnlockStatsUseCase.ts`, after the existing `ALREADY_UNLOCKED` check and before the gateway call

### Per-viewer flag

- [X] T009 [US1] Add `statsAvailable: boolean` to `PoolDetail` in `packages/shared/src/types/index.ts` as a **required** field, so a forgetful caller fails to compile
- [X] T010 [US1] Compose it in `apps/api/src/services/pool.ts:getPoolById` — `PoolScope.fromRow(details).supportsParticipantStats() || statsUnlockRepo.isUnlocked(userId, poolId)` — with the unlock lookup joining the existing `Promise.all` so no latency is added
- [X] T011 [US1] Add tests for the composition in `apps/api/src/services/pool.test.ts`: `true` for whole-competition, `false` for range without unlock, `true` for range with unlock, `false` for single-match

### Interface

- [X] T012 [US1] Replace the front-end scope branch in `apps/web/src/components/pool/PoolHub.tsx`: delete `isSingleMatch` and gate both the tab and the redirect on `pool.statsAvailable`
- [X] T013 [US1] Add a component test in `apps/web/src/components/pool/PoolHub.test.tsx` covering tab shown when `statsAvailable`, hidden when not, and redirect to predictions when landing on the stats tab without availability
- [X] T014 [P] [US1] Update any test fixture or factory that builds a `PoolDetail` so it carries `statsAvailable` (compile-driven: fix whatever `tsc --noEmit` reports)

**Checkpoint**: User Story 1 demonstrable end to end per [quickstart.md](./quickstart.md).

---

## Phase 3: User Story 2 — Keep what I already paid for (Priority: P1)

**Goal**: the 2 existing unlock holders on matchday-range pools lose nothing.

**Independent test**: as a range-pool member holding an unlock, the tab is present
and the panel loads; another member of the same pool sees neither.

- [X] T015 [US2] Add an integration scenario in `apps/api/tests/integration/scenarios/stats-scope-gate.test.ts` (import `src` via `../../../src` so the container singleton is not duplicated): with a real `stats_unlock` row on a matchday-range pool, `GET /api/pools/:id` returns `statsAvailable: true` and `GET /api/pools/:id/stats` returns the unlocked payload; a second member of the same pool gets `statsAvailable: false` and `404 SCOPE_UNSUPPORTED`
- [X] T016 [US2] Extend the same scenario to assert a whole-competition pool is unchanged (teaser for a non-holder, `201` from the unlock endpoint) — the regression this change must not cause
- [X] T017 [US2] Assert no data was harmed: after the above, the `stats_unlock` row still exists and no row was added to `payment` for the range pool

**Checkpoint**: both user stories hold; nobody who paid lost access.

---

## Phase 4: Polish & cross-cutting

- [X] T018 [P] Run `pnpm check:leaks` and `pnpm check:arch`; confirm the removed front-end scope branch left no other place deriving availability from `matchId` / `matchdayFrom`
- [X] T019 Run `pnpm biome check --write .`, `tsc --noEmit` for api and web, and `pnpm test`; then the integration suite with `DATABASE_URL` pointed at port 5433. Confirm every acceptance scenario in [spec.md](./spec.md) has a covering test

---

## Dependencies & execution order

```text
Phase 1 (rule + error code)
   ├─> Phase 2 (US1: hide and refuse)
   └─> Phase 3 (US2: grandfathered access)   ─┬─> Phase 4 (polish)
                                              │
   Phase 2 ────────────────────────────────────┘
```

- **Phase 1 blocks everything** — it is the rule both stories consume.
- **US2 is not independent of US1 in code**: the grandfather branch is written as
  part of T006 and T010. Phase 3 is its verification, and it is where the "nobody
  loses paid access" guarantee is actually proven.
- Within Phase 2: T001→T002→T003 then T005→T006, T007→T008, T009→T010→T011,
  T012→T013. T014 is compile-driven and can run alongside T012.

## Parallel opportunities

- Phase 1: T004 in parallel with T001–T003.
- Phase 2: T007 in parallel with T005; T014 in parallel with T012.
- Phase 4: T018 in parallel with nothing else pending; T019 last.

## Implementation strategy

There is no partial ship here worth having: hiding the tab (US1) without the
grandfather branch (US2) would take access from two people who paid, which the
spec forbids. Both are P1 and land together in one PR.
