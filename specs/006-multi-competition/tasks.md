# Tasks: Multi-Competition Support

**Input**: Design documents from `/specs/006-multi-competition/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Required by project constitution (Principle II: 80%+ coverage on new code).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema changes, shared types, and migration that all stories depend on

- [x] T001 Create competition schema in `apps/api/src/db/schema/competition.ts` with fields: id (UUID PK), externalId (text), name (text), season (text), type (text, "cup"|"league"), status (text, default "active"), createdAt, updatedAt. Unique constraint on (externalId, season). Indexes on externalId and status.
- [x] T002 Add `competitionId` (UUID FK to competition.id, nullable initially) column to match table in `apps/api/src/db/schema/match.ts`. Add index on competitionId.
- [x] T003 Add `competitionId` (UUID FK to competition.id, nullable initially), `matchdayFrom` (integer, nullable), `matchdayTo` (integer, nullable) columns to pool table in `apps/api/src/db/schema/pool.ts`. Add index on competitionId.
- [x] T004 Add `'league'` to `MATCH.STAGES` array in `packages/shared/src/constants/index.ts`. Add `COMPETITION` constant object with `TYPES: ['cup', 'league'] as const` and `STATUSES: ['active', 'finished'] as const`.
- [x] T005 [P] Update `MatchStage` type in `packages/shared/src/types/index.ts` to include `'league'`. Add `Competition` type with id, externalId, name, season, type, status. Add `CompetitionType = 'cup' | 'league'` and `CompetitionStatus = 'active' | 'finished'`. Update `Pool` and `PoolDetail` types to include competitionId, competitionName, matchdayFrom, matchdayTo. Update `Match` type to include competitionId.
- [x] T006 [P] Update `createPoolSchema` in `packages/shared/src/schemas/index.ts` to add required `competitionId` (UUID string), optional `matchdayFrom` (integer, min 1), optional `matchdayTo` (integer, min 1). Add validation: if matchdayFrom is set, matchdayTo must also be set and matchdayFrom <= matchdayTo.
- [x] T007 Add competition relations in `apps/api/src/db/schema/relations.ts`: competition has many matches, competition has many pools. Update matchRelations to add `competition: one(competition, ...)`. Update poolRelations to add `competition: one(competition, ...)`.
- [x] T008 Export competition schema from `apps/api/src/db/schema/index.ts` (or wherever schemas are barrel-exported). Ensure Drizzle picks up the new table.
- [x] T009 Run `pnpm drizzle-kit generate` to create the migration. Then manually edit the generated SQL migration to: (1) create competition table, (2) insert WC seed record, (3) add nullable competitionId to match and pool, (4) UPDATE match/pool SET competitionId = WC_ID, (5) ALTER competitionId to NOT NULL. Run `pnpm drizzle-kit migrate` to apply.

**Checkpoint**: Database schema updated, migration applied, shared types/schemas ready.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Competition service and Telegram admin commands that all user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T010 Create competition service in `apps/api/src/services/competition.ts` with functions: `createCompetition(externalId, name, season, type)` — validates uniqueness, creates record; `listCompetitions()` — returns all competitions; `getActiveCompetitions()` — returns active competitions with count of upcoming matches and matchday info (min/max/next); `deactivateCompetition(externalId, season)` — sets status to "finished"; `getCompetitionById(id)` — returns single competition.
- [x] T011 Create competition routes in `apps/api/src/routes/competitions.ts` with `GET /api/competitions` — returns active competitions with matchCount, upcomingMatchCount, and for league competitions a `matchdays` object with min/max/nextMatchday (calls `getActiveCompetitions()`). Register route in `apps/api/src/index.ts`. This data is needed by the pool creation UI (T024).
- [x] T012 Add Telegram bot commands in `apps/api/src/lib/telegram.ts`: `/competicao_criar CODE "Name" SEASON TYPE` — parse args, call createCompetition, respond with success/error; `/competicao_listar` — call listCompetitions, format as text table; `/competicao_desativar CODE SEASON` — call deactivateCompetition. Follow existing coupon command pattern (isAdmin check, error handling).

- [x] T012a [P] Write unit tests for competition service in `apps/api/src/tests/services/competition.test.ts`: test createCompetition (success, duplicate rejection), listCompetitions, getActiveCompetitions (filters inactive, returns matchday info), deactivateCompetition. Use real DB (no mocks per constitution).

**Checkpoint**: Admin can create/list/deactivate competitions via Telegram. API serves active competitions list.

---

## Phase 3: User Story 1 - Admin Registers a Competition (Priority: P1) MVP

**Goal**: Admin can register competitions via Telegram and match fixtures sync automatically for all active competitions.

**Independent Test**: Send `/competicao_criar PD "La Liga" 2025 league` via Telegram, wait for sync cycle, verify La Liga matches appear in DB with competitionId and stage="league".

### Tests for User Story 1

- [x] T012b [P] [US1] Write unit tests for match sync in `apps/api/src/tests/services/match.test.ts`: test `mapStageForCompetition()` returns 'league' for league-type competitions and correct cup stages for cup competitions. Test `syncFixtures()` iterates all active competitions. Test rate limiting delay between competition calls.
- [x] T012c [P] [US1] Write unit test for `calculatePoints()` in `apps/api/src/tests/services/scoring.test.ts`: verify scoring works identically for matches with stage='league' as for stage='group'/'final' (FR-013 validation).

### Implementation for User Story 1

- [x] T013 [US1] Refactor `syncFixtures()` in `apps/api/src/services/match.ts`: instead of hardcoded `/competitions/WC/matches?season=2026`, query all active competitions from DB, iterate each one calling `/competitions/{externalId}/matches?season={season}`. Add 6-second delay between competition API calls for rate limiting. Pass competition to `upsertMatches()`.
- [x] T014 [US1] Refactor `upsertMatches()` in `apps/api/src/services/match.ts`: accept `competitionId` and `competitionType` parameters. When inserting/updating matches, set `competitionId`. When competition type is "league", override `mapStage()` to return "league" instead of mapping API stage.
- [x] T015 [US1] Refactor `syncLiveScores()` in `apps/api/src/services/match.ts`: query active competitions, for each one fetch LIVE and FINISHED matches using `/competitions/{externalId}/matches?status=LIVE` and `/competitions/{externalId}/matches?status=FINISHED&dateFrom=...&dateTo=...`. Add 6-second delay between competition calls. Keep calling existing `closePoolsIfAllMatchesFinished()` for now (will be refactored to `checkAndClosePools()` in T028).
- [x] T016 [US1] Update `mapStage()` in `apps/api/src/services/match.ts`: add "REGULAR_SEASON" -> "league" mapping. Add `mapStageForCompetition(stage, competitionType)` function that returns "league" for all stages when competitionType is "league", otherwise uses existing mapStage.

**Checkpoint**: Fixtures sync for all active competitions. La Liga matches get stage="league" and correct matchday. World Cup matches unchanged.

---

## Phase 4: User Story 2 - Pool Creation with Competition Selection (Priority: P1)

**Goal**: Pool owners select a competition and optional matchday range when creating a pool.

**Independent Test**: Create a pool selecting La Liga with matchday 30-30, verify pool record has competitionId and matchday range, verify only matchday 30 matches appear in predictions.

### Tests for User Story 2

- [x] T016a [P] [US2] Write integration test for pool creation with competition in `apps/api/src/tests/routes/pools.test.ts`: test creating pool with valid competitionId succeeds, creating pool with invalid competitionId fails, creating pool with matchdayFrom > matchdayTo fails, creating pool with matchdayFrom but no matchdayTo fails.
- [x] T016b [P] [US2] Write unit test for scoped predictions in `apps/api/src/tests/services/prediction.test.ts`: test getUserPredictions only returns matches within the pool's competition and matchday range.

### Implementation for User Story 2

- [x] T017 [US2] Update `createPool()` in `apps/api/src/services/pool.ts`: accept `competitionId`, `matchdayFrom`, `matchdayTo` parameters. Validate that competitionId exists and is active. Store these fields on the pool record.
- [x] T018 [US2] Update `POST /api/pools` in `apps/api/src/routes/pools.ts`: extract `competitionId`, `matchdayFrom`, `matchdayTo` from parsed body. Pass to `createPool()`. Include `competitionName` in response.
- [x] T019 [US2] Update `getUserPools()` in `apps/api/src/services/pool.ts`: join with competition table to include `competitionName` in returned pool list items.
- [x] T020 [US2] Update `GET /api/pools/:poolId` in `apps/api/src/routes/pools.ts` (or pool service): include competition info (competitionId, competitionName, matchdayFrom, matchdayTo) in pool detail response.
- [x] T021 [US2] Update `GET /api/pools/invite/:inviteCode` in `apps/api/src/routes/pools.ts`: include competitionName, matchdayFrom, matchdayTo in invite info response.
- [x] T022 [US2] Update `getUserPredictions()` in `apps/api/src/services/prediction.ts`: when fetching matches for a pool's predictions, filter by `match.competitionId = pool.competitionId`. If pool has matchdayFrom/matchdayTo, also filter `match.matchday BETWEEN matchdayFrom AND matchdayTo`.
- [x] T023 [US2] Update `GET /api/matches` in `apps/api/src/routes/matches.ts`: add optional `competitionId` query parameter. When provided, filter matches by competitionId.
- [x] T024 [US2] Update pool creation UI in `apps/web/src/routes/pools/create.tsx`: add competition selector (fetch from `GET /api/competitions`). When a league competition is selected, show matchday range selector (from/to number inputs using competition's matchday info). Pass competitionId, matchdayFrom, matchdayTo in create request.

**Checkpoint**: Pools can be created with competition + matchday selection. Predictions are scoped to pool's competition/matchday range.

---

## Phase 5: User Story 3 - Match Sync for Multiple Competitions (Priority: P1)

**Goal**: Match sync handles multiple competitions independently, with correct stage assignment and rate limiting.

**Independent Test**: Register both La Liga and World Cup, trigger sync, verify matches from both have correct competitionId and stage values.

### Implementation for User Story 3

Note: Most sync logic was already implemented in US1 (T013-T016). This phase handles remaining edge cases and integration.

- [x] T025 [US3] Verify `getActiveCompetitions()` in `apps/api/src/services/competition.ts` returns accurate match counts and matchday info when multiple competitions are active simultaneously. Ensure data is correct after syncing both La Liga and World Cup fixtures.
- [x] T026 [US3] Handle football-data.org API errors per-competition in `apps/api/src/services/match.ts`: if one competition fails to sync (rate limit, network error), log the error and continue with next competition. Don't let one failure block all syncs.
- [x] T027 [US3] Update `GET /api/matches/live` in `apps/api/src/routes/matches.ts`: optionally accept `competitionId` query param to filter live matches by competition.

**Checkpoint**: Multiple competitions sync independently with proper error isolation and rate limiting.

---

## Phase 6: User Story 4 - Pool Closes When Its Matches Finish (Priority: P2)

**Goal**: Pools close based on their specific scope (competition + matchday range), not globally.

**Independent Test**: Create two pools for different competitions, finish all matches of one competition, verify only that pool closes while the other stays active.

### Tests for User Story 4

- [x] T027a [P] [US4] Write unit test for `checkAndClosePools()` in `apps/api/src/tests/jobs/closePoolsJob.test.ts`: test pool with all matches finished closes, pool with unfinished matches stays open, pool with postponed match stays open, two pools for different competitions close independently, pool with matchday range only considers matches in range.

### Implementation for User Story 4

- [x] T028 [US4] Rewrite `closePoolsIfAllMatchesFinished()` in `apps/api/src/jobs/closePoolsJob.ts`: rename to `checkAndClosePools()`. For each active pool: (1) get pool's competitionId and matchday range, (2) query matches where competitionId matches AND matchday is within range (or all matchdays if range is null), (3) check if ALL such matches have status='finished' (postponed/cancelled matches are NOT 'finished', so they block pool closing until rescheduled and completed or status changes), (4) if yes, close that pool, calculate rankings, notify winners. Process pools sequentially.
- [x] T029 [US4] Update `syncLiveScores()` in `apps/api/src/services/match.ts`: replace the call to `closePoolsIfAllMatchesFinished()` (added in T015) with the new `checkAndClosePools()` from T028. This triggers per-pool scope checking instead of the global check.
- [x] T030 [US4] Update `sendPredictionReminders()` in `apps/api/src/jobs/reminderJob.ts`: when finding members without predictions for upcoming matches, scope to the pool's competition and matchday range. Only remind about matches within the pool's scope.

**Checkpoint**: Pools close independently based on their competition/matchday scope. Reminders are scoped correctly.

---

## Phase 7: User Story 5 - Data Migration (Priority: P1)

**Goal**: Existing matches and pools are auto-migrated to a "Copa do Mundo 2026" competition record.

**Independent Test**: Run migration on DB with existing data, verify all matches and pools have competitionId pointing to the auto-created WC competition.

### Implementation for User Story 5

Note: The core migration was already handled in T009 (Phase 1). This phase validates and handles edge cases.

- [x] T031 [US5] Update seed file `apps/api/src/db/seed.ts`: include a competition record for "Copa do Mundo 2026" (code WC, season 2026, type cup). Update seed matches to reference the competition. Update seed pool to reference the competition.
- [x] T032 [US5] Verify migration handles edge case: if migration runs on empty DB (no existing matches/pools), the WC competition record is still created for future use.

**Checkpoint**: Migration is safe and complete. Existing data preserved with correct competition associations.

---

## Phase 8: User Story 6 - End-to-End Test with La Liga (Priority: P2)

**Goal**: Full end-to-end validation with real La Liga data and real Stripe payment.

**Independent Test**: Complete the full flow: register La Liga, create pool with R$1, predict, wait for real results, verify scoring and prize withdrawal.

### Implementation for User Story 6

- [x] T033 [US6] Update frontend pool detail page in `apps/web/src/routes/pools/$poolId.tsx` (or equivalent): display competition name and matchday range in pool header. Ensure match list shows only matches within pool's scope.
- [x] T034 [US6] Update frontend pool list in `apps/web/src/routes/index.tsx` (or pool list component): show competition name alongside pool name.
- [x] T035 [US6] Update invite page in `apps/web/src/routes/invite/$inviteCode.tsx` (or equivalent): show competition name and matchday info so invitees understand what they're joining.
- [x] T036 [US6] Manual e2e test: register La Liga via Telegram (`/competicao_criar PD "La Liga" 2025 league`), wait for sync, create pool with R$1 and upcoming matchday, share invite, make predictions, verify results after matchday completes.

**Checkpoint**: Full system validated with real data and real payments.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, performance, and documentation

- [x] T037 [P] Run `pnpm biome check --write .` to fix linting/formatting across all changed files
- [x] T038 [P] Add competitionId index optimization: verify query plans for match and pool queries filtered by competitionId perform well
- [x] T039 Run quickstart.md verification checklist against the deployed system
- [x] T040 Update CLAUDE.md if needed with new competition-related patterns or commands

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 (schema must exist for service/routes)
- **Phase 3 (US1 - Competition Registration)**: Depends on Phase 2
- **Phase 4 (US2 - Pool Creation)**: Depends on Phase 2 + Phase 3 (needs competitions to exist)
- **Phase 5 (US3 - Multi-Competition Sync)**: Depends on Phase 3 (extends sync logic)
- **Phase 6 (US4 - Pool Closing)**: Depends on Phase 4 (needs competition-scoped pools)
- **Phase 7 (US5 - Migration)**: Can run in parallel with Phase 3 (migration in T009 already done in Phase 1)
- **Phase 8 (US6 - E2E Test)**: Depends on ALL previous phases
- **Phase 9 (Polish)**: Depends on all implementation phases

### User Story Dependencies

```
US5 (Migration) ─────────────────────────────────────────┐
                                                          │
US1 (Registration) ──> US2 (Pool Creation) ──> US4 (Close)├──> US6 (E2E)
                   └──> US3 (Multi Sync) ────────────────┘
```

### Within Each User Story

- Schema/types before services
- Services before routes
- Routes before UI
- Backend before frontend

### Parallel Opportunities

**Phase 1**: T004, T005, T006 can run in parallel (different files in packages/shared)
**Phase 2**: T010, T012, T012a can start in parallel (service, telegram, tests are independent files)
**Phase 3**: T012b, T012c can run in parallel (different test files)
**Phase 4**: T016a, T016b can run in parallel; T017-T023 (backend) before T024 (frontend)
**Phase 6**: T027a runs before T028 (test-first per constitution)
**Phase 9**: T037 and T038 can run in parallel

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 + 5)

1. Complete Phase 1: Setup (schema + types + migration)
2. Complete Phase 2: Foundational (competition service + Telegram commands)
3. Complete Phase 3: US1 (competition registration + fixture sync)
4. Complete Phase 4: US2 (pool creation with competition selection)
5. Complete Phase 7: US5 (migration validation)
6. **STOP and VALIDATE**: Create a La Liga competition, create a pool, verify predictions work

### Full Delivery

7. Complete Phase 5: US3 (multi-sync edge cases)
8. Complete Phase 6: US4 (scoped pool closing)
9. Complete Phase 8: US6 (real e2e test with La Liga round)
10. Complete Phase 9: Polish

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- All monetary values in centavos (BRL)
- football-data.org La Liga code: "PD", World Cup code: "WC"
