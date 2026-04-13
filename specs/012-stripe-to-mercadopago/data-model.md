# Data Model: Stripe to Mercado Pago Migration

**Feature**: 012-stripe-to-mercadopago
**Date**: 2026-04-13

## Schema Changes

### Payment Table

**Current schema** (`db/schema/payment.ts`):

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| userId | text | FK → user.id |
| poolId | uuid | FK → pool.id |
| amount | integer | In centavos (BRL) |
| platformFee | integer | In centavos (BRL) |
| stripePaymentIntentId | text | UNIQUE — stores Stripe session ID |
| status | text | pending, completed, refunded, expired |
| type | text | entry, refund, prize |
| createdAt | timestamp | |
| updatedAt | timestamp | |

**New schema** (after migration):

| Column | Type | Change | Notes |
|--------|------|--------|-------|
| id | uuid | — | PK |
| userId | text | — | FK → user.id |
| poolId | uuid | — | FK → pool.id |
| amount | integer | — | In centavos (BRL) |
| platformFee | integer | — | In centavos (BRL) |
| externalPaymentId | text | RENAMED | Was `stripePaymentIntentId`. Stores MP preference ID or payment ID |
| status | text | — | pending, completed, expired (note: "refunded" kept for historical records only) |
| type | text | — | entry, prize (note: "refund" type no longer created, kept for historical) |
| createdAt | timestamp | — | |
| updatedAt | timestamp | — | |

### Migration

```sql
ALTER TABLE payment RENAME COLUMN stripe_payment_intent_id TO external_payment_id;
```

Single column rename. No data transformation needed. Existing Stripe session IDs remain as-is in the renamed column.

## Entity Impact

### Payment entity (DB record)

- Field `stripePaymentIntentId` → `externalPaymentId` in Drizzle schema and all code references
- Status `refunded` is no longer assigned by the system but historical records may have it
- Type `refund` is no longer created but historical records may have it

### PaymentGateway port (application/ports)

**Before**:
```
createCheckoutSession(params) → CheckoutResult
refund(paymentId) → void
isConfigured() → boolean
```

**After**:
```
createCheckoutSession(params) → CheckoutResult
isConfigured() → boolean
```

### Mercado Pago Preference (external, not persisted)

Created via MP SDK when initiating checkout. Key fields:

- `items`: Array with title, quantity, unit_price (in BRL reais, not centavos)
- `back_urls`: success, failure, pending URLs
- `auto_return`: "approved"
- `external_reference`: Internal payment record ID
- `notification_url`: Webhook endpoint URL

The preference `id` is stored in `externalPaymentId` column after creation.

## No New Tables

No new database tables are needed. The migration is a column rename only.
