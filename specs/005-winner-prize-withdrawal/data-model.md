# Data Model: 005-winner-prize-withdrawal

**Date**: 2026-03-22

## New Entity: Prize Withdrawal

Represents a winner's request to withdraw their prize from a finalized pool.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Unique identifier |
| poolId | UUID | FK → pool.id, NOT NULL | The finalized pool |
| userId | text | FK → user.id, NOT NULL | The winner requesting withdrawal |
| paymentId | UUID | FK → payment.id, NOT NULL | Associated prize payment record |
| amount | integer | NOT NULL | Prize amount in centavos (winner's share) |
| pixKeyType | text | NOT NULL | Type: 'cpf', 'email', 'phone', 'random' |
| pixKey | text | NOT NULL | The actual PIX key value |
| status | text | NOT NULL, default 'pending' | Withdrawal status |
| createdAt | timestamp | NOT NULL, default now | When the request was created |
| updatedAt | timestamp | NOT NULL, default now | Last status update |

**Unique constraint**: `(poolId, userId)` - one withdrawal request per winner per pool.

**Status values**: `pending` | `processing` | `completed` | `failed`

**State transitions**:
```
pending → processing → completed
                    → failed → pending (retry)
```

## Modified Entity: Pool

Add support for the `closed` status transition (already defined in schema but not used for finalization).

| Change | Description |
|--------|-------------|
| status transition | `active` → `closed` (finalization by owner) |

No schema changes needed - `closed` is already a valid pool status.

## Modified Entity: Payment

New records of type `prize` will be created when a winner requests withdrawal.

| Field | Value for prize payments |
|-------|------------------------|
| type | `'prize'` |
| userId | Winner's user ID |
| poolId | The finalized pool ID |
| amount | Prize amount (winner's share, in centavos) |
| platformFee | 0 (fee already deducted in prize calculation) |
| status | `'pending'` initially |

No schema changes needed - `prize` type already exists in the payment type enum.

## Relationships

```
pool (1) ←→ (N) prizeWithdrawal
user (1) ←→ (N) prizeWithdrawal
payment (1) ←→ (1) prizeWithdrawal
```

## Prize Calculation

```
totalPrize = entryFee × memberCount × (1 - effectiveFeeRate)
winnerShare = totalPrize / numberOfTiedWinners
```

Where `effectiveFeeRate` considers any coupon discount applied to the pool.

## Validation Rules

- Pool must have status `closed` before any withdrawal can be created
- User must be ranked 1st (considering ties) in the pool's final ranking
- PIX key must match the expected format for its declared type
- Only one withdrawal per user per pool (unique constraint)
