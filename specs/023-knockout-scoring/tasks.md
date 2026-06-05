---
description: "Task list for Knockout Scoring (Extra Time & Penalties) + New Global Scoring Scale"
---

# Tasks: Knockout Scoring (Extra Time & Penalties) + New Global Scoring Scale

**Input**: Design documents from `/specs/023-knockout-scoring/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED. Constitution II mandates 100% domain unit coverage and TDD (Red→Green→Refactor); scoring is pure domain, so tests are authored before each rule change.

**Organization**: Grouped by user story (US1 correctness P1 → US2 advance bonus P2 → US3 new scale P3). All scoring rules live in `apps/api/src/domain/` per constitution V and guardrails G2/G3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3

---

## Phase 1: Setup (Shared Contracts)

**Purpose**: Establish a green baseline and the shared TS contract both API and web consume.

- [X] T001 Confirm green baseline: run `pnpm test` and `pnpm biome check .` and record passing state before changes
- [X] T002 [P] Extend shared types in `packages/shared/src/types/index.ts`: add `winner`, `duration`, `extraTimeHomeScore/AwayScore`, `penaltyHomeScore/AwayScore` to the Match type; add `advancePick` and `penaltyBonus` to the Prediction type (all optional/nullable)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Persistence + plumbing for the new fields. BLOCKS US1 and US2 (both need their columns stored). One additive, nullable migration.

**⚠️ CRITICAL**: No user-story persistence works until this phase is complete.

- [X] T003 Add nullable columns to `apps/api/src/db/schema/match.ts` (`extra_time_home_score`, `extra_time_away_score`, `penalty_home_score`, `penalty_away_score` integers; `winner` text; `duration` text) and to `apps/api/src/db/schema/prediction.ts` (`advance_pick` text)
- [X] T004 Generate the migration (`pnpm drizzle-kit generate` → `apps/api/drizzle/0011_*.sql`), then **bump its entry `when` in `apps/api/drizzle/meta/_journal.json` to `1781510900000`** (sequential, above `1781510800000`) so boot-time migrate applies it
- [X] T005 Extend `MatchData`/`UpsertMatchData` and `MatchRepository` (add `winner`, `duration`, `extraTimeHome/Away`, `penaltyHome/Away`; **widen `updateScores(...)` — or add a sibling `updateResult(...)` — to persist winner/duration/extra-time/penalty on finish**, naming the chosen method) in `apps/api/src/domain/match/MatchRepository.port.ts`; add `advancePick` to the prediction repo upsert shape
- [X] T006 Update `apps/api/src/infrastructure/persistence/mappers/MatchMapper.ts` and the prediction repository/mapper to read/write the new columns (row ↔ domain shape)

**Checkpoint**: New columns exist, round-trip through the repos, migration applies cleanly.

---

## Phase 3: User Story 1 - Knockout matches scored on the real scoreline + show who advanced (Priority: P1) 🎯 MVP

**Goal**: Grade knockout matches on regulation+extra-time (never shootout-inflated `fullTime`), capture winner/duration/sub-scores, and display the advancing side and shootout tally.

**Independent Test**: Ingest a `PENALTY_SHOOTOUT` provider response (1–1, 5–4 pens) → stored scoreline is 1–1 (not 6–5), `winner='home'`, `duration='penalty_shootout'`, penalties 5–4; a `1–1` prediction scores exact; result displays "1–1 (5–4 pens, X advances)".

### Tests for User Story 1 ⚠️ (write first, must fail)

- [X] T007 [P] [US1] Unit tests for `KnockoutResult` (gradedScoreline = reg+ET, `decidedByShootout`, `advancingSide`) in `apps/api/src/domain/match/KnockoutResult.test.ts`
- [X] T008 [P] [US1] Unit tests for `isKnockout(stage)` (true for round-of-32…final & third-place; false for group/league) in `apps/api/src/domain/match/MatchStage.test.ts`
- [ ] T009 [P] [US1] Integration test: a `PENALTY_SHOOTOUT` provider payload stores reg+ET as the scoreline (never `fullTime`) plus winner/duration/penalties (apps/api integration suite, e.g. `apps/api/src/application/match/SyncFixturesUseCase.test.ts` or the real-DB harness)

### Implementation for User Story 1

- [X] T010 [P] [US1] Create `apps/api/src/domain/match/MatchStage.ts` with `isKnockout(stage): boolean` (stage ∉ {group, league})
- [X] T011 [P] [US1] Create `apps/api/src/domain/match/KnockoutResult.ts` value object (decision type + winner + reg/extra/penalty sub-scores; `gradedScoreline()`, `decidedByShootout()`, `advancingSide()`)
- [X] T012 [US1] Extend `ExternalMatch.score` in `apps/api/src/application/ports/FootballDataApi.port.ts` with `regularTime`, `extraTime`, `penalties`, and add `winner`, `duration` to the DTO
- [X] T013 [US1] Read the new fields off the raw v4 response in `apps/api/src/infrastructure/external/FootballDataApiAdapter.ts`
- [X] T014 [US1] Map graded scoreline = `regularTime ?? fullTime` (the 90' score; never folding in extra-time/penalty goals, via `gradedScoreline`) and persist winner/duration/sub-scores in `apps/api/src/application/match/SyncFixturesUseCase.ts`
- [X] T015 [US1] Apply the same mapping in `apps/api/src/application/match/SyncLiveScoresUseCase.ts`
- [X] T016 [P] [US1] Apply the same mapping in the legacy mirrors `apps/api/src/services/match.ts` and `apps/api/src/services/matchUtils.ts` (keep behavior consistent; do not reintroduce raw `fullTime` scoring)
- [X] T017 [US1] Persist winner/duration/sub-scores on the finish transition via the repo result-write path (depends on T005/T006)
- [X] T018 [US1] Web: render "1–1 (5–4 pens, <team> advances)" and the reg+ET scoreline wherever match results show, in `apps/web/src/components/prediction/ScoreInput.tsx` / the results view in `apps/web/src/routes/pools/$poolId/predictions.tsx` (+ `apps/web/src/features/competitions/`)

**Checkpoint**: Knockout matches are scored on the correct scoreline and display who advanced — independently shippable.

---

## Phase 4: User Story 2 - Predict who advances on penalties and earn +2 (Priority: P2)

**Goal**: Every knockout prediction carries an "advances on penalties" pick; +2 is awarded only on a real shootout when the pick matches the advancing side. Depends on US1 (needs `winner`/`duration`).

**Independent Test**: Two identical `1–1` predictions, picks home vs away; settle a shootout won by home → home-picker scores exactly 2 more (12 vs 10). A knockout decided in extra time changes nobody's points.

### Tests for User Story 2 ⚠️ (write first, must fail)

- [X] T019 [P] [US2] Unit tests for `PenaltyAdvanceBonus.apply` (shootout × {pick home/away/none} × {home/away advances}; no bonus when not a shootout) in `apps/api/src/domain/scoring/PenaltyAdvanceBonus.test.ts`
- [X] T020 [P] [US2] Unit tests for `ScoringPolicy.score(..., knockout)` on both Range and SingleMatch policies: bonus stacks on base, `breakdown.penaltyBonus` set, totals correct, in `apps/api/src/domain/scoring/ScoringPolicy.test.ts`
- [ ] T021 [P] [US2] Integration test: two equal `1–1` predictions with opposite picks differ by 2 after a shootout settlement (apps/api prediction/ranking suite)

### Implementation for User Story 2

- [X] T022 [US2] Add `PENALTY_ADVANCE_BONUS: 2` to `SCORING` in `packages/shared/src/constants/index.ts`
- [X] T023 [US2] Add `advanceBonus` to `ScoreBreakdown` (default 0) in `apps/api/src/domain/scoring/Score.ts`; create `apps/api/src/domain/scoring/AdvanceBonus.ts` (pure `apply(score, knockout?)`, bonus when `decidedInOvertime` — extra time or penalties)
- [X] T024 [US2] Extend `ScoringPolicy.score` with optional `KnockoutContext`; both `RangeScoringPolicy` and `SingleMatchScoringPolicy` delegate to `AdvanceBonus.apply` in `apps/api/src/domain/scoring/ScoringPolicy.ts`
- [X] T025 [US2] Carry `advancePick` on `Prediction` and pass the knockout context from `calculatePoints` in `apps/api/src/domain/prediction/Prediction.ts`
- [X] T026 [US2] Wire the knockout context (from `isKnockout(stage)` + `winner` + `duration` + `advancePick`) at the scoring call sites: `apps/api/src/services/ranking.ts`, `apps/api/src/jobs/calcPoints.ts`, `apps/api/src/application/prediction/computeLivePoints.ts` (pass `undefined` while live), `apps/api/src/application/prediction/GetUserPredictionsUseCase.ts`, `apps/api/src/application/prediction/GetMatchPredictionsUseCase.ts`. **Verify each read query/row shape actually selects `stage`, `winner`, `duration`, and `advance_pick`** (some use custom row shapes, e.g. `ranking.ts`) so the context is never silently `undefined` and the +2 fires
- [X] T027 [US2] Extend `upsertPredictionSchema` with optional `advancePick` (`'home'|'away'`) in `packages/shared/src/schemas/index.ts`; in `apps/api/src/infrastructure/http/routes/predictions.ts` + `apps/api/src/application/prediction/UpsertPredictionUseCase.ts`, store it only for knockout matches (drop to null otherwise)
- [X] T028 [US2] Persist `advancePick` through the prediction upsert (use case + repo) and include it + `penaltyBonus` in prediction read responses (`GetUserPredictionsUseCase`, `GetMatchPredictionsUseCase`)
- [X] T029 [US2] Web: show the "who advances" radio for **every** knockout match (gated by `isKnockout(stage)`, pre-kickoff — not on whether it will reach a shootout), editable until kickoff and **locked at kickoff exactly like the scoreline** (reuse the existing `isLocked` rule); surface `penaltyBonus` in the breakdown — in `apps/web/src/components/prediction/ScoreInput.tsx` and `apps/web/src/routes/pools/$poolId/predictions.tsx`

**Checkpoint**: Advance pick submittable before kickoff; +2 lands only on real shootouts; ties between equal draws are broken.

---

## Phase 5: User Story 3 - Refined 5-tier scale on every match (Priority: P3)

**Goal**: Replace 10/7/5/0 with 10/8/7/5/0 (exact → winner+winner's goals → winner+diff → result → miss), globally, forward-only. Independent of US1/US2.

**Independent Test**: For a 2–0 result, predictions 2–0/2–1/3–1/1–0/0–0 score 10/8/7/5/0; for 1–1, 1–1/0–0/decisive score 10/5/0.

### Tests for User Story 3 ⚠️ (write first, must fail)

- [X] T030 [P] [US3] Rewrite/extend the truth-table tests for `Score.calculate` (decisive 2–0 and draw 1–1, both home/away symmetric) in `apps/api/src/domain/scoring/Score.test.ts`
- [X] T031 [P] [US3] Update expectations in `apps/api/src/domain/scoring/SingleMatchScore.test.ts`, `apps/api/src/application/prediction/computeLivePoints.test.ts`, and `apps/api/src/jobs/calcPoints.test.ts` for the new 8 tier

### Implementation for User Story 3

- [X] T032 [US3] Add `WINNER_AND_WINNER_GOALS: 8` to `SCORING` in `packages/shared/src/constants/index.ts`
- [X] T033 [US3] Rewrite `Score.calculate` to the ordered 5-tier ladder (exact → winner+winner's-goals → winner+diff → result → miss) in `apps/api/src/domain/scoring/Score.ts`, **extracting small private helpers (e.g. `sameDecisiveWinner`, `winnerGoalsMatch`) so the method stays flat and within the constitution's method-size/cognitive-complexity limits (Principle I)**
- [X] T034 [US3] Confirm `SingleMatchScore` base category inherits the new tiers (delegates to `Score.calculate`); update the user-facing **scale** explainers to 10/8/7/5/0: `apps/web/src/routes/how-it-works.tsx`, `apps/web/src/components/landing/ScoringMini.tsx` (+ `apps/web/src/components/landing/ScoringMini.test.tsx`), and the landing demo point values in `apps/web/src/components/landing/mocks.ts` / `DemoPredict.tsx` / `DemoLiveRanking.tsx` (add a "winner + winner's goals (8)" row/example)

**Checkpoint**: Every match grades on the new scale; near-misses differentiated.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T035 [P] Run `pnpm check:leaks` (G2) and the `apps/api/src/_architecture.test.ts` (G3) to confirm the new rules live in `domain/` with no layer leaks; fix or annotate intentional exemptions
- [X] T036 [P] Add the **knockout / pênaltis** explanation (advance pick, +2 bonus, scoreline = tempo normal + prorrogação excluindo pênaltis) to the user-facing scoring docs — `apps/web/src/routes/how-it-works.tsx` (new mata-mata section) and the in-prediction help text `apps/web/src/components/prediction/ScoreInput.tsx` — in Portuguese, consistent with the 10/8/7/5/0 scale
- [ ] T037 Run the `quickstart.md` end-to-end validation (steps 1–5) and confirm each Success Criterion
- [X] T038 Full gate: `pnpm test`, `pnpm biome check --write .`, and typecheck all green

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)**: no deps.
- **Foundational (P2)**: after Setup. BLOCKS US1 and US2 persistence.
- **US1 (P3)**: after Foundational. MVP — independently shippable.
- **US2 (P4)**: after Foundational; depends on US1 for `winner`/`duration`.
- **US3 (P5)**: after Foundational; **fully independent** of US1/US2 (pure scale change) — may be pulled earlier if desired.
- **Polish (P6)**: after the desired stories.

### Story independence notes

- US3's behavior is independent of US2: US2's worked examples use exact-draw (10), correct-draw (5), and miss (0) — all unchanged by the new 8/7 tiers — so the two can land in any order.
- US3 and US2 both edit `Score.ts` and `constants/index.ts`; sequence them (no cross-story [P] on those files).

### Within each story

- Tests (Txxx) authored and failing before implementation (TDD).
- Domain VOs before use cases; use cases before routes/UI.

### Parallel opportunities

- T002 (Setup) is [P].
- US1: T007/T008/T009 (tests) in parallel; T010/T011 (VOs) in parallel; T016 [P] (legacy mirror) independent of T014/T015.
- US2: T019/T020/T021 (tests) in parallel.
- US3: T030/T031 (tests) in parallel.
- Polish: T035/T036 in parallel.

---

## Implementation Strategy

### MVP (US1 only)

Setup → Foundational → US1 → **STOP & VALIDATE** (knockout matches scored correctly and show who advanced). This alone fixes the World Cup knockout correctness bug and is deployable.

### Incremental delivery

US1 (correctness) → US2 (advance bonus, the engagement headline) → US3 (global scale refinement). Each is an independently testable, deployable increment.

---

## Notes

- All values in centavos elsewhere, but scoring points are plain integers.
- Forward-only: do **not** add any backfill/recompute task; settlement uses the new rules only for matches finished after deploy.
- Keep the legacy `services/` mirrors in lockstep with the application use cases (T016) or the guardrails/tests will diverge.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
