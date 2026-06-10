# manita Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-06-05

## Active Technologies
- TypeScript 5.x (Node.js >= 22) + Hono, Better Auth (phone-number plugin), Drizzle ORM, grammY (new) (002-telegram-otp)
- PostgreSQL 16 (new `telegram_chat` table) (002-telegram-otp)
- TypeScript 5.x (Node.js >= 22) + Hono (API), Better Auth + phone-number plugin, Drizzle ORM, grammY (Telegram), React 19, TanStack Router, TanStack Query (004-critical-fixes-telegram-reminders)
- TypeScript 5.x (Node.js >= 22) + Hono (API), Better Auth + phone-number plugin, Drizzle ORM, grammY (Telegram), React 19, TanStack Router, TanStack Query, Tailwind CSS v4 (005-winner-prize-withdrawal)
- TypeScript 5.x (Node.js >= 22) + Hono (API), Drizzle ORM, grammY (Telegram), React 19, TanStack Router/Query, Tailwind CSS v4 (006-multi-competition)
- TypeScript 5.x (Node.js >= 22) + Hono (API), React 19, TanStack Router/Query, grammY (Telegram), Drizzle ORM (007-fix-ux-scores-reminders)
- TypeScript 5.x (Node.js >= 22) + Hono (API), Better Auth 1.2.x (auth), Drizzle ORM, React 19, TanStack Router/Query, resend (new), jose (new) (008-social-email-auth)
- TypeScript 5.x, Node.js ≥ 22 + Hono (API), Drizzle ORM, Better Auth (auth middleware), React 19, TanStack Router, TanStack Query, Tailwind CSS v4 (009-view-others-predictions)
- PostgreSQL 16 — reuses existing `prediction`, `pool_member`, `match`, and `user` tables (no schema changes) (009-view-others-predictions)
- TypeScript 5.x (Node.js >= 22) + React 19, TanStack Router, TanStack Query, Tailwind CSS v4 (010-desktop-layout)
- N/A (no data changes) (010-desktop-layout)
- TypeScript 5.x (Node.js >= 22) + Hono (HTTP), Drizzle ORM, Better Auth, grammY (Telegram), Stripe SDK (011-hexagonal-architecture)
- PostgreSQL 16 via Drizzle ORM (011-hexagonal-architecture)
- TypeScript 5.x (Node.js >= 22) + Hono (HTTP), Drizzle ORM, mercadopago SDK (new), Better Auth, grammY (012-stripe-to-mercadopago)
- TypeScript 5.x, Node.js ≥ 22 + Hono (API), Better Auth, React 19, TanStack Router, Tailwind v4, Cloudflare Turnstile (loaded via CDN script + `siteverify` HTTPS call) (013-cloudflare-turnstile)
- N/A — Turnstile tokens are single-use and never persisted (013-cloudflare-turnstile)
- TypeScript 5.x, Node.js ≥ 22 + Hono (HTTP), Drizzle ORM (Postgres), Better Auth (auth), grammY (Telegram). New: none — InfinitePay does not publish a TypeScript SDK; integration uses native `fetch`. (014-infinitepay-gateway)
- PostgreSQL 16 via Drizzle. Reuses existing `payment` table; no schema changes. (014-infinitepay-gateway)
- TypeScript 5.x, Node.js ≥ 22 + React 19, TanStack Router, TanStack Query, Tailwind CSS v4 (with `@theme` inline tokens in `apps/web/src/styles/app.css`). No new runtime dependencies. (015-dark-light-theme)
- Browser `localStorage` (key: `m5nita.theme`). No database changes. No server-side storage, no user-table columns. (015-dark-light-theme)
- TypeScript 5.x, Node.js ≥ 22 (monorepo root `.nvmrc`) + Vitest 3.1 (existing), Hono 4.7, Drizzle ORM 0.41, postgres.js 3.4, Better Auth 1.5 (with phone-number plugin), grammY 1.41, Resend 6, mercadopago 2, stripe 22, `undici` (already bundled via Node 22 for `fetch` interception). **New**: `msw` 2.x (network-level stub library) — chosen to intercept `fetch`/`undici` calls to InfinitePay, Google OAuth, Resend, Turnstile and football-data at the HTTP boundary without touching application code. (016-integration-tests-real-db)
- PostgreSQL 16 — the existing `postgres-test` service in `docker-compose.yml` (port 5433) and the same image already used by CI (`ci.yml` > `services.postgres`). Template-database cloning (`CREATE DATABASE x TEMPLATE t`) is the reset mechanism. (016-integration-tests-real-db)
- TypeScript 5.x, Node.js ≥ 22 + Hono (API), Drizzle ORM, Better Auth, grammY (Telegram), React 19, TanStack Router, TanStack Query, Tailwind CSS v4. No new runtime dependencies. (019-single-match-pool)
- PostgreSQL 16 — adds a nullable `match_id uuid` column to `pool` table, FK to `match.id`, with a CHECK constraint enforcing mutual exclusivity with `matchday_from`/`matchday_to`. (019-single-match-pool)
- TypeScript 5.x, Node.js ≥ 22 + Hono (HTTP), Drizzle ORM (Postgres), Better Auth, grammY; React 19, TanStack Router/Query, Tailwind CSS v4. Payment via existing InfinitePay / Stripe / Mock adapters (MercadoPago was removed). **No new runtime dependencies** (charts are inline SVG). (021-estatisticas-participante)
- PostgreSQL 16. Two new additive tables (`stats_unlock`, `participant_pool_stats`); one new accepted value for the existing text column `payment.type`. No prize/fee table touched. (021-estatisticas-participante)
- TypeScript 5.x, Node.js ≥ 22 + Hono (HTTP), Drizzle ORM (Postgres), grammY (Telegram), Resend (022-email-notification-fallback)
- PostgreSQL 16 via Drizzle. **No schema changes** — reads existing (022-email-notification-fallback)
- TypeScript 5.x, Node.js ≥ 22 (monorepo, pnpm) + Hono (HTTP), Drizzle ORM (Postgres), Better Auth, grammY (Telegram); React 19 + TanStack Router/Query + Tailwind v4 (web); football-data.org v4 (match data, via `fetch`) (023-knockout-scoring)
- PostgreSQL 16 via Drizzle. Additive nullable columns on existing `match` and `prediction` tables; one new migration `0011`. No new tables. (023-knockout-scoring)

- TypeScript 5.x (Node.js >= 22) (001-world-cup-pool-app)
- Backend: Hono, Better Auth, Drizzle ORM; payments via InfinitePay / Stripe / Mock adapters
- Frontend: React 19, TanStack Router, TanStack Query, Tailwind CSS v4
- Database: PostgreSQL 16 (a `redis` container is in docker-compose but is **not** used by the app — cache/rate-limit are in-process `Map`s)
- Tooling: pnpm, Biome, Vitest (no Playwright is wired up — the `*.spec.ts` files under `apps/web/tests` are not runnable as-is)

## Project Structure

```text
apps/api/        # Backend Hono API
apps/web/        # Frontend React PWA
packages/shared/ # Shared types, schemas, constants
```

## Where business rules live (DDD layout)

Core rules belong in `apps/api/src/domain/`, encapsulated as value objects /
aggregates / policies — never re-derived in `services/`, `application/`,
`infrastructure/`, jobs, or the front. The architecture guardrails
(`scripts/ci/check-domain-leaks.mjs` and `apps/api/src/_architecture.test.ts`)
enforce this in CI.

| Concern                                       | Home                                                      |
|-----------------------------------------------|-----------------------------------------------------------|
| Platform fee, discount, prize total           | `domain/shared/FeePolicy.ts` + `domain/prize/PrizeCalculation.ts` |
| Pure fee math (back + front share)            | `packages/shared/src/lib/fee.ts`                          |
| Pool aggregate (state, money, scope)          | `domain/pool/Pool.ts`                                     |
| Scoring algorithm choice (range vs single)    | `Pool.scoringPolicy()` → `domain/scoring/ScoringPolicy.ts` |
| Score + breakdown                             | `domain/scoring/Score.ts` (+ `SingleMatchScore.ts`)       |
| Ranking position / tiebreaker                 | `domain/ranking/Ranking.ts`                               |
| Match status + lifecycle                      | `domain/match/Match.ts` + `MatchStatus.ts`                |
| "Stale live → finished after 12h"             | `domain/match/StaleMatchPolicy.ts`                        |
| Single-match pool eligibility                 | `domain/match/MatchEligibility.ts`                        |
| Prediction deadline                           | `Prediction.canSubmitFor(match, now)`                     |
| Repository interfaces                         | `domain/<aggregate>/*.port.ts`                            |

**Frontend rule**: the front never computes prize/fee from existing pools —
the API returns them pre-calculated. The pre-create preview uses
`computePlatformFee` from `@m5nita/shared` (single source of truth).

**Adding new rules**: write the rule once in `domain/`, expose it via a method
on the relevant aggregate or a small policy module. If multiple layers need
the same math (back + front), extract a pure helper in `packages/shared/src/lib/`
and have the domain VO delegate to it.

## Architecture guardrails

| ID  | Mechanism                                | Catches                                                  |
|-----|------------------------------------------|----------------------------------------------------------|
| G2  | `pnpm check:leaks` (`scripts/ci/check-domain-leaks.mjs`) | regex-based leak patterns (inline fee math, 12h literal, scope-branching, deprecated helpers) |
| G3  | `apps/api/src/_architecture.test.ts` (Vitest) | layer-boundary imports (domain → outer, application → infrastructure, services bypassing repos) |

Both run automatically in CI. When intentional, exempt a single line with
`// leak-allow: <reason>` (G2) or `// arch-allow: <reason>` (G3). The
`_architecture.test.ts` file also carries `BASELINE_*` allow-lists of
pre-existing offenders — never extend them.

## Commands

```bash
pnpm dev                     # Start API + Web dev servers
pnpm build                   # Production build
pnpm test                    # Run unit tests (Vitest, all workspaces)
pnpm --filter @m5nita/api exec vitest run path/to/file.test.ts   # Run a single test file
pnpm biome check --write .   # Lint + format
pnpm check:leaks             # Domain-leak guardrail (G2)
pnpm check:arch              # Layer-boundary guardrail (G3, dependency-cruiser)

# drizzle-kit is only a dependency of @m5nita/api (no root binary):
pnpm --filter @m5nita/api db:generate   # Generate migrations
pnpm --filter @m5nita/api db:migrate    # Apply migrations
pnpm --filter @m5nita/api db:push       # Push schema (dev only)
pnpm --filter @m5nita/api db:seed       # Seed dev data (also db:seed-stats / db:seed-knockout)

# Integration tests run against a real Postgres on port 5433 (docker-compose
# `postgres-test`); DATABASE_URL must point at it:
DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test \
  pnpm --filter @m5nita/api test:integration
```

> ⚠️ **Migration gotcha**: boot-time migrate applies migrations in `_journal.json`
> order. When adding a migration, bump its `when` timestamp in
> `apps/api/drizzle/meta/_journal.json` above the previous entry — otherwise
> drizzle-kit silently skips it in production.

## Code Style

- TypeScript strict mode
- Biome for linting and formatting (not ESLint/Prettier)
- Zod for runtime validation
- Drizzle ORM for type-safe database queries
- All values in centavos (BRL) for monetary amounts

## Recent Changes
- 023-knockout-scoring: Added TypeScript 5.x, Node.js ≥ 22 (monorepo, pnpm) + Hono (HTTP), Drizzle ORM (Postgres), Better Auth, grammY (Telegram); React 19 + TanStack Router/Query + Tailwind v4 (web); football-data.org v4 (match data, via `fetch`)
- 022-email-notification-fallback: Added TypeScript 5.x, Node.js ≥ 22 + Hono (HTTP), Drizzle ORM (Postgres), grammY (Telegram), Resend
- 021-estatisticas-participante: Added TypeScript 5.x, Node.js ≥ 22 + Hono (HTTP), Drizzle ORM (Postgres), Better Auth, grammY; React 19, TanStack Router/Query, Tailwind CSS v4. Payment via existing InfinitePay / Stripe / Mock adapters (MercadoPago was removed). **No new runtime dependencies** (charts are inline SVG).

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
