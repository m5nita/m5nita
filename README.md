<div align="center">

<img src="apps/web/public/favicon.svg" alt="m5nita logo" width="80" height="80" />

# m5nita

**Palpites, ranking e prêmio. Simples assim.**

Bolão da Copa do Mundo 2026 — crie um bolão, convide os amigos, palpite nos jogos e leve o prêmio.

</div>

---

## Overview

m5nita (*manita*) is a Brazilian-Portuguese **prediction pool** PWA for the FIFA World Cup 2026. Players create or join a pool, pay a small entry fee, predict match scores, and the highest ranked member at the end of the tournament takes the prize — paid out automatically via PIX.

The codebase is a **pnpm monorepo** with a Hono API, a React 19 PWA, and a shared package for types and schemas. The API follows a **hexagonal architecture** (domain / application / infrastructure) and is designed to run on a single Node process with Postgres + Redis.

## Features

- **Pools** — create, join via invite link, admin controls, entry fee in centavos (BRL), 5% platform fee.
- **Predictions** — group stage and knockout matches, auto-save with debounce, locked at kickoff.
- **Ranking** — live scoring with tie-breakers, personal and global views.
- **Prize withdrawal** — winners submit a PIX key (encrypted at rest with AES-256-GCM) and receive payout.
- **Multi-gateway payments** — InfinitePay (default), MercadoPago or Stripe, selectable via env var.
- **Multi-auth** — phone OTP (WhatsApp & Telegram), magic-link email, Google OAuth — all powered by Better Auth.
- **Telegram bot** — OTP delivery, prediction reminders, withdrawal notifications, "mark as paid" admin actions.
- **Bot protection** — Cloudflare Turnstile on login entry points + per-phone rate limiting.
- **PWA** — installable, offline-ready, dark / light / system theme with no-flash SSR hydration.
- **Observability** — Sentry error & performance tracking on both API and web.

## Tech stack

**Backend** — TypeScript · [Hono](https://hono.dev) · [Better Auth](https://www.better-auth.com) · [Drizzle ORM](https://orm.drizzle.team) · [grammY](https://grammy.dev) · Zod · Resend · MercadoPago / Stripe SDKs

**Frontend** — React 19 · [TanStack Router](https://tanstack.com/router) · [TanStack Query](https://tanstack.com/query) · Tailwind CSS v4 · Vite · vite-plugin-pwa

**Data** — PostgreSQL 16 · Redis 7

**Tooling** — pnpm workspaces · Biome (lint + format) · Vitest · Playwright · Sentry · GitHub Actions

## Project structure

```text
apps/
  api/        Hono API — domain, application, infrastructure (hexagonal)
  web/        React 19 PWA — TanStack Router routes + Tailwind v4
packages/
  shared/     Shared Zod schemas, types and constants (centavos, BRL rules)
specs/        Feature specs (001 → 015) driving implementation
docs/         Operational docs (migrations, rollbacks)
scripts/      CI and demo-data scripts
```

## Getting started

### Prerequisites

- Node.js **≥ 20** (see `.nvmrc`)
- pnpm **9.15+**
- Docker (for local Postgres + Redis)

### Install

```bash
pnpm install
```

### Configure environment

Copy the two example files and fill in the secrets you actually need:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

> [!TIP]
> For local development you only need `DATABASE_URL`, `BETTER_AUTH_SECRET` and `PIX_ENCRYPTION_KEY`. Generate secrets with `openssl rand -base64 32`. Leave Sentry, Turnstile and real payment gateways empty and the app will fall back to test stubs.

### Start infrastructure

```bash
docker compose up -d          # postgres (5432), postgres-test (5433), redis (6379)
pnpm --filter @m5nita/api db:migrate
pnpm --filter @m5nita/api db:seed
```

### Run dev servers

```bash
pnpm dev
```

This starts the API on `http://localhost:3001` and the web app on `http://localhost:5173` in parallel.

## Scripts

Run from the repository root — pnpm fans them out to every package.

| Command | Description |
| --- | --- |
| `pnpm dev` | Start API + Web in watch mode |
| `pnpm build` | Production build (`tsc` + Vite) |
| `pnpm test` | Run Vitest suites across packages |
| `pnpm typecheck` | TypeScript project-wide check |
| `pnpm lint` / `pnpm lint:fix` | Biome check / autofix |

API-only (run with `pnpm --filter @m5nita/api <script>`):

| Command | Description |
| --- | --- |
| `db:generate` | Generate a new Drizzle migration from schema changes |
| `db:migrate` | Apply pending migrations |
| `db:push` | Push schema directly (dev only) |
| `db:studio` | Open Drizzle Studio |
| `db:seed` | Seed demo competition, matches and users |
| `db:backfill-encrypt-pix-keys` | One-shot: encrypt existing PIX keys at rest |

## Payments

The active gateway is picked by `PAYMENT_GATEWAY` (`mercadopago` | `stripe` | `infinitepay`). Each gateway has its own webhook signature verification — webhook routes bypass CSRF for this reason.

> [!IMPORTANT]
> All monetary values are stored and exchanged in **centavos** (integer BRL cents). Conversions to `R$ XX,YY` happen only at the UI layer. Never introduce floats for money.

## Telegram bot

The API registers Telegram webhook routes under `/api/telegram/*`. Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` and `TELEGRAM_BOT_USERNAME`, then point the bot's webhook at `https://<your-host>/api/telegram/webhook`. The bot handles OTP delivery, prediction reminders and withdrawal notifications — see `apps/api/src/infrastructure/http/routes/telegram.ts`.

## Deployment

CI runs on GitHub Actions (`.github/workflows/ci.yml`) — lint, typecheck and test on every PR. The deploy pipeline (`deploy.yml`) builds both Docker images (`apps/api/Dockerfile`, `apps/web/Dockerfile`) and notifies via Telegram on success or failure. The web image is served by Nginx (`apps/web/nginx.conf`); the API exposes `/api/health` for container healthchecks.

> [!NOTE]
> Live scores sync every minute, fixtures every 6 hours, and prediction reminders fire every 15 minutes — all driven by in-process intervals wrapped in Sentry cron monitors. No external scheduler is required.
