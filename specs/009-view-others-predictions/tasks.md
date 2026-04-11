---

description: "Task list for feature 009 — View Other Participants' Predictions on Locked Matches"
---

# Tasks: View Other Participants' Predictions on Locked Matches

**Input**: Design documents from `/specs/009-view-others-predictions/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/get-match-predictions.md, quickstart.md

**Tests**: Included. The Manita constitution (Principle II) requires every feature to be backed by tests; this is not optional for this project.

**Organization**: Tasks are grouped by user story. US1 (core list view) is the MVP and is entirely independent. US2 (sort/filter) and US3 (aggregate summary) are incremental polish layers that depend on US1 being shipped.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1, US2, US3
- All paths are absolute from the repo root

## Path Conventions

- API: `apps/api/src/`, tests in `apps/api/src/**/*.test.ts` or `apps/api/tests/`
- Web: `apps/web/src/`
- Shared: `packages/shared/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: This feature plugs into an existing monorepo — no new project initialization is needed. The Setup phase only verifies the dev environment is ready and the working branch is correct.

- [X] T001 Verify working branch is `009-view-others-predictions` and `pnpm install` has been run at repo root so API, web, and shared packages build cleanly (`pnpm --filter @m5nita/api build && pnpm --filter @m5nita/web build && pnpm --filter @m5nita/shared build`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The new shared response/request types must exist before API and web work can proceed. No database migrations are introduced by this feature.

**⚠️ CRITICAL**: T002 blocks every US1 task.

- [X] T002 Add `MatchPredictor`, `MatchNonPredictor`, and `MatchPredictionsResponse` exported interfaces to `packages/shared/src/types/index.ts` following the shape specified in `specs/009-view-others-predictions/data-model.md` (sorting guarantees documented in JSDoc on each field)
- [X] T003 [P] Extend the `PredictionError` error taxonomy in `apps/api/src/services/predictions.ts` with two new codes: `MATCH_NOT_LOCKED` and `MATCH_NOT_IN_POOL`, including pt-BR messages that match the existing error message style

**Checkpoint**: Shared types compile across workspace. API and web can now import them.

---

## Phase 3: User Story 1 — View all participants' predictions for a locked match (Priority: P1) 🎯 MVP

**Goal**: A pool participant can expand a locked match row on the palpites page and see the list of other members' predictions (name · score · points), plus a "N sem palpite" toggle revealing non-predictors. No avatars, rank badges, or lock icons. Viewer's own prediction is not repeated in the list.

**Independent Test**: On the palpites page, tap a locked match row → an inline accordion expands showing other participants' predictions styled identically to the existing match row. Collapsing returns the page to its original layout. Unlocked matches MUST NOT show the expand control. Verified end-to-end via `specs/009-view-others-predictions/quickstart.md` sections 3–4.

### Tests for User Story 1 ⚠️ (write before implementation)

- [X] T004 [P] [US1] Integration test `GET /api/pools/:poolId/matches/:matchId/predictions` happy path (locked finished match, viewer is a pool member, returns predictors sorted by points desc then name, non-predictors sorted by name asc, viewer excluded from both arrays) in `apps/api/src/routes/predictions.test.ts`
- [X] T005 [P] [US1] Integration test — unlocked match returns `409 MATCH_NOT_LOCKED` in `apps/api/src/routes/predictions.test.ts`
- [X] T006 [P] [US1] Integration test — non-member viewer returns `403 NOT_MEMBER` in `apps/api/src/routes/predictions.test.ts`
- [X] T007 [P] [US1] Integration test — unknown match returns `404 MATCH_NOT_FOUND`; match from another competition returns `404 MATCH_NOT_IN_POOL`; unknown pool returns `404 POOL_NOT_FOUND` in `apps/api/src/routes/predictions.test.ts`
- [X] T008 [P] [US1] Integration test — unauthenticated request returns `401 UNAUTHENTICATED` in `apps/api/src/routes/predictions.test.ts`
- [X] T009 [P] [US1] Integration test — finished match with some `prediction.points = null` rows returns those entries with `points: null` (pending scoring) in `apps/api/src/routes/predictions.test.ts`
- [X] T010 [P] [US1] Integration test — `totalMembers === predictors.length + nonPredictors.length + (viewerDidPredict ? 1 : 0)` invariant holds across mixed scenarios in `apps/api/src/routes/predictions.test.ts`
- [ ] T011 [P] [US1] Unit test for `getMatchPredictions` service — mocks DB layer only where necessary, verifies sort order, viewer exclusion, and error taxonomy mapping in `apps/api/src/services/predictions.test.ts`
- [ ] T012 [P] [US1] Web component test — `MatchPredictionsList` renders rows with name · score · points; does not render viewer's row; handles empty predictors array; shows "N sem palpite" collapsed by default; expanding the toggle reveals the non-predictors list — in `apps/web/src/components/prediction/MatchPredictionsList.test.tsx`
- [ ] T013 [P] [US1] Web component test — `ScoreInput` renders the "Ver palpites do bolão ▾" control only for locked matches; clicking it toggles the accordion open/closed; the collapsed state shows the existing row unchanged — in `apps/web/src/components/prediction/ScoreInput.test.tsx`

### Implementation for User Story 1 — API

- [X] T014 [US1] Implement `getMatchPredictions(poolId, matchId, viewerUserId)` in `apps/api/src/services/predictions.ts`: pool membership check, pool/match existence checks, `MATCH_NOT_IN_POOL` scope check, lock predicate (`matchDate <= now() OR status IN ('live','finished')`), then the two queries from `specs/009-view-others-predictions/data-model.md`, shaped into `MatchPredictionsResponse`. Sort predictors `points DESC NULLS LAST, name ASC`; sort non-predictors `name ASC`. Exclude viewer from both arrays.
- [X] T015 [US1] Register the new Hono route `GET /api/pools/:poolId/matches/:matchId/predictions` in `apps/api/src/routes/predictions.ts`, delegating to the service, mapping `PredictionError` codes to HTTP status codes per `specs/009-view-others-predictions/contracts/get-match-predictions.md` (NOT_MEMBER→403, POOL_NOT_FOUND→404, MATCH_NOT_FOUND→404, MATCH_NOT_IN_POOL→404, MATCH_NOT_LOCKED→409)
- [X] T016 [US1] Run `pnpm --filter @m5nita/api test` to confirm all T004–T011 tests pass against the implementation

### Implementation for User Story 1 — Web

- [X] T017 [P] [US1] Create `apps/web/src/components/prediction/MatchPredictionsList.tsx` — accepts a `MatchPredictionsResponse` prop; renders each predictor row as `flex items-center gap-3 py-2` with `font-display text-xs uppercase tracking-wide font-bold` for the name, two `h-8 w-8 border-2 border-border/50` score boxes in the muted/locked style, and `+N pts` (or muted `+0 pts` / "aguardando" for null) on the right. Include a header `font-display text-[10px] font-bold uppercase tracking-widest text-gray-muted` with total count. Append a "N sem palpite ▾" button at the bottom that toggles a second collapsible list using the same row styling (name only, no score/points). NO avatars, rank badges, or lock icons.
- [X] T018 [US1] Modify `apps/web/src/components/prediction/ScoreInput.tsx` — when `isLocked` is true, render a "Ver palpites do bolão ▾" / "Ocultar palpites do bolão ▴" button below the existing status line using the same `font-display text-[10px] font-bold uppercase tracking-widest text-gray-muted` class stack as the other meta text; maintain local `isExpanded` state; when expanded, render the accordion body (passed in as `children` or a new `accordionBody?: ReactNode` prop so the component stays responsibility-focused). Unlocked matches MUST NOT render the button.
- [X] T019 [US1] Create a TanStack Query hook (inline or in `apps/web/src/lib/api.ts` if a hooks file exists, otherwise inline in `predictions.tsx`) with query key `['match-predictions', poolId, matchId]`, `staleTime: 30_000`, `enabled` gated on `isExpanded && isLocked`, fetching `GET /api/pools/:poolId/matches/:matchId/predictions` via `apiFetch`
- [X] T020 [US1] Wire the hook and `MatchPredictionsList` into `apps/web/src/routes/pools/$poolId/predictions.tsx` — pass an `accordionBody` prop through `MatchList → ScoreInput` that, when the row is expanded, fetches via the hook and renders `<MatchPredictionsList data={...} />` or a Loading state (reuse existing `Loading` component). Error state: reuse the pt-BR meta style; show a short "Erro ao carregar palpites" line.
- [ ] T021 [US1] Run `pnpm --filter @m5nita/web test` to confirm T012–T013 pass; run `pnpm dev` and manually walk through `specs/009-view-others-predictions/quickstart.md` sections 3–4 to verify the happy path, the unlocked-match negative case, and the pending-points edge case
- [X] T022 [US1] Run `pnpm biome check --write apps/api/src/routes/predictions.ts apps/api/src/services/predictions.ts apps/web/src/components/prediction/MatchPredictionsList.tsx apps/web/src/components/prediction/ScoreInput.tsx apps/web/src/routes/pools/\$poolId/predictions.tsx packages/shared/src/types/index.ts` to enforce constitution Principle I

**Checkpoint**: US1 is shippable as the MVP. Spec SC-001, SC-002, SC-005 are satisfied. Feature can be demoed and merged without US2 or US3.

---

## Phase 4: User Story 2 — Sort and filter the predictions list (Priority: P2)

**Goal**: Inside the expanded accordion, the user can change the sort order (points desc default, alphabetical asc) via a small control reusing the existing tab-style button pattern from `predictions.tsx`.

**Independent Test**: With the accordion expanded, tap the sort control → the list reorders accordingly; collapse and re-expand → the last chosen sort is remembered for the session (but not persisted across reloads, to keep scope minimal).

### Tests for User Story 2 ⚠️

- [ ] T023 [P] [US2] Web component test — `MatchPredictionsList` accepts a `sort: 'points' | 'name'` prop and reorders rows accordingly; default is `'points'` in `apps/web/src/components/prediction/MatchPredictionsList.test.tsx`

### Implementation for User Story 2

- [ ] T024 [US2] Add a `sort` local state (default `'points'`) and a small inline control in `apps/web/src/components/prediction/MatchPredictionsList.tsx` using the existing tab-style classes from `predictions.tsx` (`font-display text-[11px] font-bold uppercase tracking-wider px-3 py-1.5` with active = `bg-black text-white`, inactive = `text-gray-muted`). Two options: "Pontos" and "Nome". Sort runs client-side on the already-fetched payload; no new API call
- [ ] T025 [US2] Run `pnpm --filter @m5nita/web test` and verify T023 passes

**Checkpoint**: US1 + US2 shippable together or independently.

---

## Phase 5: User Story 3 — Aggregate summary of the group's predictions (Priority: P3)

**Goal**: A short summary bar at the top of the accordion body showing counts of predicted outcomes (home win / draw / away win) and the average predicted score, computed client-side from the existing response payload.

**Independent Test**: With the accordion expanded on a match with multiple predictors, verify the summary shows correct counts matching the list below it and a non-null average score. When all predictors pick the same outcome, the summary clearly reflects unanimity.

### Tests for User Story 3 ⚠️

- [ ] T026 [P] [US3] Web component test — summary bar computes and renders home-win / draw / away-win counts and average score from a `MatchPredictionsResponse` fixture; unanimous case renders a clear "todos" state; empty predictors array renders no summary (or a "sem palpites" state) in `apps/web/src/components/prediction/MatchPredictionsList.test.tsx`

### Implementation for User Story 3

- [ ] T027 [US3] Add a pure helper `summarizePredictions(predictors)` returning `{ home: number, draw: number, away: number, avgHome: number, avgAway: number }` in `apps/web/src/components/prediction/MatchPredictionsList.tsx` (or a colocated utility) — client-side computation, no API change
- [ ] T028 [US3] Render the summary at the top of the accordion body in `MatchPredictionsList.tsx` using `font-display text-[10px] font-bold uppercase tracking-widest text-gray-muted` labels and `font-display text-xs font-black text-black` values, laid out as three small counter cells (home win / draw / away win) plus an average score line. Reuse existing border and spacing tokens; no new ornamental UI.
- [ ] T029 [US3] Run `pnpm --filter @m5nita/web test` and verify T026 passes

**Checkpoint**: All three stories complete and independently deployable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification before merge.

- [ ] T030 [P] Run `specs/009-view-others-predictions/quickstart.md` end-to-end (all 5 sections) against a local dev DB and capture any deviations
- [ ] T031 [P] Confirm no new visual tokens were introduced: grep `apps/web/src/components/prediction/` for any new `bg-`, `text-`, `border-` classes that don't already exist elsewhere in the codebase; revert any ad-hoc styles
- [ ] T032 [P] Run `pnpm biome check .` at repo root and fix any warnings introduced by this feature
- [ ] T033 Run full API and web test suites: `pnpm test`
- [ ] T034 Re-read `specs/009-view-others-predictions/spec.md` Success Criteria and tick each one against the shipped behavior (SC-001 through SC-005). Note any gaps in the PR description.
- [ ] T035 Manual accessibility pass on the accordion: keyboard focus moves into the expand button, Enter/Space toggles, focus is not trapped, screen reader announces the expanded state (`aria-expanded`) — fix any gaps in `apps/web/src/components/prediction/ScoreInput.tsx` and `MatchPredictionsList.tsx`
- [ ] T036 [P] Add a Vitest benchmark in `apps/api/src/services/predictions.bench.ts` that seeds a pool with 200 members, all with predictions for one finished match, and asserts `getMatchPredictions` returns in under 200ms p95 across 50 iterations. Wire the benchmark into the API package test script so CI runs it. Required by constitution II (benchmark tests on performance-sensitive paths) and IV (enforced perf budgets).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → no dependencies
- **Foundational (Phase 2)** → depends on Phase 1; blocks all user stories
- **US1 (Phase 3)** → depends on Phase 2; independent of US2 and US3
- **US2 (Phase 4)** → depends on US1 (extends `MatchPredictionsList.tsx`)
- **US3 (Phase 5)** → depends on US1 (adds to `MatchPredictionsList.tsx`); independent of US2
- **Polish (Phase 6)** → depends on whichever user stories are shipped in this cut

### User Story Dependencies

- **US1 (P1)**: No story dependencies. Fully independent MVP.
- **US2 (P2)**: Touches the same file as US1 (`MatchPredictionsList.tsx`), so sequential with US1 even though logically independent.
- **US3 (P3)**: Same file as US1/US2. Sequential with US1; can be done in parallel with US2 only by different developers coordinating via a shared branch.

### Within Each User Story

- Tests (T004–T013, T023, T026) MUST be written first and MUST fail before their implementation tasks.
- Shared types (Phase 2) MUST be in place before any US1 task runs.
- API service (T014) before API route (T015) before API test green (T016).
- Web component (T017) before web integration (T018 → T019 → T020) before web test green (T021).

### Parallel Opportunities

- **Foundational**: T003 runs in parallel with T002 (different files).
- **US1 tests**: T004–T011 (API integration tests) all touch the same file (`predictions.test.ts`) but can be authored in one session as a batch; T011 (unit test) and T012–T013 (web component tests) are different files → genuinely parallel.
- **US1 implementation**: T014 (API service) and T017 (web component skeleton) are in different files and can be built in parallel by two developers; T015 depends on T014; T018/T019/T020 depend on T017 and the API being reachable.
- **Polish**: T030, T031, T032, T036 are different activities on different surfaces → parallel. T036 depends on T014 (the service must exist before it can be benchmarked).

---

## Parallel Example: User Story 1

```bash
# After T002/T003 (Foundational) land, two developers can fan out:

# Dev A — API track
Task: T014 getMatchPredictions service in apps/api/src/services/predictions.ts
Task: T015 route handler in apps/api/src/routes/predictions.ts
Task: T016 pnpm --filter @m5nita/api test

# Dev B — Web track (can stub the API response or use MSW while Dev A finishes)
Task: T017 MatchPredictionsList component
Task: T018 ScoreInput expand control
Task: T019 TanStack Query hook
Task: T020 Wire into predictions.tsx
Task: T021 pnpm --filter @m5nita/web test + quickstart

# Tests written in parallel up front (if two devs pair on TDD)
Task: T004–T010 API integration tests [P]
Task: T011 API unit test [P]
Task: T012 MatchPredictionsList component test [P]
Task: T013 ScoreInput component test [P]
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002, T003)
3. Complete Phase 3: User Story 1 (T004 – T022)
4. **STOP and VALIDATE**: Run quickstart sections 3–4 end-to-end; confirm spec acceptance scenarios 1–5 for US1.
5. Ship as a self-contained PR — US2 and US3 can land in follow-up PRs.

### Incremental Delivery

1. Setup + Foundational → ready to code.
2. US1 → test → demo → merge (MVP).
3. US2 → small PR adding sort toggle → merge.
4. US3 → small PR adding summary bar → merge.
5. Polish phase runs at the end of each increment (not only the final one).

### Parallel Team Strategy

With two developers:

1. Both land Phase 1 + Phase 2 together.
2. Split US1 into API track (T014–T016) and Web track (T017–T022) — coordinate on the shared types established in T002.
3. Converge on T021 for the end-to-end manual check.
4. One developer can pick up US2, the other US3, once US1 is merged.

---

## Notes

- [P] tasks = different files, no sequential dependency on unfinished tasks.
- Test tasks precede their implementation counterparts and MUST fail first.
- Commit after each checkpoint (end of phase) or each logical pair (test + implementation).
- This feature introduces **zero** database migrations; do not create a Drizzle migration file.
- Avoid re-introducing ornamental UI (avatars, rank badges, lock icons) — the spec explicitly prohibits them (FR-003a).
