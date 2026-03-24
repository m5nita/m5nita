# Quickstart: 005-winner-prize-withdrawal

**Date**: 2026-03-22

## Prerequisites

- Node.js >= 20
- PostgreSQL 16 running locally
- pnpm installed
- `.env` configured (copy from `.env.example`)

## Setup

```bash
# Install dependencies
pnpm install

# Push schema changes (dev only - includes new prizeWithdrawal table)
pnpm drizzle-kit push

# Start dev servers
pnpm dev
```

## Testing the Feature

### 1. Finalize a Pool

To test pool finalization, you need a pool with all matches finished:

```bash
# Ensure all matches have status 'finished' in the database
# The owner can then finalize via the pool manage page
```

### 2. Request Prize Withdrawal

After finalization:
1. Log in as the winner (1st place in ranking)
2. Navigate to the finalized pool
3. The prize withdrawal section appears with the prize amount
4. Enter a PIX key and confirm

### 3. Verify Cancellation Block

After a prize withdrawal is requested:
1. Log in as the pool owner
2. Try to cancel the pool
3. Should see error: "Nao e possivel cancelar o bolao apos solicitacao de retirada do premio"

## Key Files

### Backend (apps/api/src/)
- `db/schema/prizeWithdrawal.ts` - New table schema
- `services/prizeWithdrawal.ts` - Prize withdrawal business logic
- `services/pool.ts` - Pool finalization logic (extended)
- `routes/pools.ts` - New endpoints (close, prize, withdraw)
- `lib/telegram.ts` - Winner notification (extended)

### Frontend (apps/web/src/)
- `routes/pools/$poolId/index.tsx` - Pool detail (extended with prize info)
- `components/PrizeWithdrawal.tsx` - Prize withdrawal form component
- `components/PixKeyInput.tsx` - PIX key input with type selection and validation

### Shared (packages/shared/src/)
- `schemas/index.ts` - PIX key validation schemas
- `types/index.ts` - PrizeWithdrawal type, PrizeInfo type
- `constants/index.ts` - PIX key types, withdrawal statuses

## Database Changes

New table: `prize_withdrawal`
- References: pool, user, payment
- Unique constraint: (poolId, userId)

No changes to existing tables (pool status `closed` and payment type `prize` already exist).
