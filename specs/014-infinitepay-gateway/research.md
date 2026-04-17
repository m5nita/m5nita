# Phase 0 Research: InfinitePay Payment Gateway

**Feature**: 014-infinitepay-gateway
**Date**: 2026-04-16

This document records the research conducted to resolve open technical questions before design. All decisions below are bounded by the spec (`spec.md`) and the constitutional constraints (`.specify/memory/constitution.md`).

---

## R-001: InfinitePay HTTP API surface

**Decision**: Use two endpoints from InfinitePay's public Checkout API.

| Purpose | Method | URL | Notes |
|---|---|---|---|
| Create checkout link | `POST` | `https://api.infinitepay.io/invoices/public/checkout/links` | Returns the customer-facing checkout URL plus identifiers (order_nsu, transaction_nsu, slug) used later to query payment status. |
| Verify payment status | `POST` | `https://api.infinitepay.io/invoices/public/checkout/payment_check` | Authoritative status lookup. Used both during webhook handling (active confirmation) and from operator-driven recovery scripts. |

**Rationale**: These are the documented public Checkout endpoints. They cover both halves of the flow (outbound link creation, inbound status verification). They do not require an OAuth token or signed JWT — the operator's "Handle" (InfiniteTag) acts as the merchant identifier; the `payment_check` request also requires the `slug` and `order_nsu` returned by the create-link call, which constitute the de-facto secret material binding the verification call to a specific local payment.

**Alternatives considered**:
- *Polling instead of active confirmation*: Rejected. Adds ongoing background load and increases time-to-confirmation. Active confirmation has the same correctness guarantees with lower overhead.
- *Trust webhook body and skip `payment_check`*: Rejected. InfinitePay's docs are silent on webhook signing. Trusting an unsigned body would expose us to forged status updates. Active confirmation removes this attack surface entirely.

---

## R-002: HTTP client

**Decision**: Use the platform's built-in `fetch` (Node 20+ global). Do not add a dependency for InfinitePay.

**Rationale**:
- InfinitePay does not publish an official TypeScript/Node SDK.
- The two endpoints we use are simple JSON-over-HTTPS POSTs.
- Adding `axios` or similar would violate the bundle/dependency-discipline guidance in the constitution (Principle IV).
- Node 20's `fetch` is stable, types are excellent via `lib.dom.d.ts`, and the existing project already uses `fetch` in adapters (e.g., Cloudflare Turnstile `siteverify` per spec 013).

**Alternatives considered**:
- *Drop-in axios wrapper*: Rejected on dependency-discipline grounds.
- *got / undici*: Rejected. No measurable benefit over native `fetch` for this volume.

---

## R-003: Active confirmation: how to map a webhook to a local payment

**Decision**: The webhook delivers a JSON body containing at minimum a payment/transaction identifier (`order_nsu` or `transaction_nsu`). The platform extracts this identifier *defensively* (treating the body as untrusted), then immediately POSTs to `payment_check` using the operator's `INFINITEPAY_HANDLE`, the local payment's persisted `slug`, and the extracted identifier. The response status from `payment_check` (one of `paid`, `pending`, `failed`/`rejected`, `expired`) is the authoritative state.

To support this, the local `payment.externalPaymentId` column will store a composite reference: `{slug}:{order_nsu}` produced by the create-link response. This single column is sufficient because both halves are needed by `payment_check`.

**Rationale**:
- Mirrors the existing MercadoPago pattern (webhook → `Payment.get({id})`), keeping operator-mental-model consistent.
- The composite-reference approach reuses the existing column without a schema change.
- The `payment_check` call inherently rejects forged identifiers (returns 4xx for unknown invoice/order combinations), giving us authentication for free.

**Alternatives considered**:
- *Store `slug` and `order_nsu` in separate columns*: Rejected. Requires a migration and a port-shape change. Composite string in `externalPaymentId` is sufficient and reversible.
- *Look up local payment by parsing webhook body*: Rejected. The webhook body is untrusted; we must NOT use it to select which local payment is updated. We parse the body only to extract the identifier we then verify against InfinitePay.

---

## R-004: Status mapping

**Decision**: Map InfinitePay's reported statuses to the existing `payment.status` enum.

| InfinitePay status (from `payment_check`) | Local `payment.status` | Behavior |
|---|---|---|
| `paid` / `approved` | `completed` | Run `handleCheckoutCompleted(paymentId)` (idempotent). |
| `pending` / `processing` | `pending` | No-op (state unchanged). |
| `rejected` / `failed` / `cancelled` | `expired` | Update column to `expired`. Customer can retry. |
| `expired` | `expired` | Update column to `expired`. |
| (anything else) | unchanged | Log warning; treat as transient. |

**Rationale**: The existing enum (`pending` | `completed` | `expired`) does not have a dedicated `failed` value. `expired` is the closest semantic fit for a non-retryable terminal failure and is already understood by the rest of the codebase as "this payment didn't complete and the customer must start a new one." Adding a new enum value would require a migration; the spec does not call for distinct user-visible treatment of failed-vs-expired.

**Alternatives considered**:
- *Add `failed` to the enum*: Rejected as a scope expansion. The existing `expired` already produces correct downstream behavior (no membership activation, retry possible).

---

## R-005: Configuration & env-var validation

**Decision**: Introduce one new env var.

| Name | Required when | Purpose |
|---|---|---|
| `INFINITEPAY_HANDLE` | `PAYMENT_GATEWAY=infinitepay` AND `NODE_ENV=production` | Operator's InfiniteTag (without leading `$`). Used as `handle` in API requests. |

A new file `apps/api/src/lib/infinitepay.ts` exports `infinitePayConfig: { handle: string } | null` — non-null when the handle is present, null otherwise. The container's `buildPaymentGateway()` checks this value, mirroring how `mercadoPagoClient` is checked today.

**Rationale**:
- Single env var keeps the deployment surface minimal.
- The "production-style refuse-to-start" behavior from FR-002 is implemented identically to existing gateways: `if (provider === 'infinitepay' && isProd && !infinitePayConfig) throw`.
- No webhook secret env var is needed because we do not validate webhook signatures (active confirmation supplants that).

**Alternatives considered**:
- *Per-pool handles*: Rejected as an out-of-scope marketplace feature (clarification Q2 → single operator account).
- *Separate webhook secret env var*: Rejected. Active confirmation does not use one.

---

## R-006: Mock-gateway fallback in development

**Decision**: When `PAYMENT_GATEWAY=infinitepay` and `INFINITEPAY_HANDLE` is missing in a non-production environment, the container returns the existing `MockPaymentGateway` (same fallback used by MercadoPago today) and emits a startup warning labeled `[InfinitePay]`.

**Rationale**: Reuses existing fallback machinery; no new mock implementation is needed. Behavior is identical to the existing gateway adapters.

---

## R-007: Idempotency strategy

**Decision**: Idempotency is enforced at two layers, both pre-existing in the codebase:

1. The `handleCheckoutCompleted(paymentId)` use case in `apps/api/src/services/payment.ts` short-circuits if `payment.status === 'completed'` (no double-activation, no duplicate `poolMember` insert).
2. The `pool_member` table's natural composite key `(poolId, userId)` plus the explicit `findFirst` guard in `handleCheckoutCompleted` prevents duplicate membership creation even under concurrent webhook redelivery.

The webhook route adds no new idempotency machinery. Returning HTTP 200 on duplicate webhook deliveries is therefore safe and matches the MercadoPago route's behavior.

**Rationale**: Reuse beats reinvention. Both layers are already covered by existing tests for the MercadoPago path; the new InfinitePay route exercises the same use case and inherits its guarantees.

---

## R-008: Error surfacing on checkout-creation failure

**Decision**: When the `POST /links` call to InfinitePay fails (network error, non-2xx response, or response missing required fields), the adapter throws a typed error caught at the route layer and surfaced to the customer as a generic, non-leaky message ("Não foi possível iniciar o pagamento. Tente novamente em alguns instantes."). The locally-persisted `payment` row created at the start of `createCheckoutSession` is rolled back via DB-level cleanup so it does not block retry — implemented as a try/catch around the outbound call that deletes the just-inserted row on failure (single transaction not required because the local row is the only side effect at that point).

**Rationale**:
- Avoids "stuck pending payment" rows that would block the customer from retrying (SC-006).
- A single DB delete on the catch path is simpler than a transaction wrapping a network call (transactions held open across HTTP calls are a known anti-pattern).

**Alternatives considered**:
- *Wrap in DB transaction*: Rejected. Holding a transaction across an HTTPS call to a third party is a classic anti-pattern (long-held locks, blocked connections).
- *Leave the row and mark `expired` on first webhook absence*: Rejected. Forces the customer to wait or contact support; violates SC-006.

---

## R-009: Logging policy

**Decision**: Log the following at `info`: create-link request initiation, create-link success (with InfinitePay-returned slug, NOT the handle), webhook receipt (with extracted reference, NOT the body), payment-status lookup result, status transition. Log at `warn`: rejected webhook (unknown reference), payment-status lookup returning unexpected status. Log at `error`: outbound call failures, DB write failures.

**Never logged**: full request/response bodies (may contain customer PII), the handle in any context visible outside server logs, any header named `Authorization`.

**Rationale**: Operational visibility per FR-014 without violating FR-015 (no credential leakage) or PII norms.

---

## Summary of resolved unknowns

All Technical Context items are resolved. There are no open `NEEDS CLARIFICATION` markers.
