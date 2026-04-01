# Implementation Plan: Multi-Competition Support

**Branch**: `006-multi-competition` | **Date**: 2026-03-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-multi-competition/spec.md`

## Summary

Refactor the m5nita bolao app from a single hardcoded World Cup competition to support multiple competitions (La Liga, World Cup, etc.). Each pool is linked to a competition and optionally filtered by matchday range. Match sync, pool closing, and predictions are all scoped per-competition. A data migration auto-creates a "Copa do Mundo 2026" record for existing data. Competition management is done via Telegram bot admin commands.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js >= 20)
**Primary Dependencies**: Hono (API), Drizzle ORM, grammY (Telegram), React 19, TanStack Router/Query, Tailwind CSS v4
**Storage**: PostgreSQL 16
**Testing**: Vitest
**Target Platform**: Linux server (API), Web browser (PWA)
**Project Type**: Web application (monorepo: apps/api + apps/web + packages/shared)
**Performance Goals**: API responses < 200ms p95, page load < 1.5s FCP
**Constraints**: football-data.org free tier rate limits (10 req/min), monetary values in centavos (BRL)
**Scale/Scope**: ~5 concurrent competitions, ~100 pools, ~1000 users

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | PASS | Single-responsibility functions, explicit naming, no dead code |
| II. Testing Standards | PASS | Unit tests for competition service, match sync, and pool close logic. Integration tests for pool creation with competition. 80%+ coverage on new code enforced. |
| III. UX Consistency | PASS | Competition selector follows existing pool creation patterns |
| IV. Performance Requirements | PASS | Competition sync spaces API calls to respect rate limits; DB queries use indexes on competitionId |

No violations. All gates pass.

## Project Structure

### Documentation (this feature)

```text
specs/006-multi-competition/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── api-contracts.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/api/src/
├── db/schema/
│   ├── competition.ts        # NEW: competition table (id, externalId, name, season, type, status, featured)
│   ├── match.ts              # MODIFIED: add competitionId FK
│   ├── pool.ts               # MODIFIED: add competitionId FK, matchdayFrom, matchdayTo
│   └── relations.ts          # MODIFIED: add competition relations
├── services/
│   ├── match.ts              # MODIFIED: multi-competition sync
│   ├── pool.ts               # MODIFIED: competition-aware pool creation
│   └── competition.ts        # NEW: competition CRUD, featured toggle, seasonDisplay
├── routes/
│   ├── pools.ts              # MODIFIED: accept competitionId, matchday range
│   ├── matches.ts            # MODIFIED: filter by competitionId and featured flag
│   └── competitions.ts       # NEW: GET /api/competitions (list active)
├── jobs/
│   ├── closePoolsJob.ts      # MODIFIED: close per-competition scope
│   └── reminderJob.ts        # MODIFIED: scope reminders to pool's matches
├── lib/
│   └── telegram.ts           # MODIFIED: add competition admin commands + /competicao_destacar

apps/web/src/
├── routes/
│   ├── index.tsx             # MODIFIED: filter upcoming matches by featured competitions
│   ├── matches.tsx           # MODIFIED: competition tabs, league matchday tabs, featured filter
│   └── pools/
│       ├── create.tsx        # MODIFIED: add competition + matchday selection
│       └── $poolId/
│           ├── index.tsx     # MODIFIED: show competition name and matchday range
│           └── predictions.tsx # MODIFIED: league matchday tabs, knockout stage tabs, scoped matches
├── routes/invite/
│   └── $inviteCode.tsx       # MODIFIED: show competition name
├── components/pool/
│   └── PoolCard.tsx          # MODIFIED: show competition name

packages/shared/src/
├── constants/index.ts        # MODIFIED: add COMPETITION constants, 'league' stage
├── schemas/index.ts          # MODIFIED: add competition fields to pool schema
└── types/index.ts            # MODIFIED: add Competition type, update Pool/Match types
```

**Structure Decision**: Follows existing monorepo structure. New `competition.ts` files in schema, services, and routes mirror the existing pattern for pools and coupons.
