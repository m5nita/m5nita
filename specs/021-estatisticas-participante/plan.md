# Implementation Plan: Per-Participant Pool Statistics

**Branch**: `021-estatisticas-participante` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/021-estatisticas-participante/spec.md`

## Summary

Add a paid, per-pool **Statistics** section. A pool member unlocks it once (one-time Pix payment, default R$1,99, configurable) and then sees four comparison blocks (hit rate vs average/leader, ranking evolution, strengths & weaknesses, points left on the table) plus help on upcoming matches — an impact-ranked list of **all** the participant's own not-yet-started matches (predicted or not) they can still submit or change before kickoff, plus own-history suggestions. Revenue is 100% platform and never touches prize.

Technical approach mirrors the existing ranking machine exactly:

- **Stats math lives in `apps/api/src/domain/stats/`** (aggregate + policies + VO + ports). Infra returns **raw aggregated rows** (sums/counts per dimension); the domain derives %, deltas, trend, efficiency and impact — identical split to `Ranking.build()` (`domain/ranking/Ranking.ts:27`, raw rows from `infrastructure/persistence/DrizzleRankingRepository.ts:51`).
- **Scoring is reused, never re-derived.** Stats only aggregate the already-persisted `prediction.points` (`db/schema/prediction.ts:23`). Max points per match come from a new `ScoringPolicy.maxPoints()` (10 range / 14 single-match) so the 10/14 constant is never hardcoded in stats (avoids a G2 leak).
- **Two-level cache mirrors ranking.** A sibling in-process aggregate cache (`services/statsCache.ts`, TTL 25s, single-flight) keyed by `poolId`, invalidated at the same point as ranking in `jobs/calcPoints.ts:50`; plus a persisted per-user snapshot table (`participant_pool_stats`) recomputed at match-finish only for unlocked users (a small, bounded set). The tab is OFF the 30s live-poll path.
- **Payment reuses the existing gateway/webhook.** A new `payment.type = 'stats_unlock'`, threaded through `PaymentGateway.createCheckoutSession`, with the completion handled by the existing idempotent CAS in `services/payment.ts:10`. Entitlement is a new `stats_unlock` table, unique `(user_id, pool_id)`, granted `ON CONFLICT DO NOTHING`. Prize is provably untouched because `PrizeCalculation` (`domain/prize/PrizeCalculation.ts:8`) and `getPoolPrizeTotal` (`services/ranking.ts`) derive prize from `poolMember` count × `entryFee`, and the stats_unlock branch never writes `poolMember`.
- **Front** adds an `Estatísticas` tab to `components/pool/PoolHub.tsx` and a route `routes/pools/$poolId/estatisticas.tsx`, reusing the Pix checkout → `payment-success` polling flow and zero-dependency inline SVG for charts (no chart lib in the repo).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js ≥ 22
**Primary Dependencies**: Hono (HTTP), Drizzle ORM (Postgres), Better Auth, grammY; React 19, TanStack Router/Query, Tailwind CSS v4. Payment via existing MercadoPago / InfinitePay / Stripe / Mock adapters. **No new runtime dependencies** (charts are inline SVG).
**Storage**: PostgreSQL 16. Two new additive tables (`stats_unlock`, `participant_pool_stats`); one new accepted value for the existing text column `payment.type`. No prize/fee table touched.
**Testing**: Vitest (unit + integration). Domain `stats/` at 100% coverage (constitution II). Integration tests over real DB (spec 016 harness) for the gate, idempotent unlock, and prize-invariance.
**Target Platform**: Linux server (~3 vCPU / 4 GB prod box) + PWA web client.
**Project Type**: Web application (hexagonal API in `apps/api/` + React PWA in `apps/web/`).
**Performance Goals**: Stats reads served from precomputed/cached data; no heavy re-aggregation per request; stats tab issues zero requests on the 30s live-poll cycle. API p95 < 200ms (constitution IV); panel visible < 1.5s.
**Constraints**: Pending-match impact is `O(pending + members)`, bounded to the user's own pending matches, no outcome-combination simulation. Snapshot recompute at match-finish is limited to unlocked users. Prize total identical before/after any number of unlocks (0 cents).
**Scale/Scope**: Tens of pools, up to ~hundreds of members each, ~63k predictions order-of-magnitude already in prod; unlocked set per pool is small (paid feature).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Plan compliance |
|-----------|------|-----------------|
| **I. Code Quality** | Value objects for domain primitives; SRP; no dead code | `StatsUnlockPrice` is a Money-based VO; stats math split into focused policies; reuse `Money`, `formatCurrency`. No primitive prices in signatures. |
| **II. Testing Standards** | Domain 100%, TDD, adapter tests satisfy ports, integration for cross-boundary | Phase 0 domain is TDD-first (Vitest). Adapters tested against ports. Integration tests: gate (member+entitlement), idempotent webhook, prize-invariance, no-leak. |
| **III. UX Consistency** | Design system, loading/error states, accessibility, consistent terminology | Reuse `Button`/`Modal`/card patterns + `formatCurrency`; paywall mirrors `PrizeWithdrawal` locked-state pattern; Tailwind v4 `@theme` tokens; dark/light supported; "not enough data yet" states defined. |
| **IV. Performance** | p95 < 200ms, no N+1/full-scan, bundle +10KB justified | Two-level cache; aggregation uses existing `prediction(pool_id,user_id)` and `match(status)` indexes; bounded impact; **zero** new web deps (inline SVG). |
| **V. Hexagonal & SOLID** | domain→application→infrastructure; ports as interfaces; manual DI; logic pushed to domain | New `domain/stats/` (entities/policies/VO + `*.port.ts`); `application/stats/` use cases; `infrastructure/persistence/` Drizzle adapters + `infrastructure/http/routes`; wired in `container.ts`. Domain imports nothing outward. |

**Guardrails (CLAUDE.md G2/G3)**:
- `pnpm check:leaks` — stats must NOT inline fee math, must NOT hardcode `10`/`14` (use `ScoringPolicy.maxPoints()`), must NOT branch on `scope.kind` (use `pool.scoringPolicy()`). No `// leak-allow` expected.
- `apps/api/src/_architecture.test.ts` — domain `stats/` imports no ORM/HTTP; application imports no infrastructure; routes delegate to use cases. `BASELINE_*` allow-lists MUST NOT grow.

**Result**: PASS (no violations; Complexity Tracking empty). Re-checked post-design — still PASS (see Phase 1).

## Project Structure

### Documentation (this feature)

```text
specs/021-estatisticas-participante/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── get-pool-stats.md
│   └── post-pool-stats-unlock.md
├── checklists/
│   └── requirements.md  # from /speckit.specify
└── tasks.md             # /speckit.tasks (NOT created here)
```

### Source Code (repository root)

```text
apps/api/src/
├── domain/
│   ├── stats/                                   # NEW — all stats math lives here
│   │   ├── ParticipantPoolStats.ts              #   aggregate: raw rows + pool aggregate → 4 blocks
│   │   ├── ParticipantPoolStats.test.ts
│   │   ├── StatsComparisonPolicy.ts             #   deltas vs avg/leader, efficiency (anonymized)
│   │   ├── StatsComparisonPolicy.test.ts
│   │   ├── PendingMatchImpactPolicy.ts          #   bounded impact ranking of own pending matches
│   │   ├── PendingMatchImpactPolicy.test.ts
│   │   ├── StatsUnlockPrice.ts                  #   VO (Money, default 199 centavos)
│   │   ├── StatsUnlockPrice.test.ts
│   │   ├── StatsRepository.port.ts              #   raw aggregated reads (per-user + per-pool + per-round)
│   │   └── StatsUnlockRepository.port.ts        #   isUnlocked / grant / listUnlockedUsers
│   └── scoring/
│       ├── ScoringPolicy.ts                     # EDIT — add maxPoints(): number
│       ├── Score.ts                             # EDIT — expose range max (10) via constant
│       └── SingleMatchScore.ts                  # EDIT — expose single-match max (14)
├── application/
│   └── stats/                                   # NEW
│       ├── UnlockStatsUseCase.ts                #   create Pix checkout (type='stats_unlock')
│       ├── UnlockStatsUseCase.test.ts
│       ├── GetParticipantStatsUseCase.ts        #   gate + assemble locked/unlocked payload
│       └── GetParticipantStatsUseCase.test.ts
├── application/ports/
│   └── PaymentGateway.port.ts                   # EDIT — CheckoutParams gains type/description
├── infrastructure/
│   ├── persistence/
│   │   ├── DrizzleStatsRepository.ts            # NEW — raw aggregation SQL
│   │   └── DrizzleStatsUnlockRepository.ts      # NEW — entitlement + snapshot upsert
│   ├── external/                                # EDIT — thread `type` into payment insert
│   │   ├── MercadoPagoPaymentGateway.ts
│   │   ├── InfinitePayPaymentGateway.ts
│   │   ├── StripePaymentGateway.ts
│   │   └── MockPaymentGateway.ts                #   delegate completion to handleCheckoutCompleted
│   └── http/routes/
│       └── stats.ts                             # NEW — GET /:poolId/stats, POST /:poolId/stats/unlock
├── services/
│   ├── statsCache.ts                            # NEW — sibling aggregate cache (TTL 25s)
│   └── payment.ts                               # EDIT — dispatch on type; add stats_unlock branch
├── jobs/
│   └── calcPoints.ts                            # EDIT — recompute snapshots + invalidate stats cache
├── db/schema/
│   ├── statsUnlock.ts                           # NEW table
│   └── participantPoolStats.ts                  # NEW table
├── container.ts                                 # EDIT — wire repos + use cases + price from env
└── app.ts                                       # EDIT — register stats routes

packages/shared/src/constants/index.ts          # EDIT — PAYMENT.TYPES += 'stats_unlock'; STATS price default

apps/web/src/
├── routes/pools/$poolId/
│   └── estatisticas.tsx                         # NEW route (tab content)
├── components/pool/
│   ├── PoolHub.tsx                              # EDIT — add 'statistics' tab
│   └── stats/                                   # NEW presentational components
│       ├── StatsPaywall.tsx                     #   teaser + unlock CTA
│       ├── StatsPanel.tsx                       #   4 blocks + impact + suggestions
│       ├── Sparkline.tsx                        #   inline SVG
│       └── CompareBar.tsx                       #   inline SVG bars
└── lib/                                         # reuse api.ts, utils.formatCurrency; NOT poll.livePollMs
```

**Structure Decision**: Web application with a hexagonal API. The feature is added strictly along the three layers (`domain/stats` → `application/stats` → `infrastructure/...`), wired by the manual DI composition root (`apps/api/src/container.ts`). The front adds one tab + one route and a small set of zero-dependency presentational components, reusing the existing auth guard, query/fetch wrapper, money formatter, and Pix→`payment-success` polling flow.

## Complexity Tracking

> No constitution violations. Section intentionally empty.
