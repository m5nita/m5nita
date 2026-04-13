# Implementation Plan: Migração para Arquitetura Hexagonal com SOLID

**Branch**: `010-hexagonal-architecture` | **Date**: 2026-04-12 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/011-hexagonal-architecture/spec.md`

## Summary

Migrar a API backend (`apps/api/src/`) de uma arquitetura service-based para arquitetura hexagonal com três camadas (domain, application, infrastructure), value objects para primitivos de domínio, entidades com comportamento, ports/adapters para repositórios e serviços externos, e use cases para orquestração. A migração é incremental — cada fase mantém a API funcionando e os 116+ testes passando.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js >= 20)
**Primary Dependencies**: Hono (HTTP), Drizzle ORM, Better Auth, grammY (Telegram), Stripe SDK
**Storage**: PostgreSQL 16 via Drizzle ORM
**Testing**: Vitest
**Target Platform**: Node.js server (Linux)
**Project Type**: Web service (API backend)
**Performance Goals**: API responses < 200ms p95
**Constraints**: Zero downtime durante migração; API contract inalterado
**Scale/Scope**: ~63 arquivos TypeScript, 116 testes, 12 schemas Drizzle

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | ✅ PASS | Value objects encapsulam primitivos; SRP em classes < 50 linhas; métodos < 10 linhas |
| II. Testing Standards | ✅ PASS | Domain layer terá 100% coverage; TDD para value objects; mocks limitados a ports |
| III. UX Consistency | ✅ PASS | Refactoring interno — nenhuma mudança na interface do usuário |
| IV. Performance Requirements | ✅ PASS | SC-006 garante < 20% degradação; queries Drizzle permanecem otimizadas |
| V. Hexagonal Architecture | ✅ PASS | Este é o princípio que estamos implementando; plano segue todas as regras |

## Project Structure

### Documentation (this feature)

```text
specs/011-hexagonal-architecture/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0: research decisions
├── data-model.md        # Phase 1: domain model design
├── quickstart.md        # Phase 1: how to run/test
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/api/src/
├── domain/                              # Layer 0: zero external deps
│   ├── shared/                          # Cross-domain value objects
│   │   ├── Money.ts
│   │   ├── EntryFee.ts
│   │   ├── InviteCode.ts
│   │   ├── PoolStatus.ts
│   │   ├── MatchdayRange.ts
│   │   └── PixKey.ts
│   ├── scoring/
│   │   └── Score.ts                     # Value object (replaces services/scoring.ts)
│   ├── pool/
│   │   ├── Pool.ts                      # Entity with behavior
│   │   ├── PoolError.ts                 # Domain error
│   │   └── PoolRepository.port.ts       # Repository interface
│   ├── prediction/
│   │   ├── Prediction.ts                # Entity with behavior
│   │   ├── PredictionError.ts           # Domain error
│   │   └── PredictionRepository.port.ts
│   ├── match/
│   │   └── MatchRepository.port.ts      # Simplified (no entity)
│   └── prize/
│       ├── PrizeCalculation.ts          # Domain service
│       ├── PrizeWithdrawalError.ts      # Domain error
│       └── PrizeWithdrawalRepository.port.ts
│
├── application/                         # Layer 1: depends only on domain
│   ├── pool/
│   │   ├── CreatePoolUseCase.ts
│   │   ├── JoinPoolUseCase.ts
│   │   ├── CancelPoolUseCase.ts
│   │   ├── GetPoolDetailsUseCase.ts
│   │   └── GetUserPoolsUseCase.ts
│   ├── prediction/
│   │   ├── UpsertPredictionUseCase.ts
│   │   ├── GetUserPredictionsUseCase.ts
│   │   └── GetMatchPredictionsUseCase.ts
│   ├── prize/
│   │   ├── GetPrizeInfoUseCase.ts
│   │   └── RequestWithdrawalUseCase.ts
│   ├── scoring/
│   │   └── CalcPointsUseCase.ts
│   ├── match/
│   │   ├── SyncFixturesUseCase.ts
│   │   └── SyncLiveScoresUseCase.ts
│   └── ports/                           # External service abstractions
│       ├── PaymentGateway.port.ts
│       ├── FootballDataApi.port.ts
│       └── NotificationService.port.ts
│
├── infrastructure/                      # Layer 2: implements ports
│   ├── persistence/
│   │   ├── DrizzlePoolRepository.ts
│   │   ├── DrizzlePredictionRepository.ts
│   │   ├── DrizzlePrizeWithdrawalRepository.ts
│   │   ├── DrizzleRankingRepository.ts
│   │   ├── DrizzleMatchRepository.ts
│   │   └── mappers/
│   │       ├── PoolMapper.ts
│   │       ├── PredictionMapper.ts
│   │       └── MatchMapper.ts
│   ├── external/
│   │   ├── StripePaymentGateway.ts
│   │   ├── MockPaymentGateway.ts
│   │   ├── FootballDataApiAdapter.ts
│   │   └── TelegramNotificationService.ts
│   └── http/                            # Hono routes (moved last)
│       ├── routes/
│       │   ├── pools.ts
│       │   ├── predictions.ts
│       │   ├── ranking.ts
│       │   ├── matches.ts
│       │   ├── competitions.ts
│       │   ├── users.ts
│       │   ├── webhooks.ts
│       │   └── telegram.ts
│       └── middleware/
│           ├── auth.ts
│           └── rateLimit.ts
│
├── container.ts                         # Composition root (manual DI)
├── db/ (unchanged)                      # Drizzle schemas
├── jobs/ (refactored to call use cases)
├── lib/ (unchanged — config/setup)
└── types/ (unchanged)
```

**Structure Decision**: Hexagonal three-layer structure within `apps/api/src/`. The `domain/` layer contains pure TypeScript with zero dependencies. The `application/` layer defines use cases and external service ports. The `infrastructure/` layer implements all ports with concrete adapters (Drizzle, Stripe, Telegram, Hono). Routes, middleware, and jobs remain as infrastructure entry points. Existing `db/schema/`, `lib/`, and `types/` directories are unchanged.

## Migration Phases

### Phase 1: Value Objects + Score (US1 partial — foundation)

**Goal**: Create all value objects and replace `services/scoring.ts` with `Score` value object.

**Files to create**:
- `apps/api/src/domain/shared/Money.ts`
- `apps/api/src/domain/shared/EntryFee.ts`
- `apps/api/src/domain/shared/InviteCode.ts`
- `apps/api/src/domain/shared/PoolStatus.ts`
- `apps/api/src/domain/shared/MatchdayRange.ts`
- `apps/api/src/domain/shared/PixKey.ts`
- `apps/api/src/domain/scoring/Score.ts`
- Tests for each value object (TDD)

**Files to modify**:
- `apps/api/src/jobs/calcPoints.ts` → use `Score.calculate()`

**Files to delete**:
- `apps/api/src/services/scoring.ts` (replaced by `Score.ts`)
- `apps/api/src/services/__tests__/scoring.test.ts` (replaced by domain tests)

**Reusable existing code**:
- `packages/shared/src/constants/index.ts` — SCORING constants consumed by `Score`
- `services/scoring.ts:3-31` — algorithm logic moves into `Score.calculate()`
- `services/pool.ts:9-16` — `generateInviteCode()` moves into `InviteCode.generate()`

### Phase 2: Pool Domain + Repository (US1 complete + US2 partial)

**Goal**: Create Pool entity with behavior, extract queries into repository.

**Files to create**:
- `apps/api/src/domain/pool/Pool.ts`
- `apps/api/src/domain/pool/PoolError.ts`
- `apps/api/src/domain/pool/PoolRepository.port.ts`
- `apps/api/src/infrastructure/persistence/DrizzlePoolRepository.ts`
- `apps/api/src/infrastructure/persistence/mappers/PoolMapper.ts`

**Files to modify**:
- `apps/api/src/services/pool.ts` → delegates to repository (transitional)

**Reusable existing code**:
- `services/pool.ts:210-218` — `PoolError` class moves to domain
- `services/pool.ts:18-91` — `createPool()` business logic → Pool entity + use case
- `services/pool.ts:93-127` — `getUserPools()` query → repository

### Phase 3: Pool Use Cases + PaymentGateway Port (US3 + US4 partial)

**Goal**: Complete hexagonal architecture for Pool domain.

**Files to create**:
- `apps/api/src/application/pool/CreatePoolUseCase.ts`
- `apps/api/src/application/pool/JoinPoolUseCase.ts`
- `apps/api/src/application/pool/CancelPoolUseCase.ts`
- `apps/api/src/application/pool/GetPoolDetailsUseCase.ts`
- `apps/api/src/application/pool/GetUserPoolsUseCase.ts`
- `apps/api/src/application/ports/PaymentGateway.port.ts`
- `apps/api/src/infrastructure/external/StripePaymentGateway.ts`
- `apps/api/src/infrastructure/external/MockPaymentGateway.ts`
- `apps/api/src/container.ts`

**Files to modify**:
- `apps/api/src/routes/pools.ts` → import use cases from container

**Files to delete**:
- `apps/api/src/services/pool.ts` (absorbed into use cases + repository)

### Phase 4: Prediction Domain (US1-US3 for Prediction)

**Goal**: Full hexagonal treatment for Prediction.

**Files to create**:
- `apps/api/src/domain/prediction/Prediction.ts`
- `apps/api/src/domain/prediction/PredictionError.ts`
- `apps/api/src/domain/prediction/PredictionRepository.port.ts`
- `apps/api/src/infrastructure/persistence/DrizzlePredictionRepository.ts`
- `apps/api/src/infrastructure/persistence/mappers/PredictionMapper.ts`
- `apps/api/src/application/prediction/UpsertPredictionUseCase.ts`
- `apps/api/src/application/prediction/GetUserPredictionsUseCase.ts`
- `apps/api/src/application/prediction/GetMatchPredictionsUseCase.ts`

**Files to modify**:
- `apps/api/src/routes/predictions.ts` → use cases from container
- `apps/api/src/container.ts` → add prediction wiring

**Files to delete**:
- `apps/api/src/services/prediction.ts`

### Phase 5: Prize + Ranking + Notifications (US3-US4 complete)

**Goal**: Complete remaining complex domains.

**Files to create**:
- `apps/api/src/domain/prize/PrizeCalculation.ts`
- `apps/api/src/domain/prize/PrizeWithdrawalError.ts`
- `apps/api/src/domain/prize/PrizeWithdrawalRepository.port.ts`
- `apps/api/src/infrastructure/persistence/DrizzlePrizeWithdrawalRepository.ts`
- `apps/api/src/infrastructure/persistence/DrizzleRankingRepository.ts`
- `apps/api/src/application/prize/GetPrizeInfoUseCase.ts`
- `apps/api/src/application/prize/RequestWithdrawalUseCase.ts`
- `apps/api/src/application/ports/NotificationService.port.ts`
- `apps/api/src/infrastructure/external/TelegramNotificationService.ts`

**Files to modify**:
- `apps/api/src/routes/pools.ts` (prize endpoints) → use cases
- `apps/api/src/container.ts` → add prize/ranking wiring

**Files to delete**:
- `apps/api/src/services/prizeWithdrawal.ts`
- `apps/api/src/services/ranking.ts`

### Phase 6: Match Sync + Jobs (US4 complete)

**Goal**: Abstract external API and refactor jobs to call use cases.

**Files to create**:
- `apps/api/src/domain/match/MatchRepository.port.ts`
- `apps/api/src/application/ports/FootballDataApi.port.ts`
- `apps/api/src/application/match/SyncFixturesUseCase.ts`
- `apps/api/src/application/match/SyncLiveScoresUseCase.ts`
- `apps/api/src/application/scoring/CalcPointsUseCase.ts`
- `apps/api/src/infrastructure/persistence/DrizzleMatchRepository.ts`
- `apps/api/src/infrastructure/persistence/mappers/MatchMapper.ts`
- `apps/api/src/infrastructure/external/FootballDataApiAdapter.ts`

**Files to modify**:
- `apps/api/src/jobs/calcPoints.ts` → call CalcPointsUseCase
- `apps/api/src/jobs/closePoolsJob.ts` → call use cases via container
- `apps/api/src/jobs/reminderJob.ts` → call via container
- `apps/api/src/container.ts` → add match/scoring wiring

**Files to delete**:
- `apps/api/src/services/match.ts`
- `apps/api/src/services/matchUtils.ts` (absorbed into MatchMapper or domain)

### Phase 7: Reorganização Final (US5 validation)

**Goal**: Move routes/middleware to infrastructure/http/, cleanup.

**Files to move**:
- `apps/api/src/routes/*` → `apps/api/src/infrastructure/http/routes/*`
- `apps/api/src/middleware/*` → `apps/api/src/infrastructure/http/middleware/*`

**Files to delete**:
- Empty `apps/api/src/services/` directory
- Empty `apps/api/src/routes/` directory
- Empty `apps/api/src/middleware/` directory

**Files to modify**:
- `apps/api/src/index.ts` → update import paths
- All route files → update relative imports

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Repository pattern adds indirection | Enables testing domain logic without DB; enables mocking; satisfies Constitution V (DIP) | Direct Drizzle calls in services couples business logic to persistence |
| Value objects add classes for primitives | Encapsulates validation and behavior at boundaries; prevents primitive obsession (Constitution I, V) | Raw primitives leak invalid state and scatter validation logic |
| Mappers between domain and persistence | Domain entities must not depend on Drizzle types (Constitution V); enables independent evolution | Sharing Drizzle types in domain violates dependency rule |
