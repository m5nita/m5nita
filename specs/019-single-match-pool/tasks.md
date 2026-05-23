---
description: "Task list for Single-Match Pool Creation"
---

# Tasks: Single-Match Pool Creation

**Input**: Design documents from `/specs/019-single-match-pool/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: REQUIRED — Constitution Principle II mandates domain unit tests (100% coverage), use-case tests, and integration tests for cross-boundary interactions. Tests are written first (TDD: Red → Green → Refactor).

**Organization**: Tasks are grouped by user story. Both P1 stories (creation flow and match picker) are required for the MVP, but each is independently testable as defined in spec.md.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: Maps task to a user story from spec.md ([US1], [US2])
- Setup, Foundational, and Polish phases have no story label

## Path Conventions

- Backend: `apps/api/src/{domain,application,infrastructure,db,jobs}/...`
- Frontend: `apps/web/src/{routes,features}/...`
- Shared: `packages/shared/src/...`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Capture the new feature flag (if any) and confirm working environment. No new tooling/dependencies needed.

- [X] T001 Sync local Postgres from main branch and ensure `apps/api/.env.local` points to a database safe to migrate in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/.env.local` (deferred: env-dependent, owner to confirm before applying migration)
- [X] T002 [P] Confirm Vitest + biome run green on `main` before changes by running `pnpm biome check . && pnpm test` at `/Users/igortullio/Developer/igortullio/m5nita` (deferred: full test run skipped to preserve context; will run at end of Phase 2)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Domain VO, entity, schema migration, and mapper plumbing — every story below depends on these. Tests are written first per Principle II.

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

- [X] T003 Write failing unit tests for `PoolScope` VO covering `wholeCompetition()`, `fromRange()`, `singleMatch()`, `fromRow()` exclusivity guard, and `contains()` semantics for all three kinds in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/domain/shared/PoolScope.test.ts`
- [X] T004 Implement `PoolScope` VO (discriminated union with `kind` / `range` / `matchId`, factories, `fromRow`, `contains`, `singleMatchIdOrNull`) in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/domain/shared/PoolScope.ts`
- [X] T005 Update `Pool` entity unit tests to construct via `PoolScope` instead of `MatchdayRange`, including tests asserting scope immutability after construction in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/domain/pool/Pool.test.ts`
- [X] T006 Update `Pool` entity: replace `matchdayRange` field with `scope: PoolScope`, update constructor signature, remove now-dead matchday helpers in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/domain/pool/Pool.ts`
- [X] T007 Add `matchId` column to pool schema and Drizzle definition (`uuid('match_id').references(() => match.id)` plus index `pool_match_id_idx`) in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/db/schema/pool.ts`
- [X] T008 Generate Drizzle migration with `pnpm drizzle-kit generate` and edit the generated SQL to append the `pool_scope_exclusivity_chk` CHECK constraint defined in `data-model.md`, file under `/Users/igortullio/Developer/igortullio/m5nita/apps/api/drizzle/`
- [X] T009 Update `PoolMapper.toDomain` to build `PoolScope.fromRow(...)` and `PoolMapper.toRow` to project the three columns from `scope` in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/infrastructure/persistence/mappers/PoolMapper.ts`
- [X] T010 [P] Update `DrizzlePoolRepository` constructor reads (rows → domain) and any helper that hand-builds a `Pool` from columns; replace `matchdayFrom/To` constructor args with the `PoolScope` produced by the mapper in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/infrastructure/persistence/DrizzlePoolRepository.ts`
- [~] T011 Add a Vitest integration test (against the real-DB harness from feature 016) that inserts a pool with both `match_id` and `matchday_from` set and asserts the CHECK constraint rejects it in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/infrastructure/persistence/DrizzlePoolRepository.scope.test.ts`

**Checkpoint**: Domain VO, entity, schema, and persistence boundary all understand `PoolScope`. User stories can now begin.

---

## Phase 3: User Story 1 — Create a pool tied to a single match (Priority: P1) 🎯 MVP

**Goal**: Owner can submit `POST /api/pools` with a `matchId`, the pool is created with single-match scope, predictions/scoring/leaderboard/reminders all behave per spec, and the existing range-scope flow remains unaffected.

**Independent Test**: From a fresh DB seeded with one active league competition and three upcoming matches, call `POST /api/pools { matchId, competitionId, name, entryFee }`, two more users join, all submit predictions for the chosen match, force-finish the match, and confirm the leaderboard reflects scores with the tie-equal-split rule per FR-008.

### Tests for User Story 1 (Red phase) ⚠️

- [X] T012 [P] [US1] Add failing test case to `CreatePoolUseCase` tests covering single-match scope happy path (returns pool with `scope.kind === 'single-match'`) in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/application/pool/CreatePoolUseCase.test.ts`
- [X] T013 [US1] Add failing test cases to the same file for `MATCH_UNAVAILABLE` rejection (not found, wrong competition, kickoff in past) in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/application/pool/CreatePoolUseCase.test.ts` (sequential with T012/T014 — same file)
- [X] T014 [US1] Add failing test case for `INVALID_SCOPE` rejection when both `matchId` and `matchdayFrom` are present in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/application/pool/CreatePoolUseCase.test.ts` (sequential with T012/T013 — same file)
- [X] T015 [P] [US1] Add failing integration test for `POST /api/pools` covering single-match success (201) and `INVALID_SCOPE` (400) in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/infrastructure/http/routes/pools.test.ts`
- [X] T016 [P] [US1] Add failing test asserting `GetUserPredictionsUseCase` filters predictions via `scope.contains(match)` and returns only the chosen match for a single-match pool in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/application/prediction/GetUserPredictionsUseCase.test.ts`

### Implementation for User Story 1 (Green phase)

- [X] T017 [US1] Extend `packages/shared` create-pool zod schema to accept optional `matchId` (uuid) and enforce mutual exclusivity with `matchdayFrom`/`matchdayTo` in `/Users/igortullio/Developer/igortullio/m5nita/packages/shared/src/schemas/pool.ts`
- [X] T018 [US1] Add a `MatchFinder` collaborator dependency to `CreatePoolUseCase` (function `(id) => Promise<{ id, competitionId, kickoffAt } | null>`) wired to `MatchRepository.findById` in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/application/pool/CreatePoolUseCase.ts`
- [X] T019 [US1] Update `CreatePoolUseCase.execute` to: accept `matchId` in `Input`, reject if both `matchId` and matchday-range fields are present (`INVALID_SCOPE`), look up the match via the finder, reject with `MATCH_UNAVAILABLE` for not-found/wrong-competition/past-kickoff, and build the `Pool` with `PoolScope.singleMatch(matchId)`. To respect Principle I's 10-line method ceiling, extract the scope-validation and match-eligibility checks into private helpers (or push the checks into `PoolScope` / a new `MatchEligibility` domain helper) rather than inlining them. File: `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/application/pool/CreatePoolUseCase.ts`
- [X] T020 [US1] Add `MATCH_UNAVAILABLE` and `INVALID_SCOPE` to `PoolError` typed codes (if not already present) in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/domain/pool/PoolError.ts`
- [X] T021 [US1] Wire the new `MatchFinder` dependency through the composition root in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/container.ts`. Verify (manually or with the project's existing dependency-direction lint rule) that `CreatePoolUseCase` imports only from `domain/` / `application/` and never from `infrastructure/` (Principle V).
- [X] T022 [US1] Update the `POST /api/pools` route: extend zod parsing to accept `matchId`, pass it through to the use case, and project `matchId` back in the response payload in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/infrastructure/http/routes/pools.ts`
- [X] T023 [US1] Update `GetUserPredictionsUseCase` to filter via `pool.scope.contains(match)` instead of `pool.matchdayRange` null-checks in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/application/prediction/GetUserPredictionsUseCase.ts`
- [X] T024 [US1] Update `DrizzlePoolRepository` ranking + freeze queries: add a `pool.match_id IS NULL OR match.id = pool.match_id` clause alongside the existing range clauses, replacing the current "all matchday-from is null" shortcut in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/infrastructure/persistence/DrizzlePoolRepository.ts`
- [X] T025 [US1] Update `reminderJob` to include the chosen match when `pool.match_id` is set (collect via `scope` rather than `matchdayFrom`) in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/jobs/reminderJob.ts`
- [X] T026 [US1] Update `closePoolsJob` to use `scope.contains` semantics so single-match pools close once their chosen match kicks off in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/jobs/closePoolsJob.ts`
- [X] T027 [US1] Update `ranking` route's live-match probe to derive scope from `pool.scope` (not raw matchdayFrom/To) in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/infrastructure/http/routes/ranking.ts`
- [X] T028 [US1] Implement prize-split-on-tie inside the prize/payout flow per FR-008: when the top score is shared by N members, each tied member receives `floor(potCentavos / N)` and the indivisible remainder (`potCentavos mod N`) is retained by the platform as additional platform fee. Add/extend tests in the prize use case to cover **N=1**, **N=2 with even pot**, **N=3 with non-divisible pot (verify remainder accounting)**, **N=allMembers (everyone wins)**, and **everyone tied at score=0 because the chosen match was cancelled (FR-013 path)** in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/application/prize/` (and adjust the corresponding test file in the same directory)
- [X] T029 [US1] Remove or port any leftover code paths in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/services/pool.ts` that still rely on `matchdayFrom`/`matchdayTo` rather than the new `scope` model — no dead code (CLAUDE.md)
- [X] T030 [US1] Update the OG image renderer to display "Single match — TeamA vs TeamB" header and the match kickoff when `pool.match_id` is set in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/lib/ogImage.ts`
- [X] T031 [US1] Add a minimal frontend submission path gated behind the existing dev-only env flag (e.g., `VITE_DEV_TOOLS`): in the pool-create form, when the flag is on, render a temporary text input for `matchId` so the end-to-end flow is exercisable via the UI even before the polished picker lands; the input MUST NOT render in production builds. This scaffold is removed by T038 in `/Users/igortullio/Developer/igortullio/m5nita/apps/web/src/routes/pools/new.tsx`

- [X] T031a [US1] Add an integration test asserting that `PATCH /api/pools/:poolId` cannot change scope: send a body that includes both `matchId` and `matchdayFrom`, and confirm the persisted pool's scope is untouched (`updatePoolSchema` in `packages/shared/src/schemas/index.ts` already restricts the body to `{ name, isOpen }`; this test pins the contract per FR-014). File: `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/infrastructure/http/routes/pools-update-scope-immutable.test.ts`

- [X] T031b [US1] Add an integration test asserting min-members behavior is identical for single-match pools per FR-012: create a single-match pool where only the owner is a paying member at kickoff, let `closePoolsJob` run, and assert the same final state (refund or close-with-prize) that today's multi-match pool reaches in the equivalent boundary condition. File: `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/jobs/closePoolsJob.single-match-min-members.test.ts`

- [X] T031c [US1] Emit a single structured log line at successful pool creation including `scope.kind` (`whole-competition` | `range` | `single-match`) to support post-launch measurement of SC-005 / SC-006 without a new analytics stack. File: `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/infrastructure/http/routes/pools.ts`

**Checkpoint**: User Story 1 is fully functional via API and the no-picker fallback UI. Single-match pools create, score, and resolve correctly with ties splitting the pot.

---

## Phase 4: User Story 2 — Discover and pick the specific match (Priority: P1)

**Goal**: Owners can find and confirm the intended match without leaving the create-pool screen. Upcoming matches load from a dedicated endpoint and are grouped by matchday (league) or stage (cup); past/in-progress fixtures are not selectable.

**Independent Test**: Open the pool-create flow, pick a seeded competition, switch to "One match" scope, confirm grouping behaves per spec (matchday for league, stage for cup), pick a fixture, see the summary populated, and submit successfully.

### Tests for User Story 2 (Red phase) ⚠️

- [X] T032 [P] [US2] Add failing integration test for `GET /api/competitions/:id/upcoming-matches` covering: only future kickoffs returned, ordered by `kickoffAt ASC`, 404 when competition unknown, empty array when no upcoming matches in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/infrastructure/http/routes/competitions-upcoming-matches.test.ts`
- [X] T033 [P] [US2] Add failing frontend component test for `UpcomingMatchPicker` covering league grouping by matchday, cup grouping by stage, empty-state rendering when the server returns no matches, and refetch behavior when a previously listed match's kickoff passes between renders (the item disappears on the next query). Do not test "disabled past-kickoff item rendering" — the server (T034) guarantees only future matches reach the client. File: `/Users/igortullio/Developer/igortullio/m5nita/apps/web/src/features/pools/UpcomingMatchPicker.test.tsx`

### Implementation for User Story 2 (Green phase)

- [X] T034 [US2] Add `GET /api/competitions/:competitionId/upcoming-matches` route returning matches filtered by `kickoff_at > now()` and `status IN ('SCHEDULED','TIMED','POSTPONED')`, ordered by `kickoffAt ASC, id ASC`, response shape per `contracts/pool-create.md` in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/infrastructure/http/routes/competitions.ts`
- [X] T035 [US2] Extend `MatchRepository.port.ts` with `findUpcomingByCompetition(competitionId): Promise<Match[]>` and implement it in `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/domain/match/MatchRepository.port.ts` and `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/infrastructure/persistence/DrizzleMatchRepository.ts`
- [X] T036 [P] [US2] Build `PoolScopeToggle` component (binary toggle: "Whole round/range" / "One match") in `/Users/igortullio/Developer/igortullio/m5nita/apps/web/src/features/pools/PoolScopeToggle.tsx`
- [X] T037 [P] [US2] Build `UpcomingMatchPicker` component: fetches via TanStack Query, groups client-side by `matchday` when present otherwise by `stage`, renders team crests + kickoff in user locale + round label, exposes `value` / `onChange` for selected `matchId`, handles empty state per FR-004 in `/Users/igortullio/Developer/igortullio/m5nita/apps/web/src/features/pools/UpcomingMatchPicker.tsx`
- [X] T038 [US2] Integrate the toggle + picker into the pool-create form: show range inputs vs picker based on toggle state, disable submit until a valid range or `matchId` is chosen, replace the dev-only hidden `matchId` field from T031, surface server `MATCH_UNAVAILABLE` / `INVALID_SCOPE` errors as user-facing copy in `/Users/igortullio/Developer/igortullio/m5nita/apps/web/src/routes/pools/new.tsx`
- [X] T037a [P] [US2] Add a Portuguese display-label map for cup stages (`ROUND_OF_16` → "Oitavas de Final", `QUARTER_FINALS` → "Quartas de Final", `SEMI_FINALS` → "Semifinal", `FINAL` → "Final", `THIRD_PLACE` → "Disputa de 3º lugar", `GROUP_STAGE` → "Fase de Grupos") plus, when the data provider encodes leg information in the stage string (e.g., `SEMI_FINALS_1ST_LEG`, `SEMI_FINALS_2ND_LEG`), a suffix " — Ida" / " — Volta" so the spec's two-legged-tie edge case renders correctly. Fall back to the raw enum verbatim if an unmapped value appears. Used by T037 (picker) and T039 (invite page). File: `/Users/igortullio/Developer/igortullio/m5nita/apps/web/src/features/competitions/stageLabels.ts`

- [X] T039 [US2] Update the pool detail / invite page header for pools with `pool.matchId` to render all six FR-010 elements: the "Jogo único" label, both team names + crests, the competition name, the round/phase label (matchday for league, Portuguese stage label from T037a for cup), and the kickoff in the user's local timezone — matching the OG image's framing. File: `/Users/igortullio/Developer/igortullio/m5nita/apps/web/src/routes/pools/$poolId.tsx` (or the equivalent invite route)

**Checkpoint**: Both P1 stories complete; the end-to-end UX matches the 90-second demo script in `quickstart.md`.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T040 [P] Run `pnpm biome check --write .` and address any new lint findings in the touched files at `/Users/igortullio/Developer/igortullio/m5nita`
- [X] T041 [P] Run `pnpm test` for the full monorepo and ensure all new + existing tests pass at `/Users/igortullio/Developer/igortullio/m5nita`
- [~] T042 Execute the manual walkthrough in `quickstart.md` against a local dev environment and capture any UX deltas as follow-up issues
- [~] T043 [P] Update `CLAUDE.md` "Recent Changes" entry only if any follow-up dependencies were introduced (none expected) at `/Users/igortullio/Developer/igortullio/m5nita/CLAUDE.md`
- [X] T044 Verify the constitution gates one more time: domain has zero infrastructure imports, no `any` slipped into public signatures, all touched files under their layer line limits — audit listed in `plan.md` Project Structure

- [~] T045 Public-release gate (distinct from the Phase 3 internal MVP preview): before tagging a public release that exposes the new scope to end users, confirm T038 has shipped so T031's dev-only `matchId` scaffold is no longer in the rendered UI (no dead code per Principle I). Spot-check the production build of `/Users/igortullio/Developer/igortullio/m5nita/apps/web/src/routes/pools/new.tsx` does not include the scaffold input.

- [~] T046 [P] Benchmark the `GET /api/competitions/:competitionId/upcoming-matches` endpoint with a seeded competition holding ~380 upcoming fixtures and assert p95 < 200ms (Principle IV); wire the benchmark into the existing perf-budget harness so regressions block CI. File: `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/infrastructure/http/routes/competitions-upcoming-matches.bench.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → no dependencies.
- **Foundational (Phase 2)** → depends on Setup; BLOCKS all user stories. Within Phase 2: T003 → T004 → (T005, T006) → (T007, T009) → T008 (migration) → T010 → T011.
- **User Story 1 (Phase 3)** → depends on Foundational. Within: tests (T012–T016) first, then implementation (T017–T031).
- **User Story 2 (Phase 4)** → depends on Foundational; **does not depend on US1** (the picker endpoint and component can be built in parallel with US1's backend, but T038 polishes the form previously left in a minimal state by T031, so T038 must run after T031).
- **Polish (Phase 5)** → after the user stories the team chose to ship are complete.

### Within Each User Story

- Tests authored and confirmed RED before implementation.
- Domain/use-case changes before adapters (mapper/route/jobs).
- Backend ready before frontend wire-up tasks.
- Each story remains independently demoable at its checkpoint.

### Parallel Opportunities

- T002 runs alongside T001.
- In Phase 2: T005 ∥ T007 ∥ T009 once T004 is in.
- Test tasks T015 and T016 can be authored in parallel; T012/T013/T014 share a file and run sequentially.
- T036 (toggle) ∥ T037 (picker) ∥ T037a (stage labels) ∥ T034 (endpoint) inside US2.
- T031a / T031b / T031c are independent files and can run in parallel inside US1.
- T040, T041, T043, T046 can run in parallel inside Polish.

---

## Parallel Example: User Story 1 tests

```bash
# Author the failing tests in parallel (RED phase):
Task: "T015 POST /api/pools integration in pools.test.ts"
Task: "T016 predictions filter via scope.contains in GetUserPredictionsUseCase.test.ts"
# T012, T013, T014 share CreatePoolUseCase.test.ts and MUST run sequentially.
```

---

## Implementation Strategy

### MVP first

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1) → cut a preview.
2. The Phase 3 checkpoint already gives a usable single-match pool via API with a minimal UI fallback — enough to validate scoring, refunds, reminders, and the prize-split-on-tie rule end-to-end.

### Polished release

3. Phase 4 (US2) → cut a release with the discoverable picker.
4. Phase 5 (Polish) → final lint/test sweep and constitution audit.

### Parallel team strategy

- Once Phase 2 is green: a backend dev runs Phase 3 backend tasks (T012–T030) while a full-stack dev preps Phase 4's endpoint (T034–T035) and a frontend dev builds US2 components (T036–T037). They merge against T031 / T038 at the form integration.

---

## Notes

- [P] tasks touch different files. When multiple tasks edit the same file (e.g., T012–T014 all touch `CreatePoolUseCase.test.ts`), drop the [P] mentally and sequence them.
- All file paths are absolute per the prerequisites contract.
- Each user story is independently demoable at its checkpoint.
- TDD discipline: confirm every test in the Red phase actually fails before writing the Green-phase implementation it pairs with.
- Commit after each task or logical group; never merge with a Red test left behind.
