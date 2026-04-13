# Research: Stripe to Mercado Pago Migration

**Feature**: 012-stripe-to-mercadopago
**Date**: 2026-04-13

## R1: Mercado Pago Checkout Pro — Redirect Flow

**Decision**: Use Mercado Pago Checkout Pro with "Preference" API for redirect-based checkout.

**Rationale**: Checkout Pro provides a hosted payment page (like Stripe Checkout) supporting PIX, credit cards, boleto, and other Brazilian payment methods. The flow is analogous to the current Stripe implementation:

1. Backend creates a "Preference" via `POST /checkout/preferences` (equivalent to Stripe Checkout Session)
2. Preference contains: items (title, quantity, unit_price in BRL), back_urls (success, failure, pending), notification_url, metadata (external_reference)
3. Preference response includes `init_point` URL (equivalent to Stripe's `session.url`)
4. Frontend redirects user to `init_point`
5. After payment, user is redirected to configured `back_urls`
6. Webhook notification is sent asynchronously

**Alternatives considered**:
- Mercado Pago Checkout Bricks (embedded components): More complex integration, unnecessary for a simple entry fee payment
- Mercado Pago Transparent Checkout (API-only): Requires PCI compliance handling, overkill for this use case
- Checkout Pro is the closest 1:1 replacement for Stripe Checkout redirect flow

## R2: Mercado Pago Webhooks

**Decision**: Use Mercado Pago Webhooks (not IPN) for payment notifications.

**Rationale**:
- Webhooks support signature verification via `x-signature` header (IPN does not)
- Webhook payload is lightweight: `{ type: "payment", data: { id: "123" } }`
- Must `GET /v1/payments/{id}` to fetch full payment details (unlike Stripe which sends full object)
- Subscribe to `payment` topic for status updates (approved, rejected, pending, cancelled)
- `notification_url` can be set per-preference or globally in dashboard

**Key difference from Stripe**: Two-step process — receive notification ID, then fetch payment details. Stripe sends the full event payload in the webhook body.

## R3: Mercado Pago SDK for Node.js

**Decision**: Use official `mercadopago` npm package.

**Rationale**:
- Official SDK maintained by Mercado Pago
- Provides `Preference` and `Payment` client classes
- Authentication via `ACCESS_TOKEN` (single token, simpler than Stripe's key + webhook secret)
- SDK usage: `new MercadoPagoConfig({ accessToken })` → `new Preference(client).create({ body })`

**Alternatives considered**:
- Direct HTTP API calls: More boilerplate, no type safety
- SDK provides type definitions and handles auth headers automatically

## R4: Webhook Signature Verification

**Decision**: Validate `x-signature` header using HMAC with webhook secret from dashboard.

**Rationale**:
- MP sends `x-signature` header with format: `ts=TIMESTAMP,v1=HMAC_HASH`
- Verification: compute HMAC-SHA256 of `id:{data.id};request-id:{x-request-id};ts:{timestamp};` using webhook secret
- Compare computed hash with `v1` value from header
- Webhook secret is obtained from MP developer dashboard (Webhooks configuration)

## R5: Metadata / External Reference

**Decision**: Use `external_reference` field in Preference to store `paymentId` (internal DB record ID).

**Rationale**:
- Stripe used `metadata` object with `{ userId, poolId, type }` — but this was redundant since we look up by session ID
- MP's `external_reference` is a single string field, ideal for storing the internal payment record ID
- When webhook arrives, fetch payment from MP API, extract `external_reference`, look up internal payment record
- This simplifies the lookup compared to the current Stripe flow (which stores `session.id` in `stripePaymentIntentId`)

## R6: Refund Removal Strategy

**Decision**: Remove `refund()` from PaymentGateway port and all call sites.

**Rationale**:
- Business decision: refunds handled manually outside the platform
- Affected code:
  - `PaymentGateway.port.ts`: Remove `refund()` method from interface
  - `StripePaymentGateway.ts`: Deleted entirely (along with all Stripe code)
  - `MockPaymentGateway.ts`: Remove `refund()` method
  - `CancelPoolUseCase.ts`: Remove refund loop; just cancel pool and remove members
  - `pools.ts` route (DELETE member): Remove `createRefund()` call; just delete member
  - `payment.ts` service: Remove `createRefund()` function

## R7: Database Column Rename Strategy

**Decision**: Rename `stripe_payment_intent_id` to `external_payment_id` via Drizzle migration.

**Rationale**:
- Generic name accommodates any payment provider
- Existing data (Stripe session IDs) preserved in the renamed column
- MP will store preference ID or payment ID in this same column
- Single ALTER TABLE RENAME COLUMN migration — no data loss

**Alternatives considered**:
- Add new column + drop old: Unnecessary complexity, data migration risk
- Keep `stripe_payment_intent_id` name: Confusing when using MP
