# Contract: `POST /api/pools/:poolId/stats/unlock`

Creates a one-time Pix checkout to unlock statistics for `(currentUser, poolId)`. Route in `apps/api/src/infrastructure/http/routes/stats.ts`, delegates to `UnlockStatsUseCase`. Reuses the existing `PaymentGateway` port + adapters; **no webhook route changes**.

## Auth & preconditions

- Authenticated session required.
- Current **membership** of `:poolId` required (you unlock stats for a pool you are in).
- If already unlocked → `409 ALREADY_UNLOCKED` (no second charge; idempotent at the gate).

## Path params

| Param | Type | Notes |
|---|---|---|
| `poolId` | uuid | pool to unlock stats for |

## Request body

Empty. Amount and type are server-decided (the front never sets price — FR-005).

## Behavior

`UnlockStatsUseCase.execute({ userId, poolId })`:
1. Verify membership + not-already-unlocked.
2. `paymentGateway.createCheckoutSession({ userId, poolId, amount: statsUnlockPrice.centavos, platformFee: statsUnlockPrice.centavos, type: 'stats_unlock', description: 'Estatísticas do bolão' })`.
3. Return the checkout result.

Does **not** call `FeePolicy`/`PrizeCalculation`; the amount composes no prize pot (FR-008).

## Responses

### 200

```json
{
  "payment": { "id": "…" },
  "checkoutUrl": "https://…",
  "amount": 199
}
```

- `checkoutUrl` may be `null` for the Mock gateway in dev (payment auto-completes; see quickstart).

### 409 — `ALREADY_UNLOCKED`
### 401 — unauthenticated
### 404 — not a member of `:poolId`

## Completion (webhook — existing routes unchanged)

On Pix confirmation, the existing webhook (`infrastructure/http/routes/webhooks.ts`) calls `handleCheckoutCompleted(paymentId)` (`services/payment.ts:8`). The handler:
1. Idempotent CAS: `UPDATE payment SET status='completed' WHERE id=? AND status != 'completed'` (existing). Re-deliveries are no-ops.
2. Dispatch on `paymentRecord.type`:
   - `'entry'` → existing behavior (activate pool + insert `poolMember`).
   - `'stats_unlock'` → `statsUnlockRepo.grant(userId, poolId, paymentId)` (`INSERT … ON CONFLICT (user_id,pool_id) DO NOTHING`) + `statsRepo.recomputeSnapshot(poolId, userId)` to bootstrap. **Never** writes `poolMember`, never activates a pool, never touches prize/fee.

Idempotency guarantees (FR-007, SC-002):
- The payment CAS ensures completion logic runs at most once.
- The `stats_unlock` unique `(user_id, pool_id)` + `ON CONFLICT DO NOTHING` ensures exactly one entitlement even under concurrent/duplicate deliveries.

## Client flow (front)

`POST /stats/unlock` → redirect `window.location.href = checkoutUrl` → return via `routes/pools/payment-success.tsx` polling (`MAX_ATTEMPTS=6`, `POLL_INTERVAL_MS=2000`) → on `completed`, navigate back to the stats tab which now returns the unlocked payload.
