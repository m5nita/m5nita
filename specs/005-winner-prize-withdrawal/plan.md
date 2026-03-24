# Implementation Plan: Retirada de Premio pelo Vencedor

**Branch**: `005-winner-prize-withdrawal` | **Date**: 2026-03-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-winner-prize-withdrawal/spec.md`

## Summary

Implementar o fluxo completo de retirada de premio pelo vencedor de um bolao finalizado. Inclui: finalizacao do bolao pelo owner, solicitacao de retirada via chave PIX pelo vencedor (com suporte a empates), notificacao via Telegram, e bloqueio de cancelamento apos solicitacao. O processamento real do PIX sera manual pelo admin da plataforma.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js >= 20)
**Primary Dependencies**: Hono (API), Better Auth + phone-number plugin, Drizzle ORM, grammY (Telegram), React 19, TanStack Router, TanStack Query, Tailwind CSS v4
**Storage**: PostgreSQL 16
**Testing**: Vitest
**Target Platform**: Web (PWA mobile-first, max-width 430px)
**Project Type**: Web application (monorepo: apps/api + apps/web + packages/shared)
**Performance Goals**: API responses < 200ms p95, page load < 1.5s FCP
**Constraints**: All monetary values in centavos (BRL), Biome for linting
**Scale/Scope**: ~3 new API endpoints, 1 new DB table, 2-3 new frontend components

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | PASS | Single-responsibility functions, explicit naming, type annotations, Biome compliance |
| II. Testing Standards | PASS | Unit tests for validation/prize calculation, integration tests for API endpoints and DB operations |
| III. UX Consistency | PASS | Reuses existing design system (Button, Input components), consistent error messages in Portuguese, loading states for mutations |
| IV. Performance | PASS | Simple queries with proper indexes (poolId, userId), no N+1 issues, minimal bundle impact |

**Post-Phase 1 Re-check**:

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | PASS | New schema follows existing patterns (pool.ts, payment.ts). Services have clear single responsibility. |
| II. Testing Standards | PASS | Contract tests defined for 3 new endpoints. Prize calculation and PIX validation are unit-testable. |
| III. UX Consistency | PASS | Prize withdrawal form follows existing form patterns (controlled inputs, mutation with invalidation). Error messages are user-friendly. |
| IV. Performance | PASS | Unique index on (poolId, userId) prevents duplicate withdrawals efficiently. Match status check is a simple count query. |

## Project Structure

### Documentation (this feature)

```text
specs/005-winner-prize-withdrawal/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research decisions
├── data-model.md        # Phase 1 data model
├── quickstart.md        # Phase 1 quickstart guide
├── contracts/           # Phase 1 API contracts
│   └── api.md           # REST API endpoint contracts
├── checklists/          # Quality checklists
│   └── requirements.md  # Spec quality validation
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
apps/api/src/
├── db/schema/
│   └── prizeWithdrawal.ts        # NEW: Prize withdrawal table
├── services/
│   ├── pool.ts                   # MODIFIED: Add closePool() finalization
│   ├── prizeWithdrawal.ts        # NEW: Prize withdrawal service
│   └── ranking.ts                # EXISTING: Reuse getPoolRanking()
├── routes/
│   └── pools.ts                  # MODIFIED: Add close, prize, withdraw endpoints
├── lib/
│   └── telegram.ts               # MODIFIED: Add winner notification function
└── jobs/                         # No changes

apps/web/src/
├── routes/pools/$poolId/
│   ├── index.tsx                 # MODIFIED: Show prize info for closed pools
│   └── manage.tsx                # MODIFIED: Add finalize button for owner
├── components/
│   ├── PrizeWithdrawal.tsx       # NEW: Prize info + withdrawal form
│   └── PixKeyInput.tsx           # NEW: PIX key type selector + input

packages/shared/src/
├── schemas/index.ts              # MODIFIED: Add PIX key validation schemas
├── types/index.ts                # MODIFIED: Add PrizeWithdrawal, PrizeInfo types
└── constants/index.ts            # MODIFIED: Add PIX key types, withdrawal statuses
```

**Structure Decision**: Follows the existing monorepo web application structure. New code integrates into existing directories. Only one new DB schema file and two new frontend components.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
