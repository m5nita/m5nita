# manita Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-18

## Active Technologies
- TypeScript 5.x (Node.js >= 20) + Hono, Better Auth (phone-number plugin), Drizzle ORM, grammY (new) (002-telegram-otp)
- PostgreSQL 16 (new `telegram_chat` table) (002-telegram-otp)
- TypeScript 5.x (Node.js >= 20) + Hono (API), Better Auth + phone-number plugin, Drizzle ORM, grammY (Telegram), React 19, TanStack Router, TanStack Query (004-critical-fixes-telegram-reminders)
- TypeScript 5.x (Node.js >= 20) + Hono (API), Better Auth + phone-number plugin, Drizzle ORM, grammY (Telegram), React 19, TanStack Router, TanStack Query, Tailwind CSS v4 (005-winner-prize-withdrawal)
- TypeScript 5.x (Node.js >= 20) + Hono (API), Drizzle ORM, grammY (Telegram), React 19, TanStack Router/Query, Tailwind CSS v4 (006-multi-competition)
- TypeScript 5.x (Node.js >= 20) + Hono (API), React 19, TanStack Router/Query, grammY (Telegram), Drizzle ORM (007-fix-ux-scores-reminders)
- TypeScript 5.x (Node.js >= 20) + Hono (API), Better Auth 1.2.x (auth), Drizzle ORM, React 19, TanStack Router/Query, resend (new), jose (new) (008-social-email-auth)
- TypeScript 5.x, Node.js ≥ 20 + Hono (API), Drizzle ORM, Better Auth (auth middleware), React 19, TanStack Router, TanStack Query, Tailwind CSS v4 (009-view-others-predictions)
- PostgreSQL 16 — reuses existing `prediction`, `pool_member`, `match`, and `user` tables (no schema changes) (009-view-others-predictions)
- TypeScript 5.x (Node.js >= 20) + React 19, TanStack Router, TanStack Query, Tailwind CSS v4 (010-desktop-layout)
- N/A (no data changes) (010-desktop-layout)
- TypeScript 5.x (Node.js >= 20) + Hono (HTTP), Drizzle ORM, Better Auth, grammY (Telegram), Stripe SDK (011-hexagonal-architecture)
- PostgreSQL 16 via Drizzle ORM (011-hexagonal-architecture)
- TypeScript 5.x (Node.js >= 20) + Hono (HTTP), Drizzle ORM, mercadopago SDK (new), Better Auth, grammY (012-stripe-to-mercadopago)
- TypeScript 5.x, Node.js ≥ 20 + Hono (API), Better Auth, React 19, TanStack Router, Tailwind v4, Cloudflare Turnstile (loaded via CDN script + `siteverify` HTTPS call) (013-cloudflare-turnstile)
- N/A — Turnstile tokens are single-use and never persisted (013-cloudflare-turnstile)
- TypeScript 5.x, Node.js ≥ 20 + Hono (HTTP), Drizzle ORM (Postgres), Better Auth (auth), grammY (Telegram). New: none — InfinitePay does not publish a TypeScript SDK; integration uses native `fetch`. (014-infinitepay-gateway)
- PostgreSQL 16 via Drizzle. Reuses existing `payment` table; no schema changes. (014-infinitepay-gateway)
- TypeScript 5.x, Node.js ≥ 20 + React 19, TanStack Router, TanStack Query, Tailwind CSS v4 (with `@theme` inline tokens in `apps/web/src/styles/app.css`). No new runtime dependencies. (015-dark-light-theme)
- Browser `localStorage` (key: `m5nita.theme`). No database changes. No server-side storage, no user-table columns. (015-dark-light-theme)

- TypeScript 5.x (Node.js >= 20) (001-world-cup-pool-app)
- Backend: Hono, Better Auth, Drizzle ORM, Stripe SDK
- Frontend: React 19, TanStack Router, TanStack Query, Tailwind CSS v4
- Database: PostgreSQL 16 + Redis
- Tooling: pnpm, Biome, Vitest, Playwright

## Project Structure

```text
apps/api/        # Backend Hono API
apps/web/        # Frontend React PWA
packages/shared/ # Shared types, schemas, constants
```

## Commands

```bash
pnpm dev                     # Start API + Web dev servers
pnpm build                   # Production build
pnpm test                    # Run tests (Vitest)
pnpm biome check --write .   # Lint + format
pnpm drizzle-kit generate    # Generate migrations
pnpm drizzle-kit migrate     # Apply migrations
pnpm drizzle-kit push        # Push schema (dev only)
```

## Code Style

- TypeScript strict mode
- Biome for linting and formatting (not ESLint/Prettier)
- Zod for runtime validation
- Drizzle ORM for type-safe database queries
- All values in centavos (BRL) for monetary amounts

## Recent Changes
- 015-dark-light-theme: Added TypeScript 5.x, Node.js ≥ 20 + React 19, TanStack Router, TanStack Query, Tailwind CSS v4 (with `@theme` inline tokens in `apps/web/src/styles/app.css`). No new runtime dependencies.
- 014-infinitepay-gateway: Added TypeScript 5.x, Node.js ≥ 20 + Hono (HTTP), Drizzle ORM (Postgres), Better Auth (auth), grammY (Telegram). New: none — InfinitePay does not publish a TypeScript SDK; integration uses native `fetch`.
- 013-cloudflare-turnstile: Added TypeScript 5.x, Node.js ≥ 20 + Hono (API), Better Auth, React 19, TanStack Router, Tailwind v4, Cloudflare Turnstile (loaded via CDN script + `siteverify` HTTPS call)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
