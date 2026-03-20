# Tasks: Cupons de Desconto para Taxas de Bolão

**Input**: Design documents from `/specs/003-discount-coupons/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required by Constitution II — unit and integration test tasks included per user story.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add shared constants, schemas, and types needed across the feature

- [x] T001 [P] Add COUPON constants (MIN/MAX code length, MAX_DISCOUNT, CODE_REGEX for alphanumeric validation) to `packages/shared/src/constants/index.ts`
- [x] T002 [P] Add couponCode optional field to createPoolSchema and add validateCouponSchema in `packages/shared/src/schemas/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema, migration, and core service that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Create coupon table schema (id, code, discount_percent, status, max_uses, use_count, expires_at, created_by_telegram_id, timestamps) in `apps/api/src/db/schema/coupon.ts`
- [x] T004 Add couponId nullable FK column to pool table in `apps/api/src/db/schema/pool.ts`
- [x] T005 Export coupon schema from `apps/api/src/db/schema/index.ts`
- [x] T006 Add couponRelations and update poolRelations with coupon reference in `apps/api/src/db/schema/relations.ts`
- [x] T007 Generate and apply database migration with `pnpm drizzle-kit generate && pnpm drizzle-kit migrate`
- [x] T008 Create coupon service with functions: createCoupon (with alphanumeric code validation and trim+uppercase normalization), validateCoupon (with normalization), incrementUsage, deactivateCoupon, listCoupons, getEffectiveFeeRate in `apps/api/src/services/coupon.ts`
- [x] T009 Add isAdmin utility function that checks ctx.from.id against ADMIN_USER_IDS env var in `apps/api/src/lib/telegram.ts`

### Tests for Foundational

- [x] T010 [P] Unit tests for coupon service: createCoupon (valid, duplicate code, invalid chars, normalization), validateCoupon (active, expired, exhausted, inactive, normalized input), incrementUsage (atomic, respects max_uses), getEffectiveFeeRate (0%, 50%, 100% discount) in `apps/api/src/services/__tests__/coupon.test.ts`
- [x] T011 [P] Unit tests for isAdmin utility: admin user allowed, non-admin rejected, empty env var in `apps/api/src/lib/__tests__/telegram.test.ts`

**Checkpoint**: Foundation ready — coupon table exists, service is available and tested, admin check works

---

## Phase 3: User Story 1 — Administrador cria cupom via Telegram (Priority: P1) 🎯 MVP

**Goal**: Admin can create coupons via Telegram bot commands with code, discount %, optional expiry and usage limit

**Independent Test**: Send `/cupom_criar TESTE 100` via Telegram as an admin user and verify bot confirms creation

### Implementation for User Story 1

- [x] T012 [US1] Implement `/cupom_criar` command handler with argument parsing (code, discount%, duration, maxUses) and input normalization (trim+uppercase code) in `apps/api/src/lib/telegram.ts`
- [x] T013 [US1] Add admin authorization guard to `/cupom_criar` command (reject non-admin users with error message) in `apps/api/src/lib/telegram.ts`
- [x] T014 [US1] Add success/error response formatting for coupon creation (emoji feedback, attribute summary) in `apps/api/src/lib/telegram.ts`

**Checkpoint**: Admins can create coupons via Telegram. Non-admins are rejected.

---

## Phase 4: User Story 2 — Criador de bolão aplica cupom ao criar bolão (Priority: P1) 🎯 MVP

**Goal**: Users can enter a coupon code when creating a pool, and the platform fee is recalculated with the discount

**Independent Test**: Create a pool with coupon code "TESTE" and verify the platform fee reflects the discount

### Implementation for User Story 2

- [x] T015 [US2] Modify createPool function to accept optional couponCode, validate coupon (via coupon service with normalization), link couponId to pool, and increment usage in `apps/api/src/services/pool.ts`
- [x] T016 [US2] Add POST /api/pools/validate-coupon endpoint for real-time coupon validation (normalizes input before validation) in `apps/api/src/routes/pools.ts`
- [x] T017 [US2] Modify POST /api/pools route to pass couponCode to createPool and return originalPlatformFee + discountPercent in response in `apps/api/src/routes/pools.ts`
- [x] T018 [US2] Add calculateDiscountedFee(amount, discountPercent) utility function in `apps/web/src/lib/utils.ts`
- [x] T019 [US2] Add coupon code input field to create pool form with real-time validation (call validate-coupon endpoint on blur) in `apps/web/src/routes/pools/create.tsx`
- [x] T020 [US2] Show original fee vs discounted fee comparison when valid coupon is applied in `apps/web/src/routes/pools/create.tsx`

### Tests for User Story 2

- [x] T021 [P] [US2] Integration test for create pool with valid coupon (fee reduced), invalid coupon (rejected), expired coupon (rejected), exhausted coupon (rejected) in `apps/api/src/routes/__tests__/pools-coupon.test.ts`
- [x] T022 [P] [US2] Unit test for calculateDiscountedFee (0%, 50%, 100%, rounding with Math.floor) in `apps/web/src/lib/__tests__/utils.test.ts`

**Checkpoint**: Users can create pools with coupon codes. Fee is recalculated. Invalid coupons are rejected with clear messages.

---

## Phase 5: User Story 3 — Taxa com desconto se aplica a todos os membros (Priority: P2)

**Goal**: When a pool has a coupon, all joining members pay the discounted fee, not just the creator

**Independent Test**: Invite a second user to a pool with 100% discount and verify their fee is R$ 0,00

### Implementation for User Story 3

- [x] T023 [US3] Modify createEntryPayment to look up pool's coupon and calculate fee with discount in `apps/api/src/services/payment.ts`
- [x] T024 [US3] Modify getPoolByInviteCode to return originalPlatformFee and discountPercent from linked coupon in `apps/api/src/services/pool.ts`
- [x] T025 [US3] Modify POST /api/pools/:poolId/join route (no changes to fee passing — createEntryPayment now derives discount internally from pool's coupon) in `apps/api/src/routes/pools.ts`
- [x] T026 [US3] Update invite page to show original vs discounted fee when pool has coupon in `apps/web/src/routes/invite/$inviteCode.tsx`

### Tests for User Story 3

- [x] T027 [P] [US3] Integration test for join pool with coupon: member pays discounted fee, member pays full fee when no coupon, deactivated coupon still applies to existing pool in `apps/api/src/routes/__tests__/pools-join-coupon.test.ts`

**Checkpoint**: All pool members benefit from the coupon discount. Invite page shows correct discounted fee.

---

## Phase 6: User Story 4 — Administrador gerencia cupons via Telegram (Priority: P3)

**Goal**: Admin can list all coupons and deactivate active ones via Telegram

**Independent Test**: Send `/cupom_listar` to see all coupons, then `/cupom_desativar TESTE` to deactivate one

### Implementation for User Story 4

- [x] T028 [P] [US4] Implement `/cupom_listar` command handler with formatted output (code, discount, status, usage, expiry) in `apps/api/src/lib/telegram.ts`
- [x] T029 [P] [US4] Implement `/cupom_desativar` command handler with admin guard and status validation in `apps/api/src/lib/telegram.ts`

**Checkpoint**: Admins have full CRUD lifecycle for coupons via Telegram.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Cross-cutting improvements and final validation

- [x] T030 [P] Update getPoolById to include coupon discount info for pool detail page in `apps/api/src/services/pool.ts`
- [x] T031 [P] Update calculatePrize in `apps/web/src/lib/utils.ts` to accept optional discountPercent for accurate prize display
- [x] T032 Run quickstart.md validation (manual end-to-end test of Telegram + frontend flows)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational (T008, T009)
- **US2 (Phase 4)**: Depends on Foundational (T008) — can run in parallel with US1
- **US3 (Phase 5)**: Depends on US2 (T015 specifically — pool must support couponId)
- **US4 (Phase 6)**: Depends on Foundational (T008, T009) — can run in parallel with US1/US2
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Independent after Foundational — Telegram coupon creation
- **US2 (P1)**: Independent after Foundational — Pool creation with coupon
- **US3 (P2)**: Depends on US2 — Requires pool.couponId to exist and be populated
- **US4 (P3)**: Independent after Foundational — Telegram list/deactivate

### Within Each User Story

- Models/schema before services
- Services before routes/endpoints
- Backend before frontend
- Tests can run in parallel with each other within a story

### Parallel Opportunities

- T001 and T002 can run in parallel (different files in packages/shared)
- T003, T004, T005, T006 are sequential (schema dependencies)
- T010 and T011 can run in parallel (different test files)
- US1 and US2 can run in parallel after Foundational
- US4 can run in parallel with US1/US2/US3
- T028 and T029 can run in parallel (different commands, same file but independent handlers)
- T030, T031 can run in parallel (different files)

---

## Parallel Example: User Story 2

```text
# After Foundational phase, launch backend tasks:
Task: T015 — Modify createPool service (pool.ts)
Task: T016 — Add validate-coupon endpoint (pools.ts) — can start after T015

# After backend ready, launch frontend + test tasks in parallel:
Task: T018 — Add calculateDiscountedFee utility (utils.ts)
Task: T021 — Integration tests for pool+coupon (pools-coupon.test.ts)
Task: T022 — Unit tests for calculateDiscountedFee (utils.test.ts)

# After utility ready:
Task: T019 — Add coupon input to create form (create.tsx) — depends on T018
Task: T020 — Show fee comparison (create.tsx) — depends on T019
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: Foundational (T003-T011)
3. Complete Phase 3: US1 — Admin creates coupons (T012-T014)
4. Complete Phase 4: US2 — Apply coupon to pool (T015-T022)
5. **STOP and VALIDATE**: Create coupon via Telegram, then create pool with coupon via frontend
6. Deploy if ready — MVP is functional

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 + US2 → MVP (create + apply coupons)
3. US3 → All members get discount (incremental)
4. US4 → Admin management (incremental)
5. Polish → Cross-cutting and cleanup

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently testable after completion
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
- All monetary values in centavos (BRL)
- Coupon discount is percentage of platform fee (not entry fee)
- Code normalization (trim + uppercase) happens at service level (T008), not deferred to polish
- createEntryPayment derives discount from pool's coupon internally — routes don't pass fee
