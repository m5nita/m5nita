# Implementation Plan: Single-Match Pool Creation

**Branch**: `019-single-match-pool` | **Date**: 2026-05-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/019-single-match-pool/spec.md`

## Summary

Extend pool creation so an owner can scope a pool to **exactly one upcoming match** in any active competition (league or cup), in addition to the existing whole-matchday-range scope. The two scopes are mutually exclusive per pool and the chosen match is immutable after creation. Scoring, refunds, minimum-members, and cancellation reuse existing multi-match behavior; the only new resolution rule is the tie-break (split prize equally among all top tied scorers), captured in the domain entity. UI gains a scope toggle and a match picker that groups upcoming fixtures by matchday (league) or stage/phase (cup).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js ≥ 22
**Primary Dependencies**: Hono (API), Drizzle ORM, Better Auth, grammY (Telegram), React 19, TanStack Router, TanStack Query, Tailwind CSS v4. No new runtime dependencies.
**Storage**: PostgreSQL 16 — adds a nullable `match_id uuid` column to `pool` table, FK to `match.id`, with a CHECK constraint enforcing mutual exclusivity with `matchday_from`/`matchday_to`.
**Testing**: Vitest 3.1 (unit + integration against real Postgres template per 016), Playwright if needed for e2e (not required for this slice).
**Target Platform**: Existing web PWA (apps/web) + Hono API (apps/api).
**Project Type**: Web application (monorepo `apps/api` + `apps/web` + `packages/shared`).
**Performance Goals**: Match picker MUST render under 200ms p95 for a competition with ≤ 380 upcoming fixtures (worst case: full league season). Pool creation latency unchanged from existing flow.
**Constraints**: API p95 < 200ms; first contentful paint < 1.5s; no new external integrations.
**Scale/Scope**: Reuses existing pool/match scale. Adds one column, one VO, one form mode, one match-picker component, and ~4 use-case touchpoints (create pool, scoring filter, reminder filter, predictions filter).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Code Quality | PASS | Logic kept under existing layer boundaries; new VO encapsulates scope validation, no raw primitives leak into entities. |
| II. Testing Standards | PASS | New `PoolScope` VO and updated `Pool` entity get 100% domain unit tests. `CreatePoolUseCase` gets new test branches for single-match scope. Integration test for the create route covers both scope modes. |
| III. UX Consistency | PASS | Scope toggle and match picker reuse existing design-system components (Tailwind v4 tokens, shadcn-style controls). Empty-state and error copy follow existing patterns. |
| IV. Performance Requirements | PASS | Match-picker payload is bounded by competition size and uses an existing list endpoint or a small new read-only endpoint backed by the existing `match` table index on `(competition_id, matchday, kickoff_at)`. No N+1. |
| V. Hexagonal Architecture & SOLID | PASS | New domain VO (`PoolScope`) and updated `Pool` entity live in `domain/`. Use case orchestration lives in `application/`. Drizzle mapper and HTTP route (under `infrastructure/`) gain field plumbing only. No third-party imports cross inward. |

No violations. No entries in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/019-single-match-pool/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (API request/response shapes)
│   └── pool-create.md
└── tasks.md             # Created by /speckit.tasks (not by this command)
```

### Source Code (repository root)

```text
apps/api/src/
├── domain/
│   ├── shared/
│   │   ├── PoolScope.ts                    # NEW: discriminated VO (range | singleMatch)
│   │   └── PoolScope.test.ts               # NEW
│   └── pool/
│       ├── Pool.ts                          # UPDATED: replace matchdayRange with PoolScope
│       └── Pool.test.ts                     # UPDATED
├── application/
│   └── pool/
│       ├── CreatePoolUseCase.ts             # UPDATED: accept matchId, validate upcoming, build PoolScope
│       └── CreatePoolUseCase.test.ts        # UPDATED
├── infrastructure/
│   ├── persistence/
│   │   ├── mappers/PoolMapper.ts            # UPDATED: read/write match_id
│   │   └── DrizzlePoolRepository.ts         # UPDATED: ranking + freeze queries handle match_id branch
│   └── http/
│       └── routes/pools.ts                  # UPDATED: accept matchId in create payload
└── db/schema/pool.ts                        # UPDATED: add match_id column, drop NOTHING

apps/api/drizzle/                            # NEW migration with column + CHECK constraint
└── 0NNN_pool_single_match.sql

apps/web/src/
├── routes/pools/new.tsx                     # UPDATED: scope toggle + match picker
└── features/pools/
    ├── PoolScopeToggle.tsx                  # NEW
    └── UpcomingMatchPicker.tsx              # NEW (groups by matchday / stage)

packages/shared/src/
└── schemas/pool.ts                          # UPDATED: zod shape for create payload (exclusivity)
```

**Structure Decision**: Existing hexagonal layout (`apps/api/src/{domain,application,infrastructure}`) is reused unchanged. Pool's scope is unified behind a single `PoolScope` value object so that all downstream code (predictions filter, reminders, scoring trigger, ranking freeze) branches on the VO rather than scattering null checks on `matchdayFrom`/`matchId`. Frontend adds two new components inside the existing `apps/web/src/features/pools/` slot. No new packages, services, or apps.

## Complexity Tracking

No constitutional violations — section intentionally empty.
