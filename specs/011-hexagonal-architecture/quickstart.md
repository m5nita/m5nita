# Quickstart: Migração para Arquitetura Hexagonal

## Prerequisites

- Node.js >= 20
- pnpm
- PostgreSQL 16 (for integration tests)

## Running the project

```bash
pnpm install
pnpm dev          # Start API + Web dev servers
```

## Running tests

```bash
# All tests (should pass at every migration phase)
pnpm test

# API tests only
pnpm --filter api test

# Run a specific test file
pnpm --filter api vitest run src/domain/scoring/Score.test.ts
```

## Lint & Typecheck

```bash
pnpm biome check --write .    # Lint + format
pnpm -r typecheck             # TypeScript check
```

## Verifying a migration phase

After completing each phase, run all three checks:

```bash
pnpm test && pnpm -r typecheck && pnpm biome check .
```

All 116+ tests must pass. No typecheck errors. No lint errors.

## Domain layer validation

To verify the domain layer has zero infrastructure dependencies:

```bash
# Should return 0 results — no Drizzle, Hono, Stripe, etc. in domain/
grep -r "from 'drizzle\|from 'hono\|from 'stripe\|from '@m5nita/shared/schemas" apps/api/src/domain/ || echo "✅ Domain layer is clean"
```

## Running domain tests only

Domain tests are pure unit tests (no DB, no HTTP):

```bash
pnpm --filter api vitest run src/domain/
```

These should complete in < 50ms.
