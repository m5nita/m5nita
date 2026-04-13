# Implementation Plan: Stripe to Mercado Pago Migration

**Branch**: `012-stripe-to-mercadopago` | **Date**: 2026-04-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-stripe-to-mercadopago/spec.md`

## Summary

Replace Stripe Checkout with Mercado Pago Checkout Pro for pool entry payments, and remove all refund functionality. The payment gateway port/adapter pattern is already in place (hexagonal architecture), so the migration is primarily: (1) new `MercadoPagoPaymentGateway` adapter, (2) new webhook route for MP notifications, (3) remove `refund()` from port + adapters + use cases, (4) rename DB column, (5) remove Stripe SDK and code.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js >= 20)
**Primary Dependencies**: Hono (HTTP), Drizzle ORM, mercadopago SDK (new), Better Auth, grammY
**Storage**: PostgreSQL 16 via Drizzle ORM
**Testing**: Vitest
**Target Platform**: Node.js server (API) + React 19 PWA (Web)
**Project Type**: Web service (monorepo: apps/api + apps/web)
**Performance Goals**: API responses < 200ms p95
**Constraints**: BRL currency, amounts in centavos internally
**Scale/Scope**: Small user base, single payment flow (pool entry)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | PASS | SRP maintained; new adapter replaces old one; dead Stripe code removed |
| II. Testing Standards | PASS | Adapter tests for new MP gateway; domain tests unchanged; webhook integration tests |
| III. UX Consistency | PASS | Same redirect flow; payment-success page unchanged; error states preserved |
| IV. Performance Requirements | PASS | Same async webhook pattern; no performance regression expected |
| V. Hexagonal Architecture & SOLID | PASS | Perfect example of OCP/DIP — new adapter implements existing port; domain untouched |

**Gate result**: All principles pass. The hexagonal architecture was designed for exactly this scenario — switching payment providers by swapping adapters.

## Project Structure

### Documentation (this feature)

```text
specs/012-stripe-to-mercadopago/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
apps/api/
├── src/
│   ├── application/
│   │   ├── pool/
│   │   │   ├── CreatePoolUseCase.ts        # No changes (uses PaymentGateway port)
│   │   │   ├── JoinPoolUseCase.ts          # No changes (uses PaymentGateway port)
│   │   │   └── CancelPoolUseCase.ts        # MODIFY: remove refund logic
│   │   └── ports/
│   │       └── PaymentGateway.port.ts      # MODIFY: remove refund() method
│   ├── domain/                             # No changes (pure domain, no payment deps)
│   ├── infrastructure/
│   │   ├── external/
│   │   │   ├── MercadoPagoPaymentGateway.ts  # NEW: replaces StripePaymentGateway
│   │   │   ├── MockPaymentGateway.ts         # MODIFY: remove refund()
│   │   │   └── StripePaymentGateway.ts       # DELETE
│   │   └── http/
│   │       └── routes/
│   │           ├── webhooks.ts               # MODIFY: MP webhook replaces Stripe
│   │           └── pools.ts                  # MODIFY: remove refund from member delete
│   ├── services/
│   │   └── payment.ts                        # MODIFY: remove refund; update webhook handlers
│   ├── lib/
│   │   ├── mercadopago.ts                    # NEW: MP SDK initialization
│   │   └── stripe.ts                         # DELETE
│   ├── container.ts                          # MODIFY: wire MercadoPagoPaymentGateway
│   └── db/
│       └── schema/
│           └── payment.ts                    # MODIFY: rename column
├── drizzle/                                  # NEW migration for column rename
└── package.json                              # MODIFY: remove stripe, add mercadopago

apps/web/
├── src/
│   └── routes/
│       └── pools/
│           ├── create.tsx                    # No changes (just reads checkoutUrl)
│           ├── $inviteCode.tsx               # No changes (just reads checkoutUrl)
│           └── payment-success.tsx           # MODIFY: remove session_id query param
```

**Structure Decision**: Existing monorepo structure preserved. Changes are scoped to adapter replacement (infrastructure layer) and port interface simplification. Domain layer is completely untouched — validating the hexagonal architecture investment.

## Complexity Tracking

No violations. This migration is the canonical use case for hexagonal architecture + DIP.
