# Implementation Plan: Real-Database Integration Tests

**Branch**: `016-integration-tests-real-db` | **Date**: 2026-04-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/016-integration-tests-real-db/spec.md`

## Summary

Introduce a new integration-test layer that drives the real Hono API against a real Postgres database (one DB per Vitest worker, snapshot-reset per test), exercising the same HTTP routes the PWA calls. All third-party providers (InfinitePay, Better Auth OAuth/magic-link/OTP transport, Telegram, Resend, Turnstile, football-data) are replaced with in-process stubs. To make time-sensitive scenarios deterministic, we introduce a `Clock` port in the domain and migrate the call sites that participate in covered journeys. The suite runs on every PR, blocks merge on failure, completes under 3 minutes on the existing CI runner, and on failure uploads a structured "failure bundle" (scenario rows as JSON + recorded stub calls + last HTTP pair) as a CI artifact.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js ≥ 20 (monorepo root `.nvmrc`)
**Primary Dependencies**: Vitest 3.1 (existing), Hono 4.7, Drizzle ORM 0.41, postgres.js 3.4, Better Auth 1.5 (with phone-number plugin), grammY 1.41, Resend 6, mercadopago 2, stripe 22, `undici` (already bundled via Node 20 for `fetch` interception). **New**: `msw` 2.x (network-level stub library) — chosen to intercept `fetch`/`undici` calls to InfinitePay, Google OAuth, Resend, Turnstile and football-data at the HTTP boundary without touching application code.
**Storage**: PostgreSQL 16 — the existing `postgres-test` service in `docker-compose.yml` (port 5433) and the same image already used by CI (`ci.yml` > `services.postgres`). Template-database cloning (`CREATE DATABASE x TEMPLATE t`) is the reset mechanism.
**Testing**: Vitest in parallel mode with `poolOptions.threads`. One dedicated Postgres database per worker (name derived from `VITEST_POOL_ID`), cloned from a pre-migrated template before each test. A new Vitest "project" lives at `apps/api/tests/integration/` with its own `vitest.config.ts` and setup file; the existing unit-test project is untouched.
**Target Platform**: CI runner (Ubuntu latest, current `test` job in `.github/workflows/ci.yml`) and local developer machines (macOS + Linux) with Docker for the Postgres test container.
**Project Type**: Monorepo (pnpm workspaces) — backend `apps/api`, frontend `apps/web`, shared `packages/shared`. This feature only touches `apps/api` and CI config.
**Performance Goals**: Whole suite ≤ 3 minutes wall-clock on the current CI runner (SC-003). Per-test DB reset via `CREATE DATABASE … TEMPLATE` measured at ~50-150ms on Postgres 16 — sufficient headroom for 20–30 scenarios across 4 workers.
**Constraints**: Zero outbound network during a run (FR-003). Tests must call real HTTP routes (FR-004) and the real auth endpoints for session creation (FR-005, spec clarification Q4). No test-only endpoints in production builds. No forged sessions. Money always asserted in centavos (FR-011, SC-008).
**Scale/Scope**: 6 P1 + 2 P2 + 1 P3 user journeys with ~3-6 scenarios each → ~25 scenarios at release. Suite must stay green across 10 consecutive CI runs (SC-002) and catch ≥ 95% of injected regressions (SC-007). Production code changes limited to: (a) introducing the `Clock` port and migrating the time-sensitive call sites in covered journeys, (b) wiring the container to accept injected dependencies for testing.

## Constitution Check

*GATE: evaluated against the Manita Constitution v1.2.0 before Phase 0 and re-evaluated after Phase 1.*

| Principle | Evaluation |
|---|---|
| **I. Code Quality** | **PASS.** Test code is held to the same standards (methods ≤ 10 lines, value objects where applicable, no dead code, no commented blocks). The `Clock` port and `SystemClock` adapter follow SRP. Test helpers live in small focused modules (auth-helper, stub registry, db-reset, test-clock) instead of a god-object. |
| **II. Testing Standards** | **PASS — directly advances the principle.** Constitution §II: "Integration tests MUST verify all cross-boundary interactions: API contracts, database queries, external service calls." This feature *is* that layer. Determinism: enforced via per-worker DB + template reset + Clock port. Naming pattern `[unit]_[scenario]_[expectedResult]` applies to integration-test names. Flakiness: zero tolerance is codified in SC-002. |
| **III. UX Consistency** | **N/A.** This is a developer-facing feature with no user surface. |
| **IV. Performance** | **PASS with explicit budget.** 3-minute wall-clock budget enforced as a CI step (fails the job if exceeded). No production API response-time impact (the `Clock` port adds a single method dispatch in time-sensitive paths). |
| **V. Hexagonal Architecture & SOLID** | **PASS.** The `Clock` port lives in `apps/api/src/domain/shared/Clock.ts` (domain-owned interface). The `SystemClock` adapter lives in `apps/api/src/infrastructure/clock/SystemClock.ts`. Tests supply a `TestClock` adapter from `apps/api/tests/integration/support/TestClock.ts`. Wiring happens in `container.ts`. Stub providers are infrastructure-layer test adapters that implement the existing ports (`PaymentGateway.port`, `NotificationService.port`, etc.) — DIP is preserved, no domain code imports the stubs. No fat interfaces are introduced. No domain code changes beyond adding `clock.now()` call sites replacing `new Date()` / `Date.now()` where they gate business rules. |

**Gate result**: **PASS.** No complexity-tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/016-integration-tests-real-db/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (test fixture entities)
├── quickstart.md        # Phase 1 output (how to run the suite)
├── contracts/           # Phase 1 output
│   ├── clock-port.md          # Clock interface contract
│   ├── stub-registry.md       # Stub adapter contracts (one per external)
│   ├── auth-helper.md         # Test auth helper contract
│   └── failure-bundle.md      # Shape of the CI failure artifact
└── checklists/
    └── requirements.md        # (already created by /speckit.specify)
```

### Source Code (repository root)

```text
apps/api/
├── src/
│   ├── domain/
│   │   └── shared/
│   │       └── Clock.ts                       # NEW — Clock port (interface + error)
│   ├── infrastructure/
│   │   └── clock/
│   │       └── SystemClock.ts                 # NEW — production adapter (wraps new Date())
│   ├── container.ts                           # MODIFIED — accepts optional overrides; resolves Clock
│   ├── application/**                         # MODIFIED — use-cases that previously read `new Date()` now receive Clock
│   ├── jobs/
│   │   ├── reminderJob.ts                     # MODIFIED — reads clock from container
│   │   └── closePoolsJob.ts                   # MODIFIED — reads clock from container
│   └── services/                              # MODIFIED — any time-sensitive helper reads clock from container
└── tests/
    └── integration/                           # NEW
        ├── vitest.config.ts                   # Vitest "project" with threads pool, own setup
        ├── setup/
        │   ├── global-setup.ts                # Runs once per process: build template DB, apply migrations
        │   ├── per-worker-setup.ts            # Runs once per worker: CREATE DATABASE clone_<worker>
        │   ├── per-test-setup.ts              # Runs before each test: reset clone from template
        │   └── teardown.ts                    # Drops clones at end of run
        ├── support/
        │   ├── app.ts                         # Builds a Hono app instance with overridden container
        │   ├── TestClock.ts                   # In-memory Clock adapter: setNow/advance
        │   ├── auth-helper.ts                 # signInViaPhoneOtp / signInViaMagicLink / signInViaGoogle
        │   ├── stubs/
        │   │   ├── infinitepay-stub.ts        # MSW handlers + event simulator
        │   │   ├── telegram-stub.ts           # grammY bot stub (capture sends + deliver fake updates)
        │   │   ├── resend-stub.ts             # Resend transport stub (captures emails, exposes magic-link tokens)
        │   │   ├── google-oauth-stub.ts       # OAuth token endpoint + userinfo stub
        │   │   ├── turnstile-stub.ts          # Always-valid and always-invalid verifiers
        │   │   └── football-data-stub.ts      # Fixture + live-score stub
        │   ├── fixtures/
        │   │   ├── makeCompetition.ts
        │   │   ├── makeMatches.ts
        │   │   ├── makePool.ts
        │   │   └── makeUser.ts
        │   ├── db-utils.ts                    # Worker DB name, reset helpers
        │   └── failure-bundle.ts              # Writes scenario rows + stub log + HTTP pair on test failure
        └── scenarios/
            ├── auth.test.ts                   # US1
            ├── pool-lifecycle.test.ts         # US2
            ├── predictions-and-scoring.test.ts # US3
            ├── prize-withdrawal.test.ts       # US4
            ├── infinitepay-gateway.test.ts    # US5
            ├── background-jobs.test.ts        # US6
            └── suite-performance.test.ts      # US7 (meta-checks)

.github/workflows/
└── ci.yml                                     # MODIFIED — adds `test:integration` step that uploads failure-bundle artifact

apps/api/package.json                          # MODIFIED — adds test:integration script
docker-compose.yml                             # unchanged (already provides postgres-test on :5433)
```

**Structure Decision**: The integration suite lives at `apps/api/tests/integration/` as a **separate Vitest project**, not mixed with the existing `__tests__/` unit-test folders. Reasons:

1. Each layer runs with a different Vitest config (the unit project mocks the DB; the integration project forbids mocks of the DB and auto-resets real databases). Mixing them in one project would require conditional setup.
2. `pnpm --filter @m5nita/api test` continues to run the fast unit suite; a new `pnpm --filter @m5nita/api test:integration` runs the slow one. CI runs both sequentially (unit first, integration second) so a fast failure surfaces quickly.
3. The folder stays inside `apps/api` (not a top-level `tests/`) because every dependency the suite imports is an `apps/api` symbol — putting it outside would require exporting internals through `package.json` just to test them.

## Complexity Tracking

> No constitutional violations. Section intentionally empty.
