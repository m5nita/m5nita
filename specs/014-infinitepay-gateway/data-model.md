# Data Model: InfinitePay Payment Gateway

**Feature**: 014-infinitepay-gateway
**Date**: 2026-04-16

This feature introduces **no new database tables, no new columns, and no migrations**. It reuses the existing `payment` table with a small change in how one column is interpreted when the active gateway is InfinitePay.

---

## Existing entities (touched, but not modified)

### Payment (`apps/api/src/db/schema/payment.ts`)

| Column | Type | InfinitePay-specific notes |
|---|---|---|
| `id` | `uuid` (PK) | Used as the local stable reference; passed in the `nsu` parameter of the create-link call so InfinitePay echoes it back. |
| `userId` | `text` (FK → user) | Unchanged. |
| `poolId` | `uuid` (FK → pool) | Unchanged. |
| `amount` | `integer` (centavos, BRL) | Unchanged. Sent to InfinitePay as `price` (cents). |
| `platformFee` | `integer` (centavos, BRL) | Unchanged. Internal accounting only — not split at payment time (clarification Q2). |
| `externalPaymentId` | `text` (unique, nullable) | Stores composite reference `"{slug}:{order_nsu}"` returned by InfinitePay's create-link response. The `slug` half is required to call `payment_check`. Webhook lookup of the local payment uses the primary key (`payment.id == order_nsu`), not this column — so the `LIKE` pattern is avoided. |
| `status` | `text` (default `'pending'`) | Enum unchanged: `'pending'` \| `'completed'` \| `'expired'`. See status-mapping table below. |
| `type` | `text` | Unchanged: `'entry'` \| `'prize'`. InfinitePay only handles `'entry'` (clarification Q1). |
| `createdAt` | `timestamp` | Unchanged. |
| `updatedAt` | `timestamp` | Unchanged. |

**No migration required.** The semantic change to `externalPaymentId` (composite string) is a per-gateway interpretation; the column type already accepts it.

### Pool (`apps/api/src/db/schema/pool.ts`) and PoolMember
Unchanged. Activated by the existing `handleCheckoutCompleted` use case after the InfinitePay confirmation flow completes — same downstream side effects as today.

---

## New operational configuration (not stored in DB)

### InfinitePay Gateway Configuration

| Field | Source | Required when |
|---|---|---|
| `handle` | env var `INFINITEPAY_HANDLE` | `PAYMENT_GATEWAY=infinitepay` AND `NODE_ENV=production` |

Loaded at process start by `apps/api/src/lib/infinitepay.ts` and exposed as `infinitePayConfig: { handle: string } | null`.

---

## Status mapping (InfinitePay → local)

| InfinitePay `payment_check` status | Local `payment.status` after handling | Side effect |
|---|---|---|
| `paid` / `approved` | `'completed'` | `handleCheckoutCompleted(paymentId)` runs (idempotent: activates pool, creates `poolMember` once). |
| `pending` / `processing` | unchanged (`'pending'`) | None. |
| `rejected` / `failed` / `cancelled` | `'expired'` | Customer may retry from pool entry surface. |
| `expired` | `'expired'` | Same as above. |
| Any other / unknown | unchanged | Logged at `warn`. Treated as transient. |

---

## Lifecycle / state diagram

```text
                  createCheckoutSession()
                          │
                          ▼
                   ┌──────────────┐
                   │  pending     │◄──── webhook/status: pending|processing
                   └──┬───┬───┬───┘
   webhook/status:    │   │   │   webhook/status: rejected|failed|cancelled|expired
   paid|approved      │   │   │
                      ▼   │   ▼
              ┌───────────┘   ┌─────────┐
              │               │ expired │ ───► customer may retry (new payment row)
              ▼               └─────────┘
       ┌──────────────┐
       │  completed   │ ◄──── webhook redelivery (idempotent no-op)
       └──────┬───────┘
              │
              ▼
   handleCheckoutCompleted side effects:
   • pool.status: pending → active (if first entry)
   • poolMember insert (guarded by findFirst)
   • audit log entry
```

---

## Validation rules (enforced in adapter or webhook)

- `params.amount` MUST be `> 0` and an integer (centavos). Adapter throws on violation.
- `params.userId` MUST exist in `user` table. Enforced upstream by use case (no change here).
- `params.poolId` MUST exist in `pool` table. Enforced upstream by use case (no change here).
- Webhook body MUST be JSON. Non-JSON returns HTTP 400. Body is otherwise treated as untrusted (no further schema validation beyond the reference extraction).
- `externalPaymentId` parsed as composite MUST split on a single `':'` and produce two non-empty halves; otherwise the `payment_check` call is skipped and the webhook is rejected as malformed reference.

---

## Cross-references

- Port unchanged: see `contracts/payment-gateway-port.md`.
- Outbound API request/response shapes: see `contracts/infinitepay-create-link.md` and `contracts/infinitepay-payment-check.md`.
- Inbound webhook route shape: see `contracts/webhook-infinitepay.md`.
