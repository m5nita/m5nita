---
description: "Task list for implementing InfinitePay payment gateway"
---

# Tasks: InfinitePay Payment Gateway

**Input**: Design documents from `/specs/014-infinitepay-gateway/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED. Constitution Principle II mandates adapter tests verifying port conformance and webhook integration tests. Tests are written first (TDD) and must FAIL before the corresponding implementation task starts.

**Organization**: Tasks are grouped by user story. The three user stories in this feature are all P1 (foundational). They can be implemented sequentially as a single MVP; US2 and US3 may also be parallelized after US1's container wiring lands.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- File paths are absolute under the repository root `/Users/igortullio/Developer/igortullio/m5nita`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Document the new operator-supplied configuration so it surfaces in the standard onboarding path.

- [X] T001 [P] Add `INFINITEPAY_HANDLE` (with brief comment: "Operator's InfiniteTag without leading $; required when PAYMENT_GATEWAY=infinitepay in production") to `apps/api/.env.example`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: A single configuration module that every later phase imports.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Create `apps/api/src/lib/infinitepay.ts` exporting `infinitePayConfig: { handle: string } | null` — returns the object when `process.env.INFINITEPAY_HANDLE` is a non-empty string, otherwise returns `null`. Mirror the structure of `apps/api/src/lib/mercadopago.ts`.

**Checkpoint**: Foundation ready — User Story 1 implementation can now begin.

---

## Phase 3: User Story 1 — Operator deploys with InfinitePay as the active gateway (Priority: P1) 🎯 MVP

**Goal**: Operator can set `PAYMENT_GATEWAY=infinitepay` and have the API process start (with real adapter when configured, with mock fallback in dev, with hard refusal in prod when `INFINITEPAY_HANDLE` is missing).

**Independent Test**: Per `quickstart.md` sections 1 and 3 — start the API in dev with no handle (server runs, mock active, warning logged); start the API in prod simulation with no handle (process exits with descriptive error); start the API in dev or prod with handle (server runs, real adapter active).

### Implementation for User Story 1

- [X] T003 [US1] Create `apps/api/src/infrastructure/external/InfinitePayPaymentGateway.ts`. Define and export the class `InfinitePayPaymentGateway implements PaymentGateway` with constructor signature `(handle: string, db: typeof DbClient)`, an `isConfigured(): boolean` returning `true`, and a `createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult>` that throws `new Error('InfinitePayPaymentGateway.createCheckoutSession not yet implemented')`. Import `PaymentGateway`, `CheckoutParams`, `CheckoutResult` from `apps/api/src/application/ports/PaymentGateway.port.ts`. This skeleton enables T004 to compile; the body is filled in by T007.

- [X] T004 [US1] Add InfinitePay branch to `buildPaymentGateway()` in `apps/api/src/container.ts`. Place after the existing MercadoPago branch and before the final invalid-provider throw. Read `infinitePayConfig` from `apps/api/src/lib/infinitepay.ts`. Logic mirrors MercadoPago: `if (provider === 'infinitepay') { if (infinitePayConfig) return new InfinitePayPaymentGateway(infinitePayConfig.handle, db); if (isProd) throw new Error('PAYMENT_GATEWAY=infinitepay but INFINITEPAY_HANDLE is missing'); console.warn('[InfinitePay] No INFINITEPAY_HANDLE configured. Payment features will use mock mode.'); return new MockPaymentGateway(db); }`. Update the final invalid-provider error message to list `'infinitepay'` alongside `'stripe'` and `'mercadopago'`.

- [ ] T005 [US1] **MANUAL** — Manually verify per `specs/014-infinitepay-gateway/quickstart.md` sections 1 and 3: (a) start with `PAYMENT_GATEWAY=infinitepay` and no handle in dev → server starts, expected warning logged; (b) start with `PAYMENT_GATEWAY=infinitepay`, `NODE_ENV=production`, and no handle → process exits with the expected error message; (c) start with `PAYMENT_GATEWAY=infinitepay` and a handle in dev → server starts cleanly, no warning. Record outcomes in the PR description. **Deferred to operator — cannot be verified autonomously without running the server.**

**Checkpoint**: API starts under all three configuration variants. The adapter is selectable but does not yet process real payments.

---

## Phase 4: User Story 2 — Customer pays a pool entry through InfinitePay checkout (Priority: P1)

**Goal**: With `PAYMENT_GATEWAY=infinitepay` and a real handle configured, joining or creating a pool returns an InfinitePay-hosted checkout URL; the customer can pay; the local `payment` row is created with the composite `externalPaymentId` reference.

**Independent Test**: Per `quickstart.md` section 2 (with ngrok + sandbox handle) — joining a pool returns a checkout URL that, when followed, presents PIX, credit card, and boleto. Database after the call shows a `payment` row with `status='pending'` and `external_payment_id` matching `<slug>:<order_nsu>`.

### Tests for User Story 2 (TDD — write FIRST and confirm failing) ⚠️

- [X] T006 [P] [US2] Write failing unit tests in `apps/api/src/infrastructure/external/__tests__/InfinitePayPaymentGateway.test.ts`. Mock global `fetch` and the Drizzle DB client following the pattern in `apps/api/src/infrastructure/external/__tests__/MercadoPagoPaymentGateway.test.ts`. Cover:
  - `createCheckoutSession_buildsRequestPayloadCorrectly` — verifies POST body matches `contracts/infinitepay-create-link.md` (handle, redirect_url, webhook_url, order_nsu equals payment row id, items[0].price equals amount in centavos, customer fields populated when user has them on file).
  - `createCheckoutSession_persistsCompositeExternalPaymentId` — after success, asserts the DB update set `externalPaymentId === '<slug>:<order_nsu>'` returned by the mocked InfinitePay response.
  - `createCheckoutSession_returnsCheckoutUrlAndPaymentId` — asserts return shape `{ payment: { id }, checkoutUrl }`.
  - `createCheckoutSession_omitsCustomerFieldsWhenMissing` — when the user has no email or phone, those keys are absent from the request body.
  - `createCheckoutSession_throwsAndDeletesLocalRowOnNon2xxResponse` — mocks `fetch` to return 500; asserts adapter throws and DB delete was called for the inserted payment id.
  - `createCheckoutSession_throwsAndDeletesLocalRowOnNetworkError` — mocks `fetch` to reject; asserts adapter throws and DB delete was called.
  - `createCheckoutSession_rejectsResponseFailingZodSchema` — mocks `fetch` to return 200 with malformed body; asserts adapter throws and DB delete was called.

  Run `pnpm --filter @manita/api test InfinitePayPaymentGateway` and confirm all tests fail (since the placeholder body throws "not yet implemented").

### Implementation for User Story 2

- [X] T007 [US2] Implement the real `createCheckoutSession` in `apps/api/src/infrastructure/external/InfinitePayPaymentGateway.ts`, replacing the placeholder. Steps in order:
  1. Insert local `payment` row (`status: 'pending'`, `type: 'entry'`, `amount`, `platformFee`, `userId`, `poolId`); capture returned `payment.id`.
  2. Look up the user via `db.query.user.findFirst({ where: eq(user.id, params.userId) })` to extract `name` and `email`. If the `user` schema exposes a phone field (check the Drizzle schema at `apps/api/src/db/schema/user.ts` before implementing), include it; otherwise omit `customer.phone` from the request body — pre-fill is best-effort per FR-006.
  3. Build the `CreateLinkRequest` body per `contracts/infinitepay-create-link.md`: `handle = this.handle`; `redirect_url = ${origin}/pools/payment-success`; `webhook_url = ${apiUrl}/api/webhooks/infinitepay`; `order_nsu = paymentRecord.id`; `customer` populated best-effort (omit absent fields); `items[0]` with `name: 'Entrada no Bolão'`, `quantity: 1`, `price: amount` (centavos).
  4. POST via global `fetch` to `https://api.infinitepay.io/invoices/public/checkout/links` with `Content-Type: application/json` and `Accept: application/json`. Catch network errors.
  5. On non-2xx response OR network error OR Zod-schema-failure on the response body: `db.delete(payment).where(eq(payment.id, paymentRecord.id))`, log at `error` level (no body, no handle), `throw new Error('InfinitePay checkout creation failed')`.
  6. On success: validate response with the Zod schema `CreateLinkResponseSchema` (`{ url, slug, order_nsu }`); persist `externalPaymentId = ${slug}:${order_nsu}` via `db.update(payment).set({ externalPaymentId }).where(eq(payment.id, paymentRecord.id))`; log `info` (slug only); return `{ payment: { id: paymentRecord.id }, checkoutUrl: response.url }`.

  Define the Zod schema inline at the top of the file. Re-run `pnpm --filter @manita/api test InfinitePayPaymentGateway` until green.

- [ ] T008 [US2] **MANUAL** — Manually verify per `specs/014-infinitepay-gateway/quickstart.md` section 2 (sandbox handle + ngrok). Confirm: real checkout URL is returned, the InfinitePay-hosted page lists PIX, credit card, and boleto, and the database row has the expected composite `external_payment_id`. Record outcomes in the PR description. **Deferred to operator — requires InfinitePay sandbox account and ngrok.**

**Checkpoint**: Customers can be redirected to a real InfinitePay checkout, but their pool memberships will not yet activate without US3.

---

## Phase 5: User Story 3 — Platform reliably reflects InfinitePay payment status (Priority: P1)

**Goal**: Inbound webhooks from InfinitePay trigger the active-confirmation flow; confirmed-paid payments transition to `completed` and activate pool memberships exactly once; failed/rejected/expired payments transition to `expired`; forged or unknown notifications produce no state change.

**Independent Test**: Per `quickstart.md` section 4 (sandbox end-to-end smoke test) — completing a payment in InfinitePay sandbox results in `payment.status='completed'` and a `pool_member` row within ~60 seconds. Re-delivering the same webhook (manually replayed via curl) leaves both rows unchanged. A webhook with a fabricated `order_nsu` returns 200 and produces no state change.

### Tests for User Story 3 (TDD — write FIRST and confirm failing) ⚠️

- [X] T009 [P] [US3] Add failing integration tests for the InfinitePay webhook to `apps/api/src/infrastructure/http/routes/__tests__/webhooks.test.ts` (extend the existing file; group new cases under `describe('POST /api/webhooks/infinitepay', ...)`). Mock global `fetch` to control InfinitePay's `payment_check` responses. Cover:
  - `returns400ForNonJsonBody` — POST with text body → 400 `{ error: 'INVALID_BODY' }`, `fetch` not called.
  - `returns200WhenBodyHasNoExtractableIdentifier` — POST `{}` → 200 `{ received: true }`, `fetch` not called.
  - `returns200WhenIdentifierHasNoLocalPaymentMatch` — POST with `order_nsu` that does not match any local payment → 200, `fetch` not called.
  - `callsPaymentCheckWithCompositeReferenceWhenMatchExists` — seed a local payment with `externalPaymentId = 'slug-x:nsu-y'`, POST webhook with `order_nsu: 'nsu-y'` → asserts `fetch` called with body containing `handle`, `slug: 'slug-x'`, `order_nsu: 'nsu-y'`.
  - `marksPaymentCompletedAndActivatesPoolWhenPaymentCheckReturnsPaid` — mock `payment_check` returns `{ payment: { status: 'paid' } }` → asserts the local `payment.status` becomes `'completed'` and a `pool_member` row exists.
  - `marksPaymentExpiredWhenPaymentCheckReturnsRejected` — mock `payment_check` returns `{ payment: { status: 'rejected' } }` → asserts `payment.status` becomes `'expired'`, no `pool_member` row.
  - `leavesPaymentUnchangedWhenPaymentCheckReturnsPending` — mock returns `{ payment: { status: 'pending' } }` → asserts no DB write.
  - `returns500WhenPaymentCheckFailsSoInfinitePayRetries` — mock `fetch` to reject or return 500 → route returns HTTP 500, no state change.
  - `isIdempotentForDuplicateWebhookOnAlreadyCompletedPayment` — seed `payment.status = 'completed'`, POST webhook → 200, no duplicate `pool_member` insert.
  - `treatsUnknownStatusAsTransientNoop` — mock returns `{ payment: { status: 'martian' } }` → 200, no state change.

  Run `pnpm --filter @manita/api test webhooks` and confirm new cases fail.

### Implementation for User Story 3

- [X] T010 [US3] Add the InfinitePay webhook handler to `apps/api/src/infrastructure/http/routes/webhooks.ts`. Register `webhooksRoutes.post('/webhooks/infinitepay', handler)`. The handler:
  1. Parse body as JSON; on parse failure return `c.json({ error: 'INVALID_BODY' }, 400)`.
  2. Extract identifier defensively from any of: `body.order_nsu`, `body.payment?.order_nsu`, `body.data?.order_nsu`. If none found, log `info` and return `c.json({ received: true })`.
  3. Validate the extracted `order_nsu` is a UUID (regex match against `payment.id`'s shape). If not a UUID, log `warn` and return `c.json({ received: true })` — fabricated identifiers cannot match a local row. Then look up the local payment by exact match on the primary key: `db.query.payment.findFirst({ where: eq(payment.id, orderNsu) })` (since `order_nsu` is set to the local `payment.id` at create-link time per `contracts/infinitepay-create-link.md`). If no row is found, log `warn` and return `c.json({ received: true })`. Confirm the row's `externalPaymentId` is set and well-formed (`<slug>:<order_nsu>` with `order_nsu` matching the row id); if malformed or null, log `warn` and return `c.json({ received: true })` (the row is mid-creation; InfinitePay will retry).
  4. Split `payment.externalPaymentId` on `':'` to extract `slug` and `order_nsu`. If split fails, log `warn` and return `c.json({ received: true })`.
  5. If `infinitePayConfig` is null (mock mode), log `warn` and return `c.json({ received: true })` — webhooks should not arrive in mock mode but should be silently ignored if they do.
  6. POST `{ handle: infinitePayConfig.handle, slug, order_nsu, transaction_nsu? }` to `https://api.infinitepay.io/invoices/public/checkout/payment_check`. On network error or non-2xx, log `error`, return `c.json({ error: 'STATUS_LOOKUP_FAILED' }, 500)` so InfinitePay retries.
  7. Validate response with `PaymentCheckResponseSchema`. If validation fails, log `warn` and return 200.
  8. Map status per `data-model.md`:
     - `paid`/`approved` → `await handleCheckoutCompleted(localPayment.id)` (idempotent; reuses `apps/api/src/services/payment.ts`).
     - `rejected`/`failed`/`cancelled`/`expired` → `db.update(payment).set({ status: 'expired', updatedAt: new Date() }).where(eq(payment.id, localPayment.id))` only if current status is `'pending'`.
     - `pending`/`processing` → no-op.
     - other → log `warn`, no-op.
  9. Return `c.json({ received: true })`.

  Define `PaymentCheckResponseSchema` near the top of the file (or co-locate with the InfinitePay handler). Re-run `pnpm --filter @manita/api test webhooks` until green.

- [ ] T011 [US3] **MANUAL** — Manually verify per `specs/014-infinitepay-gateway/quickstart.md` section 4 (sandbox end-to-end smoke test): complete a real sandbox payment, observe `payment.status='completed'` and a new `pool_member` row within ~60 seconds. Then replay the same webhook via `curl` to confirm idempotency. Then send a webhook with a fabricated `order_nsu` to confirm 200 + no state change. Record outcomes in the PR description. **Deferred to operator — requires InfinitePay sandbox account and real payment.**

**Checkpoint**: All three user stories functional. Feature is end-to-end testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Ensure consistency, lint cleanliness, and test-suite health before merge.

- [X] T012 Audit logging in `apps/api/src/infrastructure/external/InfinitePayPaymentGateway.ts` and the InfinitePay handler in `apps/api/src/infrastructure/http/routes/webhooks.ts` against `research.md` R-009: confirm no log emits the full request/response body, the `INFINITEPAY_HANDLE` value, or any `Authorization` header. Adjust if a violation is found. **PASS** — every `console.*` call logs only UUIDs, status codes, slugs, or error messages; no handle, no body, no Authorization headers.

- [X] T013 [P] Run `pnpm biome check --write apps/api/src` and resolve any new lint issues introduced by this feature. **PASS** — auto-fixes applied; remaining 5 warnings are pre-existing in `reminderJob.ts`, not in new code.

- [X] T014 [P] Run the full API test suite `pnpm --filter @manita/api test` (executed via `pnpm test` in `apps/api`) and confirm zero regressions. **PASS** — 260/260 tests across 34 files.

- [X] T015 Update `apps/api/.env.example` to also confirm `PAYMENT_GATEWAY` documents `infinitepay` as a valid value alongside `stripe` and `mercadopago`. **Folded into T001** — the updated comment now reads `# Payment gateway selection: stripe | mercadopago | infinitepay (default: mercadopago)`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. Can start immediately.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational. T003 must precede T004; T004 must precede T005.
- **User Story 2 (Phase 4)**: Depends on US1's T003 (skeleton class) being in place so T007 has a file to fill. T006 (tests) must precede T007 (impl) per TDD. T007 must precede T008 (manual verification).
- **User Story 3 (Phase 5)**: Depends on Foundational (T002) for `infinitePayConfig` import. T009 (tests) must precede T010 (impl). For real end-to-end testing in T011, US2 must also be live (otherwise no real payments exist to confirm).
- **Polish (Phase 6)**: Depends on all three user stories being implemented.

### User Story Dependencies

- **US1** can be developed alone and produces a runnable (but non-paying) deployment.
- **US2** can begin in parallel with **US3** once US1's T003 + T004 land. They touch different files (`InfinitePayPaymentGateway.ts` vs `webhooks.ts`).
- **US3**'s end-to-end smoke test (T011) requires US2 to be functional; the integration tests in T009 do not.

### Within Each User Story

- Tests (T006, T009) MUST be written and confirmed FAILING before their implementation tasks (T007, T010) start.
- Manual verification tasks (T005, T008, T011) MUST be the last step in each story.

### Parallel Opportunities

- T001 and T002 both touch independent files (`.env.example` vs `lib/infinitepay.ts`); they can run in parallel even though both fall outside user stories.
- T006 and T009 can be drafted in parallel (different test files).
- After US1 ships, T007 (US2 impl) and T010 (US3 impl) can be developed in parallel.
- T013 and T014 (polish lint + test) can run in parallel.

---

## Parallel Example: User Story 2 + User Story 3 after US1 lands

```bash
# Developer A (US2) — TDD then implementation:
Task: "Write failing unit tests for InfinitePayPaymentGateway"   # T006
Task: "Implement createCheckoutSession to make tests pass"        # T007

# Developer B (US3) — TDD then implementation, in parallel:
Task: "Write failing integration tests for InfinitePay webhook"   # T009
Task: "Implement POST /api/webhooks/infinitepay to make tests pass"  # T010
```

Both developers can commit independently — they touch disjoint files (`InfinitePayPaymentGateway.ts`, `webhooks.ts`, and their respective `__tests__/` files).

---

## Implementation Strategy

### MVP (single-developer path)

1. T001 → T002 (Setup + Foundational)
2. T003 → T004 → T005 (US1: API starts under InfinitePay selection)
3. T006 → T007 → T008 (US2: customer can reach InfinitePay checkout)
4. T009 → T010 → T011 (US3: webhook reconciliation works end-to-end)
5. T012 → T013 → T014 → T015 (Polish)

The earliest demoable state is after T008 (a customer can pay, even though pool membership won't activate until T010). The earliest production-deployable state is after T011.

### Two-developer parallel path

1. Both: T001, T002, T003, T004, T005 together (Phase 1–3).
2. Split:
   - Developer A: T006 → T007 → T008 (US2).
   - Developer B: T009 → T010 → T011 (US3).
3. Reconvene for T012–T015.

---

## Notes

- All file paths in this document are relative to the repository root `/Users/igortullio/Developer/igortullio/m5nita`.
- No database migrations are required (data-model.md confirms reuse of the existing `payment` table).
- No `apps/web` or `packages/shared` changes are required.
- The `MockPaymentGateway` and `handleCheckoutCompleted` use case are reused as-is — do not modify them as part of this feature.
- Composite `externalPaymentId` (`'<slug>:<order_nsu>'`) is the only semantic change to existing schema usage; tests must verify both halves are persisted and parsed correctly.
- Any deviation from this plan (e.g., requiring new domain types) MUST be justified by updating `plan.md`'s Complexity Tracking section before implementation.
