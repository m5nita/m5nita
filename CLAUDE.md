# manita Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-08

## Active Technologies
- TypeScript 5.x (Node.js >= 20) + Hono, Better Auth (phone-number plugin), Drizzle ORM, grammY (new) (002-telegram-otp)
- PostgreSQL 16 (new `telegram_chat` table) (002-telegram-otp)
- TypeScript 5.x (Node.js >= 20) + Hono (API), Better Auth + phone-number plugin, Drizzle ORM, grammY (Telegram), React 19, TanStack Router, TanStack Query (004-critical-fixes-telegram-reminders)
- TypeScript 5.x (Node.js >= 20) + Hono (API), Better Auth + phone-number plugin, Drizzle ORM, grammY (Telegram), React 19, TanStack Router, TanStack Query, Tailwind CSS v4 (005-winner-prize-withdrawal)
- TypeScript 5.x (Node.js >= 20) + Hono (API), Drizzle ORM, grammY (Telegram), React 19, TanStack Router/Query, Tailwind CSS v4 (006-multi-competition)
- TypeScript 5.x (Node.js >= 20) + Hono (API), React 19, TanStack Router/Query, grammY (Telegram), Drizzle ORM (007-fix-ux-scores-reminders)
- TypeScript 5.x (Node.js >= 20) + Hono (API), Better Auth 1.2.x (auth), Drizzle ORM, React 19, TanStack Router/Query, resend (new), jose (new) (008-social-email-auth)

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
- 008-social-email-auth: Added TypeScript 5.x (Node.js >= 20) + Hono (API), Better Auth 1.2.x (auth), Drizzle ORM, React 19, TanStack Router/Query, resend (new), jose (new)
- 007-fix-ux-scores-reminders: Added TypeScript 5.x (Node.js >= 20) + Hono (API), React 19, TanStack Router/Query, grammY (Telegram), Drizzle ORM
- 006-multi-competition: Added TypeScript 5.x (Node.js >= 20) + Hono (API), Drizzle ORM, grammY (Telegram), React 19, TanStack Router/Query, Tailwind CSS v4

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
