# Tasks: Migração para Arquitetura Hexagonal com SOLID

**Input**: Design documents from `/specs/011-hexagonal-architecture/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: TDD approach — domain tests are written as part of implementation tasks (test first, then implement). Constitution mandates 100% domain coverage.

**Organization**: Tasks follow the 7 migration phases from plan.md, mapped to user stories from spec.md.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US5)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Directory Structure)

**Purpose**: Create the hexagonal directory structure

- [ ] T000 Measure API performance baseline: run representative endpoint requests (create pool, get predictions, get ranking) and record p95 response times for SC-006 comparison after migration
- [x] T001 Create domain layer directories: `apps/api/src/domain/shared/`, `apps/api/src/domain/scoring/`, `apps/api/src/domain/pool/`, `apps/api/src/domain/prediction/`, `apps/api/src/domain/match/`, `apps/api/src/domain/prize/`
- [x] T002 [P] Create application layer directories: `apps/api/src/application/pool/`, `apps/api/src/application/prediction/`, `apps/api/src/application/prize/`, `apps/api/src/application/scoring/`, `apps/api/src/application/match/`, `apps/api/src/application/ports/`
- [x] T003 [P] Create infrastructure layer directories: `apps/api/src/infrastructure/persistence/mappers/`, `apps/api/src/infrastructure/external/`, `apps/api/src/infrastructure/http/routes/`, `apps/api/src/infrastructure/http/middleware/`

**Checkpoint**: Directory structure ready — value object implementation can begin

---

## Phase 2: User Story 1 — Lógica de domínio isolada e testável (Priority: P1) 🎯 MVP

**Goal**: Create all value objects and domain entities with TDD. Replace `services/scoring.ts`.

**Independent Test**: Run `pnpm --filter api vitest run src/domain/` — all domain tests pass in < 50ms with zero infrastructure deps.

### Value Objects (domain/shared/)

- [x] T004 [P] [US1] Create Money value object with TDD tests in `apps/api/src/domain/shared/Money.ts` — factory `Money.of(centavos)`, methods: `percentage(rate)`, `subtract(other)`, `splitEqual(parts)`, `equals(other)`. Validation: non-negative integer
- [x] T005 [P] [US1] Create EntryFee value object with TDD tests in `apps/api/src/domain/shared/EntryFee.ts` — factory `EntryFee.of(centavos)`, validation: 100 <= centavos <= 100000, methods: `platformFee(rate)`, `effectiveFee(discountPercent)`
- [x] T006 [P] [US1] Create InviteCode value object with TDD tests in `apps/api/src/domain/shared/InviteCode.ts` — factory `InviteCode.generate()` and `InviteCode.from(value)`, charset: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, length: 8. Move logic from `services/pool.ts:9-16`
- [x] T007 [P] [US1] Create PoolStatus value object with TDD tests in `apps/api/src/domain/shared/PoolStatus.ts` — static instances: `Pending`, `Active`, `Closed`, `Cancelled`, factory `PoolStatus.from(value)`, methods: `canClose()`, `canCancel()`, `canJoin()`, `canAcceptPredictions()`
- [x] T008 [P] [US1] Create MatchdayRange value object with TDD tests in `apps/api/src/domain/shared/MatchdayRange.ts` — factory `MatchdayRange.create(from, to)` returns `MatchdayRange | null`, validation: both set or both null, from <= to, method: `contains(matchday)`
- [x] T009 [P] [US1] Create PixKey value object with TDD tests in `apps/api/src/domain/shared/PixKey.ts` — factory `PixKey.create(type, value)`, validation per type (CPF=11 digits, Email=valid, Phone=+55, Random=UUID), method: `masked()` hides all but last 4 chars. Move `maskPixKey()` from `services/prizeWithdrawal.ts:196-199`

### Score Value Object

- [x] T010 [P] [US1] Create Score value object with TDD tests in `apps/api/src/domain/scoring/Score.ts` — factory `Score.calculate(predictedHome, predictedAway, actualHome, actualAway)`, uses constants from `@m5nita/shared`. Exact=10, WinnerAndDiff=7, Outcome=5, Miss=0. Getter: `isExact`. Move logic from `services/scoring.ts:3-31`

### Domain Entities

- [x] T011 [US1] Create Pool entity with TDD tests in `apps/api/src/domain/pool/Pool.ts` — constructor receives value objects (EntryFee, InviteCode, PoolStatus, MatchdayRange). Methods: `activate()`, `close()`, `cancel()`, `canJoin()`, `canAcceptPredictions()`, `isOwnedBy(userId)`, `calculatePrize(memberCount, effectiveFeeRate)`, `calculatePlatformFee(effectiveFeeRate)` (depends on T004, T005, T006, T007, T008)
- [x] T012 [P] [US1] Create PoolError domain error in `apps/api/src/domain/pool/PoolError.ts` — move from `services/pool.ts:210-218`
- [x] T013 [P] [US1] Create Prediction entity with TDD tests in `apps/api/src/domain/prediction/Prediction.ts` — method: `calculatePoints(actualHome, actualAway)` uses Score. Static: `canSubmit(matchDate)` (depends on T010)
- [x] T014 [P] [US1] Create PredictionError domain error in `apps/api/src/domain/prediction/PredictionError.ts` — move from `services/prediction.ts:10-18`
- [x] T015 [P] [US1] Create PrizeCalculation domain service with TDD tests in `apps/api/src/domain/prize/PrizeCalculation.ts` — static methods: `calculatePrizeTotal(entryFee, memberCount, effectiveFeeRate)`, `calculateWinnerShare(prizeTotal, winnerCount)` (depends on T004)
- [x] T016 [P] [US1] Create PrizeWithdrawalError domain error in `apps/api/src/domain/prize/PrizeWithdrawalError.ts` — move from `services/prizeWithdrawal.ts:11-19`

### Integration with existing code

- [x] T017 [US1] Update `apps/api/src/jobs/calcPoints.ts` to use `Score.calculate()` instead of `calculatePoints()` from services/scoring (depends on T010)
- [x] T018 [US1] Delete `apps/api/src/services/scoring.ts` and `apps/api/src/services/__tests__/scoring.test.ts` — replaced by domain Score value object (depends on T017)
- [x] T019 [US1] Run full test suite (`pnpm test`) and verify all 116+ tests pass, typecheck passes, lint passes

**Checkpoint**: All value objects and domain entities tested. `services/scoring.ts` removed. Domain layer has zero infrastructure imports.

---

## Phase 3: User Story 2 — Acesso a dados desacoplado via repositórios (Priority: P2)

**Goal**: Define repository port interfaces and implement Drizzle adapters. Extract queries from services.

**Independent Test**: Existing endpoints return identical responses after swapping direct Drizzle calls for repository implementations.

### Repository Ports (domain layer)

- [x] T020 [P] [US2] Define PoolRepository port interface in `apps/api/src/domain/pool/PoolRepository.port.ts` — methods: findById, findByInviteCode, findActiveByCompetition, save, updateStatus, getMemberCount, isMember, addMember, removeMember, findUserPools
- [x] T021 [P] [US2] Define PredictionRepository port interface in `apps/api/src/domain/prediction/PredictionRepository.port.ts` — methods: findByUserPoolMatch, findByUserPool, findByPoolMatch, save, updatePoints, findByMatch
- [x] T022 [P] [US2] Define PrizeWithdrawalRepository port interface in `apps/api/src/domain/prize/PrizeWithdrawalRepository.port.ts` — methods: findByPoolAndUser, createWithPayment
- [x] T023 [P] [US2] Define MatchRepository port interface in `apps/api/src/domain/match/MatchRepository.port.ts` — methods: findById, findByCompetition, findLive, upsertMany, updateScores

### Mappers (infrastructure layer)

- [x] T024 [P] [US2] Create PoolMapper in `apps/api/src/infrastructure/persistence/mappers/PoolMapper.ts` — static methods `toDomain(row)` and `toPersistence(entity)`, converts Drizzle row types to Pool entity with value objects (depends on T011)
- [x] T025 [P] [US2] Create PredictionMapper in `apps/api/src/infrastructure/persistence/mappers/PredictionMapper.ts` — static methods `toDomain(row)` and `toPersistence(entity)` (depends on T013)
- [x] T026 [P] [US2] Create MatchMapper in `apps/api/src/infrastructure/persistence/mappers/MatchMapper.ts` — static methods for mapping, absorb status/stage mapping logic from `services/matchUtils.ts`

### Drizzle Repository Adapters

- [x] T027 [US2] Implement DrizzlePoolRepository in `apps/api/src/infrastructure/persistence/DrizzlePoolRepository.ts` — implements PoolRepository port, extract queries from `services/pool.ts:93-208`. Uses PoolMapper (depends on T020, T024)
- [x] T028 [US2] Implement DrizzlePredictionRepository in `apps/api/src/infrastructure/persistence/DrizzlePredictionRepository.ts` — implements PredictionRepository port, extract queries from `services/prediction.ts:79-182`. Uses PredictionMapper (depends on T021, T025)
- [x] T029 [US2] Implement DrizzlePrizeWithdrawalRepository in `apps/api/src/infrastructure/persistence/DrizzlePrizeWithdrawalRepository.ts` — implements PrizeWithdrawalRepository port, extract transaction logic from `services/prizeWithdrawal.ts:144-184` (depends on T022)
- [x] T030 [US2] Implement DrizzleRankingRepository in `apps/api/src/infrastructure/persistence/DrizzleRankingRepository.ts` — extract ranking SQL query from `services/ranking.ts`, expose via simple interface (depends on T020)
- [x] T031 [US2] Implement DrizzleMatchRepository in `apps/api/src/infrastructure/persistence/DrizzleMatchRepository.ts` — implements MatchRepository port, extract queries from `services/match.ts` (depends on T023, T026)

### Transitional integration

- [x] T032 [US2] Refactor `apps/api/src/services/pool.ts` to delegate queries to DrizzlePoolRepository while keeping the same public API (transitional step) (depends on T027)
- [x] T033 [US2] Refactor `apps/api/src/services/prediction.ts` to delegate queries to DrizzlePredictionRepository while keeping the same public API (depends on T028)
- [x] T034 [US2] Run full test suite (`pnpm test`) and verify all tests pass with repository delegation

**Checkpoint**: All database access goes through repositories. Services are thin wrappers. API responses identical.

---

## Phase 4: User Story 3 — Fluxos de negócio orquestrados por use cases (Priority: P3)

**Goal**: Create use cases for Pool, Prediction, and Prize. Wire via container. Routes call use cases.

**Independent Test**: Routes import from `container.ts` and call use cases. No direct service imports in routes.

### External Service Ports

- [ ] T035 [P] [US3] Define PaymentGateway port interface in `apps/api/src/application/ports/PaymentGateway.port.ts` — methods: createCheckoutSession, refund, isConfigured
- [ ] T036 [P] [US3] Define NotificationService port interface in `apps/api/src/application/ports/NotificationService.port.ts` — methods: notifyWinners, notifyAdminWithdrawalRequest, sendPredictionReminders
- [ ] T037 [P] [US3] Define FootballDataApi port interface in `apps/api/src/application/ports/FootballDataApi.port.ts` — methods: fetchMatches, fetchLiveMatches

### External Service Adapters

- [ ] T038 [US3] Implement StripePaymentGateway in `apps/api/src/infrastructure/external/StripePaymentGateway.ts` — implements PaymentGateway port, extract Stripe logic from `services/payment.ts` (depends on T035)
- [ ] T039 [P] [US3] Implement MockPaymentGateway in `apps/api/src/infrastructure/external/MockPaymentGateway.ts` — implements PaymentGateway port for dev mode, extract mock logic from `services/payment.ts` (depends on T035)
- [ ] T040 [US3] Implement TelegramNotificationService in `apps/api/src/infrastructure/external/TelegramNotificationService.ts` — implements NotificationService port, extract from `lib/telegram.ts` notification functions (depends on T036)

### Pool Use Cases

- [ ] T041 [US3] Create CreatePoolUseCase in `apps/api/src/application/pool/CreatePoolUseCase.ts` — orchestrates: validate coupon, create Pool entity, save via repository, create payment via gateway. Single `execute()` method (depends on T011, T020, T035)
- [ ] T042 [P] [US3] Create JoinPoolUseCase in `apps/api/src/application/pool/JoinPoolUseCase.ts` — orchestrates: verify pool open, check not already member, create payment (depends on T020, T035)
- [ ] T043 [P] [US3] Create CancelPoolUseCase in `apps/api/src/application/pool/CancelPoolUseCase.ts` — orchestrates: verify ownership, check no prize payments, refund all members, cancel pool (depends on T011, T020, T035)
- [ ] T044 [P] [US3] Create GetPoolDetailsUseCase in `apps/api/src/application/pool/GetPoolDetailsUseCase.ts` — orchestrates: load pool, count members, calculate prize total (depends on T020)
- [ ] T045 [P] [US3] Create GetUserPoolsUseCase in `apps/api/src/application/pool/GetUserPoolsUseCase.ts` — delegates to repository findUserPools (depends on T020)

### Prediction Use Cases

- [ ] T046 [US3] Create UpsertPredictionUseCase in `apps/api/src/application/prediction/UpsertPredictionUseCase.ts` — orchestrates: verify pool status, check membership, verify match not started, save prediction (depends on T013, T020, T021)
- [ ] T047 [P] [US3] Create GetUserPredictionsUseCase in `apps/api/src/application/prediction/GetUserPredictionsUseCase.ts` — load pool, filter by competition/matchday range (depends on T020, T021)
- [ ] T048 [P] [US3] Create GetMatchPredictionsUseCase in `apps/api/src/application/prediction/GetMatchPredictionsUseCase.ts` — verify lock status, return predictors/non-predictors (depends on T020, T021)

### Prize Use Cases

- [ ] T049 [US3] Create GetPrizeInfoUseCase in `apps/api/src/application/prize/GetPrizeInfoUseCase.ts` — orchestrates: verify pool closed, get ranking, calculate prize, check winner, load existing withdrawal (depends on T015, T020, T022, T030)
- [ ] T050 [US3] Create RequestWithdrawalUseCase in `apps/api/src/application/prize/RequestWithdrawalUseCase.ts` — orchestrates: verify eligibility, validate PixKey, calculate share, create withdrawal+payment, notify admin (depends on T009, T015, T020, T022, T030, T036)

### Composition Root & Route Migration

- [ ] T051 [US3] Create composition root in `apps/api/src/container.ts` — instantiate all repositories, gateways, and use cases. Export use case instances for routes to import (depends on T027-T031, T038-T040, T041-T050)
- [ ] T052 [US3] Refactor `apps/api/src/routes/pools.ts` to import use cases from container instead of services. Map domain errors to HTTP status codes (depends on T051)
- [ ] T053 [US3] Refactor `apps/api/src/routes/predictions.ts` to import use cases from container instead of services (depends on T051)
- [ ] T054 [US3] Delete `apps/api/src/services/pool.ts` and `apps/api/src/services/__tests__/pool.test.ts` — absorbed into use cases + repository (depends on T052)
- [ ] T055 [US3] Delete `apps/api/src/services/prediction.ts` and `apps/api/src/services/__tests__/prediction.test.ts` — absorbed into use cases + repository (depends on T053)
- [ ] T056 [US3] Delete `apps/api/src/services/prizeWithdrawal.ts` and `apps/api/src/services/__tests__/prizeWithdrawal.test.ts` — absorbed into use cases + repository (depends on T052)
- [ ] T057 [US3] Delete `apps/api/src/services/ranking.ts` — absorbed into DrizzleRankingRepository (depends on T052)
- [ ] T058 [US3] Run full test suite (`pnpm test`) and verify all tests pass with use case architecture

**Checkpoint**: Routes call use cases. No direct service imports in routes. All services for Pool/Prediction/Prize deleted.

---

## Phase 5: User Story 4 — Serviços externos abstraídos por ports (Priority: P4)

**Goal**: Abstract match sync and refactor jobs to call use cases via container.

**Independent Test**: Jobs call use cases. Mock payment works in dev. No direct service imports in jobs.

### Match Use Cases

- [ ] T059 [US4] Implement FootballDataApiAdapter in `apps/api/src/infrastructure/external/FootballDataApiAdapter.ts` — implements FootballDataApi port, extract API calls from `services/match.ts` (depends on T037)
- [ ] T060 [US4] Create SyncFixturesUseCase in `apps/api/src/application/match/SyncFixturesUseCase.ts` — orchestrates: fetch from FootballDataApi, upsert via MatchRepository, trigger CalcPointsUseCase on finish (depends on T023, T037)
- [ ] T061 [US4] Create SyncLiveScoresUseCase in `apps/api/src/application/match/SyncLiveScoresUseCase.ts` — orchestrates: fetch live scores, update via MatchRepository, trigger points calc and pool close (depends on T023, T037)
- [ ] T062 [US4] Create CalcPointsUseCase in `apps/api/src/application/scoring/CalcPointsUseCase.ts` — load predictions for match, calculate Score for each, update points via repository (depends on T010, T021, T023)

### Jobs Refactoring

- [ ] T063 [US4] Refactor `apps/api/src/jobs/calcPoints.ts` to call CalcPointsUseCase from container (depends on T051, T062)
- [ ] T064 [US4] Refactor `apps/api/src/jobs/closePoolsJob.ts` to call use cases from container (pool close + notification) (depends on T051, T040)
- [ ] T065 [US4] Refactor `apps/api/src/jobs/reminderJob.ts` to call NotificationService port from container (depends on T051, T040)

### Service Cleanup

- [ ] T066 [US4] Delete `apps/api/src/services/match.ts` and `apps/api/src/services/__tests__/match.test.ts` — absorbed into use cases + adapters (depends on T060, T061)
- [ ] T067 [US4] Delete `apps/api/src/services/matchUtils.ts` — absorbed into MatchMapper (depends on T026, T066)
- [ ] T068 [US4] Update `apps/api/src/container.ts` with match/scoring/notification wiring (depends on T059-T062)
- [ ] T069 [US4] Run full test suite (`pnpm test`) and verify all tests pass

**Checkpoint**: All external services abstracted behind ports. Jobs delegate to use cases. No direct service files remain (except competition, coupon, payment which stay simplified).

---

## Phase 6: User Story 5 — Migração transparente sem quebra de API (Priority: P5)

**Goal**: Move routes/middleware to infrastructure/http/, final cleanup, validate zero API breakage.

**Independent Test**: All 116+ tests pass. No `services/` directory for migrated domains. Domain layer has zero infra imports.

### Reorganization

- [ ] T070 [US5] Move route files from `apps/api/src/routes/` to `apps/api/src/infrastructure/http/routes/` — pools.ts, predictions.ts, ranking.ts, matches.ts, competitions.ts, users.ts, webhooks.ts, telegram.ts
- [ ] T071 [US5] Move middleware files from `apps/api/src/middleware/` to `apps/api/src/infrastructure/http/middleware/` — auth.ts, rateLimit.ts
- [ ] T072 [US5] Update `apps/api/src/index.ts` to import routes and middleware from new `infrastructure/http/` paths (depends on T070, T071)
- [ ] T073 [US5] Update all internal imports in moved route/middleware files to reflect new relative paths (depends on T070, T071)
- [ ] T074 [US5] Remove empty `apps/api/src/routes/`, `apps/api/src/middleware/`, and `apps/api/src/services/` directories (depends on T072, T073)

### Final Validation

- [ ] T075 [US5] Run full test suite (`pnpm test`) — all 116+ tests must pass
- [ ] T076 [US5] Run typecheck (`pnpm -r typecheck`) — zero errors
- [ ] T077 [US5] Run lint (`pnpm biome check .`) — zero lint errors
- [ ] T078 [US5] Verify domain layer isolation: `grep -r "from 'drizzle\|from 'hono\|from 'stripe" apps/api/src/domain/` returns zero results
- [ ] T079 [US5] Verify no service imports in routes: `grep -r "from '.*services/" apps/api/src/infrastructure/http/routes/` returns zero results for migrated domains

**Checkpoint**: Migration complete. Hexagonal architecture fully in place. All tests pass. API contract unchanged.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final improvements that affect multiple user stories

- [ ] T080 [P] Run `pnpm biome check --write .` to auto-fix any formatting issues
- [ ] T081 Run quickstart.md validation — follow all steps in `specs/011-hexagonal-architecture/quickstart.md` and verify they work
- [ ] T082 Verify SC-002: domain tests run in < 50ms (`pnpm --filter api vitest run src/domain/`)
- [ ] T083 Verify SC-004: no infrastructure imports in domain layer
- [ ] T084 Verify SC-005: each use case has single `execute()` method and constructor injection
- [ ] T085 Verify SC-003: run `vitest --coverage` on `apps/api/src/domain/` and confirm 100% coverage for entities, value objects, and domain services
- [ ] T086 Verify SC-006: re-run performance baseline from T000 and confirm < 20% degradation on all measured endpoints

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **US1 Domain (Phase 2)**: Depends on Setup — creates all value objects and entities
- **US2 Repositories (Phase 3)**: Depends on US1 — needs entities for mappers
- **US3 Use Cases (Phase 4)**: Depends on US2 — needs repositories for orchestration
- **US4 External Ports (Phase 5)**: Depends on US3 — needs container for wiring
- **US5 Reorganization (Phase 6)**: Depends on US4 — moves routes after all migrations done
- **Polish (Phase 7)**: Depends on US5 — final validation

### Within Each Phase

- Value objects marked [P] can all be created in parallel (T004-T010)
- Repository ports marked [P] can be defined in parallel (T020-T023)
- Mappers marked [P] can be created in parallel (T024-T026)
- Use cases within a domain can be parallel when not interdependent

### Parallel Opportunities

```text
# Phase 2: All value objects in parallel
T004, T005, T006, T007, T008, T009, T010 — 7 parallel tasks

# Phase 2: Domain errors in parallel
T012, T014, T016 — 3 parallel tasks

# Phase 3: All port interfaces in parallel
T020, T021, T022, T023 — 4 parallel tasks

# Phase 3: All mappers in parallel
T024, T025, T026 — 3 parallel tasks

# Phase 4: External service ports in parallel
T035, T036, T037 — 3 parallel tasks

# Phase 4: Independent use cases in parallel
T042, T043, T044, T045 — 4 parallel pool use cases
T047, T048 — 2 parallel prediction use cases
```

---

## Implementation Strategy

### MVP First (Phase 2 Only — Value Objects + Score)

1. Complete Phase 1: Setup directories
2. Complete Phase 2: Value objects + entities + Score replacement
3. **STOP and VALIDATE**: Domain tests pass in < 50ms, zero infra imports
4. This alone delivers US1 value — isolated, testable domain logic

### Incremental Delivery

1. Phase 1 (Setup) + Phase 2 (US1) → Domain layer exists, Score migrated
2. Phase 3 (US2) → Repositories abstract all DB access
3. Phase 4 (US3) → Use cases orchestrate, container wires everything
4. Phase 5 (US4) → External services abstracted, jobs refactored
5. Phase 6 (US5) → Final reorganization, full validation
6. Phase 7 (Polish) → Success criteria verification

Each phase is independently deployable — the API works identically after each.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Tests are integrated into implementation tasks (TDD: write test, then implement)
- Commit after each completed phase
- Stop at any checkpoint to validate independently
- Services for Competition, Coupon, and Payment remain simplified (no entity/use case treatment)
