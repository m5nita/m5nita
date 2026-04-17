# Implementation Plan: InfinitePay Payment Gateway

**Branch**: `014-infinitepay-gateway` | **Date**: 2026-04-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/014-infinitepay-gateway/spec.md`

## Summary

Add InfinitePay as a third deploy-time-selectable payment gateway alongside Stripe and Mercado Pago. Implementation is confined to the infrastructure layer: a new `InfinitePayPaymentGateway` adapter implementing the existing `PaymentGateway` port, a new `POST /api/webhooks/infinitepay` route, a new branch in `buildPaymentGateway()` activated by `PAYMENT_GATEWAY=infinitepay`, and a single new env var (`INFINITEPAY_HANDLE`). No domain or application changes, no database migrations, no front-end changes. Webhook authenticity is established via active confirmation against InfinitePay's `payment_check` endpoint — the inbound notification body is treated as untrusted, mirroring the MercadoPago integration pattern.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js ≥ 20
**Primary Dependencies**: Hono (HTTP), Drizzle ORM (Postgres), Better Auth (auth), grammY (Telegram). New: none — InfinitePay does not publish a TypeScript SDK; integration uses native `fetch`.
**Storage**: PostgreSQL 16 via Drizzle. Reuses existing `payment` table; no schema changes.
**Testing**: Vitest. New unit tests for the adapter (mocking `fetch`); new integration test for the webhook route (mocking `fetch` calls to InfinitePay).
**Target Platform**: Linux server (containerized API). Brazil-only delivery (BRL).
**Project Type**: Monorepo (web application). Touches `apps/api` only.
**Performance Goals**: Webhook handler responds within 1s under normal InfinitePay API latency (one outbound `payment_check` round-trip per webhook). Adapter `createCheckoutSession` returns within 1s under normal InfinitePay API latency. Adapter unit tests run in <100ms each.
**Constraints**: Webhook route MUST be idempotent; MUST NOT trust webhook body. Adapter MUST NOT log card data, full auth headers, or the InfiniteTag handle in error contexts visible to clients. BRL centavos throughout (consistent with existing `payment.amount`).
**Scale/Scope**: One adapter file (~150 LOC), one webhook route addition (~50 LOC), one container branch (~10 LOC), one env-var validator addition. Tests: ~250 LOC across two files. Total net diff target: <500 LOC.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Code Quality
- ✅ New adapter is a single class, single public method (`createCheckoutSession`) plus `isConfigured()`. Class size projected <50 lines. Method size <10 lines (helper functions extracted for body building and status mapping).
- ✅ All public functions typed; no `any`. InfinitePay's API responses parsed via Zod schemas to produce typed values at the boundary.
- ✅ No commented-out code, no TODO comments. Naming follows existing conventions (`InfinitePayPaymentGateway`, `INFINITEPAY_HANDLE`).
- ⚠️ The `PaymentGateway` port already uses raw primitives (`userId: string`, `amount: number`) for domain concepts. This is a pre-existing port shape, not introduced by this feature. The new adapter conforms to that shape. Documented in Complexity Tracking.

### II. Testing Standards
- ✅ Adapter unit tests cover: happy-path checkout creation, failure when InfinitePay API rejects, failure when DB insert fails, mock-mode behavior, payload shape verification. Target: 100% line coverage of the new adapter.
- ✅ Webhook route integration test covers: untrusted-body rejection paths, successful active confirmation, duplicate-webhook idempotency, unknown payment ID rejection.
- ✅ Mocking limited to `fetch` (external boundary) and Drizzle DB (per existing adapter test pattern). No domain mocking.

### III. UX Consistency
- ✅ No new UI surfaces. Existing payment-success page is reused. Spec FR-016 explicitly requires gateway-neutral copy.
- ✅ Customer-visible error messages on checkout-creation failure use existing user-facing error message conventions (no leaking InfinitePay-specific or credential-revealing text).

### IV. Performance Requirements
- ⚠️ Webhook handler latency target: <1s p95 (single outbound HTTPS round-trip to InfinitePay + DB writes). This exceeds Principle IV's 200ms p95 target for API responses. The handler is a third-party-bound endpoint, not user-perceived; latency is dominated by InfinitePay's `payment_check` round-trip and is fundamentally bounded by the public internet. Same envelope as the existing MercadoPago webhook handler. Documented in Complexity Tracking.
- ⚠️ Checkout-link creation latency target: <1s p95 (single outbound HTTPS round-trip to InfinitePay + 2 DB writes). User-facing — exceeds Principle IV's 200ms target for the same third-party-bound reason. Same envelope as the existing MercadoPago and Stripe checkout-creation paths. Documented in Complexity Tracking.
- ✅ No client-bundle changes; no front-end performance impact. The 1.5s page-load and 100ms client-interaction targets remain unaffected.

### V. Hexagonal Architecture & SOLID
- ✅ **Dependency Rule**: New code lives only in `infrastructure/`. No imports added to `domain/` or `application/`. The existing `PaymentGateway` port (in `application/ports/`) is unchanged.
- ✅ **OCP**: Behavior is extended via a new adapter; no existing payment code is modified beyond the `buildPaymentGateway()` branch (composition root only).
- ✅ **LSP**: New adapter is substitutable for the port; tests verify it returns the same `CheckoutResult` shape.
- ✅ **DIP**: Use cases continue to depend on the port abstraction; the choice of InfinitePay is invisible to them.
- ✅ Manual DI in `container.ts` only.
- ⚠️ Value objects: This feature does not introduce value objects because the port surface uses raw primitives (pre-existing). No new domain primitives are introduced. This is consistent with existing payment adapters and is not a regression.

**Result**: PASS with one documented pre-existing pattern (raw primitives in port). No new violations introduced.

## Project Structure

### Documentation (this feature)

```text
specs/014-infinitepay-gateway/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── payment-gateway-port.md      # Existing port (unchanged) — reference
│   ├── infinitepay-create-link.md   # Outbound: POST to InfinitePay create-link
│   ├── infinitepay-payment-check.md # Outbound: POST to InfinitePay payment-check
│   └── webhook-infinitepay.md       # Inbound: POST /api/webhooks/infinitepay
├── checklists/
│   └── requirements.md  # Spec quality checklist (already created)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
apps/api/
├── src/
│   ├── application/
│   │   └── ports/
│   │       └── PaymentGateway.port.ts        # UNCHANGED
│   ├── infrastructure/
│   │   ├── external/
│   │   │   ├── InfinitePayPaymentGateway.ts  # NEW
│   │   │   ├── MercadoPagoPaymentGateway.ts  # UNCHANGED
│   │   │   └── __tests__/
│   │   │       └── InfinitePayPaymentGateway.test.ts  # NEW
│   │   └── http/
│   │       └── routes/
│   │           └── webhooks.ts                # +InfinitePay route added
│   ├── lib/
│   │   └── infinitepay.ts                    # NEW: env-driven config presence check
│   ├── services/
│   │   └── payment.ts                        # UNCHANGED (handleCheckoutCompleted reused)
│   ├── db/
│   │   └── schema/
│   │       └── payment.ts                    # UNCHANGED
│   └── container.ts                          # +InfinitePay branch in buildPaymentGateway
└── tests/
    └── integration/
        └── webhooks-infinitepay.test.ts      # NEW
```

**Structure Decision**: This feature is contained entirely within `apps/api`. No `apps/web` or `packages/shared` changes. The new files mirror the MercadoPago adapter's location and naming.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Raw primitives in `PaymentGateway` port (`userId: string`, `amount: number`) | The port shape is pre-existing and shared with Stripe and MercadoPago adapters. Changing the port to use value objects (`UserId`, `Money`) is a separate refactor that would touch every adapter and every use case that calls them. | Introducing value objects only on the InfinitePay side would create inconsistency between adapters implementing the same port — strictly worse than uniform pre-existing shape. A port-wide refactor is out of scope for this feature. |
| Webhook handler latency target <1s p95 vs Principle IV's 200ms p95 | The handler must perform an outbound `payment_check` HTTPS call to InfinitePay before returning. Public-internet round-trip alone routinely exceeds 200ms; sub-200ms is unattainable for any third-party-bound endpoint. The handler is invoked by InfinitePay's retry-capable webhook delivery, not by an interactive user, so user-perceived latency is unaffected. | Background-queue + 202 ACK pattern: rejected — adds infrastructure (queue, worker), and the existing MercadoPago handler establishes the same synchronous pattern. Caching `payment_check` results: rejected — the call exists precisely to obtain the latest authoritative status. |
| Checkout-creation latency target <1s p95 vs Principle IV's 200ms p95 | The adapter must perform an outbound create-link HTTPS call to InfinitePay before returning a checkout URL the customer can navigate to. The URL cannot be minted locally. Same constraint applies to MercadoPago and Stripe today. | Returning a placeholder + populating asynchronously: rejected — the customer needs the URL synchronously to be redirected. Pre-creating links: rejected — InfinitePay scopes each link to a specific order_nsu and customer. |
