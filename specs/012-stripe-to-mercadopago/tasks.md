# Tasks: Stripe to Mercado Pago Migration

**Input**: Design documents from `/specs/012-stripe-to-mercadopago/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in the spec. Test tasks are omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new dependency, configure environment, prepare SDK initialization

- [x] T001 Install `mercadopago` SDK in `apps/api/package.json` (do NOT remove `stripe` yet — removed in T021)
- [x] T002 Create Mercado Pago SDK initialization module in `apps/api/src/lib/mercadopago.ts` — initialize `MercadoPagoConfig` with `MERCADOPAGO_ACCESS_TOKEN` env var, export client and `isMercadoPagoConfigured()` helper (mirror pattern from current `apps/api/src/lib/stripe.ts`)
- [x] T003 Add `MERCADOPAGO_ACCESS_TOKEN` and `MERCADOPAGO_WEBHOOK_SECRET` to `apps/api/.env.example`, remove `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema migration and port interface changes that MUST be complete before any user story work

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Rename column `stripe_payment_intent_id` to `external_payment_id` in Drizzle schema `apps/api/src/db/schema/payment.ts` — update field name, column mapping, and unique constraint
- [x] T005 Generate Drizzle migration for the column rename using `pnpm drizzle-kit generate` in `apps/api/`
- [x] T006 Remove `refund(paymentId: string): Promise<void>` method from `PaymentGateway` port interface in `apps/api/src/application/ports/PaymentGateway.port.ts`
- [x] T007 Update `apps/api/src/services/payment.ts` — rename all `stripePaymentIntentId` references to `externalPaymentId`, and remove the `createRefund()` function entirely

**Checkpoint**: Schema updated, port simplified, payment service cleaned — user story implementation can now begin

---

## Phase 3: User Story 1+2 - Pagamento via Mercado Pago (Priority: P1) MVP

**Goal**: Participants can pay pool entry fees via Mercado Pago Checkout Pro (both pool creation and invite join flows)

**Independent Test**: Create a pool with entry fee, get redirected to Mercado Pago, complete payment, verify member is added to pool. Same for joining via invite link.

### Implementation for User Story 1+2

- [x] T008 [US1] Create `MercadoPagoPaymentGateway` adapter in `apps/api/src/infrastructure/external/MercadoPagoPaymentGateway.ts` — implement `PaymentGateway.createCheckoutSession()` using MP Preference API: create preference with `items` (title, quantity, unit_price in BRL reais), `back_urls` (success, failure, pending), `auto_return: "approved"`, `external_reference` (payment record ID), `metadata` object with `userId`, `poolId`, `type` for traceability (per FR-012), `notification_url`; store preference ID in `externalPaymentId` column; return `init_point` as `checkoutUrl`
- [x] T009 [US1] Create Mercado Pago webhook route in `apps/api/src/infrastructure/http/routes/webhooks.ts` — replace Stripe webhook with `POST /api/webhooks/mercadopago`: verify `x-signature` header using HMAC-SHA256 with `MERCADOPAGO_WEBHOOK_SECRET`, handle `type === "payment"` by fetching payment details via `GET /v1/payments/{data.id}`, if status is `approved` call `handleCheckoutCompleted()` with `external_reference` as payment lookup key
- [x] T010 [US1] Update `handleCheckoutCompleted()` in `apps/api/src/services/payment.ts` to look up payment by `externalPaymentId` (was `stripePaymentIntentId`) — the lookup field name changed in T004
- [x] T011 [US1] Update `handleCheckoutExpired()` in `apps/api/src/services/payment.ts` to use `externalPaymentId` field name for the where clause
- [x] T012 [US1] Update `apps/api/src/container.ts` — replace `StripePaymentGateway` import with `MercadoPagoPaymentGateway`, update `buildContainer()` to instantiate `isMercadoPagoConfigured() ? new MercadoPagoPaymentGateway(client, db) : new MockPaymentGateway(db)`, remove Stripe imports and `getStripe()` helper
- [x] T013 [US1] Update `apps/api/src/infrastructure/external/MockPaymentGateway.ts` — rename `stripePaymentIntentId` to `externalPaymentId` in the insert values, remove `refund()` method entirely
- [x] T014 [US1] Update `apps/web/src/routes/pools/payment-success.tsx` — remove `session_id` search param dependency (page is now a static success message, no Stripe session verification needed)
- [x] T014a [US1] Write adapter test for `MercadoPagoPaymentGateway` in `apps/api/src/infrastructure/external/__tests__/MercadoPagoPaymentGateway.test.ts` — verify `createCheckoutSession()` creates preference with correct items, back_urls, external_reference, and metadata; verify `isConfigured()` returns true; mock MP SDK client
- [x] T014b [US1] Write integration test for MP webhook route in `apps/api/src/infrastructure/http/routes/__tests__/webhooks.test.ts` — verify signature validation rejects invalid headers, verify approved payment creates pool member (idempotently), verify non-approved statuses are ignored

**Checkpoint**: Pool creation and invite join both work with Mercado Pago payments. Webhooks correctly process approved payments. Adapter and webhook tests pass.

---

## Phase 4: User Story 4 - Remocao da funcionalidade de reembolso (Priority: P2)

**Goal**: Remove automatic refund processing from member removal and pool cancellation flows

**Independent Test**: Remove a member from a pool — member is deleted without refund. Cancel a pool — pool is cancelled and members removed without refunds.

### Implementation for User Story 4

- [x] T015 [US4] Update `CancelPoolUseCase` in `apps/api/src/application/pool/CancelPoolUseCase.ts` — remove `paymentGateway` dependency, remove refund loop over completed payments, remove `getCompletedEntryPayments` dependency; KEEP `hasPrizePayments` check (prevents cancellation after prize withdrawal — unrelated to refunds); simplify to just call `pool.cancel()` and `poolRepo.updateStatus()`, update output type to remove `refunds` array
- [x] T016 [US4] Update member deletion route in `apps/api/src/infrastructure/http/routes/pools.ts` — remove `createRefund(member.paymentId)` call from `DELETE /api/pools/:poolId/members/:memberId`, just delete the pool member and return `{ removed: true }`
- [x] T017 [US4] Update `apps/api/src/container.ts` — remove `paymentGateway` and `getCompletedEntryPayments` from `CancelPoolUseCase` constructor args; KEEP `hasPrizePayments` (still needed for prize withdrawal guard)
- [x] T017a [US4] Write unit test for simplified `CancelPoolUseCase` in `apps/api/src/application/pool/__tests__/CancelPoolUseCase.test.ts` — verify cancellation without refunds, verify `hasPrizePayments` guard still blocks cancellation after prize withdrawal, verify pool status set to cancelled

**Checkpoint**: Member removal and pool cancellation work without refund processing. CancelPoolUseCase tests pass.

---

## Phase 5: User Story 3 - Remocao do Stripe (Priority: P2)

**Goal**: Remove all Stripe code, SDK, and configuration from the codebase

**Independent Test**: Verify no references to Stripe exist in source code, `stripe` package is not in dependencies, app starts without Stripe env vars.

### Implementation for User Story 3

- [x] T018 [P] [US3] Delete `apps/api/src/infrastructure/external/StripePaymentGateway.ts`
- [x] T019 [P] [US3] Delete `apps/api/src/lib/stripe.ts`
- [x] T020 [US3] Remove any remaining Stripe imports or references across the codebase — grep for `stripe`, `Stripe`, `STRIPE_` and clean up any residual references in types, comments, or config files
- [x] T021 [US3] Remove `stripe` package from `apps/api/package.json` via `pnpm remove stripe` and verify it no longer appears in dependencies

**Checkpoint**: Zero Stripe references in the codebase. Application compiles and runs with only Mercado Pago configuration.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification and cleanup

- [x] T022 Run `pnpm biome check --write .` to fix any linting/formatting issues across changed files
- [x] T023 Run `pnpm build` to verify the full project compiles without errors
- [x] T024 Grep entire codebase for `stripe`, `Stripe`, `STRIPE_`, `stripePaymentIntentId` to confirm zero references remain
- [x] T025 Verify `pnpm dev` starts successfully without Stripe environment variables

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001 for SDK install) — BLOCKS all user stories
- **US1+US2 (Phase 3)**: Depends on Foundational (Phase 2) completion
- **US4 (Phase 4)**: Depends on Foundational (Phase 2) — can run in PARALLEL with Phase 3
- **US3 (Phase 5)**: Depends on Phase 3 (MP must be working before deleting Stripe) AND Phase 4 (refund code removed)
- **Polish (Phase 6)**: Depends on all phases complete

### User Story Dependencies

- **US1+US2 (P1)**: Depends on Phase 2 only — no dependencies on US3/US4
- **US4 (P2)**: Depends on Phase 2 only — can run in parallel with US1+US2
- **US3 (P2)**: Depends on US1+US2 complete (Stripe can only be deleted after MP is functional)

### Within Each User Story

- Schema/port changes before adapter implementation
- Adapter before webhook route
- Backend before frontend
- Core implementation before cleanup

### Parallel Opportunities

- T018 and T019 can run in parallel (independent file deletions)
- Phase 3 (US1+US2) and Phase 4 (US4) can run in parallel after Phase 2
- T010 and T011 touch the same file but different functions — run sequentially

---

## Parallel Example: Phase 3 + Phase 4

```
# After Phase 2 completes, these can run in parallel:

# Agent A: US1+US2 (Mercado Pago Integration)
Task: T008 "Create MercadoPagoPaymentGateway adapter"
Task: T009 "Create MP webhook route"
Task: T010 "Update handleCheckoutCompleted"
Task: T011 "Update handleCheckoutExpired"
Task: T012 "Update container.ts"
Task: T013 "Update MockPaymentGateway"
Task: T014 "Update payment-success page"

# Agent B: US4 (Remove Refund)
Task: T015 "Update CancelPoolUseCase"
Task: T016 "Update member deletion route"
Task: T017 "Update container.ts for CancelPoolUseCase"
```

**Note**: T012 and T017 both modify `container.ts` — if running in parallel, merge carefully.

---

## Implementation Strategy

### MVP First (US1+US2 Only)

1. Complete Phase 1: Setup (install SDK, create lib)
2. Complete Phase 2: Foundational (schema + port changes)
3. Complete Phase 3: US1+US2 (MP gateway + webhook)
4. **STOP and VALIDATE**: Test pool creation and invite join with Mercado Pago
5. Deploy/demo if ready — payments work via MP even with Stripe code still present

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1+US2 → MP payments working → MVP!
3. US4 → Refunds removed → Simplified cancellation flow
4. US3 → Stripe code deleted → Clean codebase
5. Polish → Verified, linted, building

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Amount conversion: internal centavos (integer) → MP reais (decimal, divide by 100)
- `external_reference` in MP Preference stores the internal payment record UUID
- Webhook two-step: receive notification → fetch payment details from MP API
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
