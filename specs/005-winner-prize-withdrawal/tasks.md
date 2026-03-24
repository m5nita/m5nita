# Tasks: Retirada de Premio pelo Vencedor

**Input**: Design documents from `/specs/005-winner-prize-withdrawal/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Shared types, constants, and schemas needed by multiple user stories

- [x] T001 [P] Add PIX key types and withdrawal status constants in packages/shared/src/constants/index.ts
- [x] T002 [P] Add PrizeWithdrawal, PrizeInfo, and WithdrawalRequest types in packages/shared/src/types/index.ts
- [x] T003 [P] Add PIX key validation schema (pixKeySchema with cpf/email/phone/random validation) and withdrawPrizeSchema in packages/shared/src/schemas/index.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema and relations that MUST be complete before ANY user story can be implemented

- [x] T004 Create prize_withdrawal table schema in apps/api/src/db/schema/prizeWithdrawal.ts (id, poolId, userId, paymentId, amount, pixKeyType, pixKey, status, createdAt, updatedAt with unique constraint on poolId+userId)
- [x] T005 Export prizeWithdrawal schema from apps/api/src/db/schema/index.ts and add relations in apps/api/src/db/schema/relations.ts (pool, user, payment relations)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 2 - Administrador finaliza o bolao (Priority: P2)

**Goal**: Owner can finalize a pool when all matches are finished, changing status to "closed"

**Independent Test**: Create a pool with all matches finished, owner clicks "Finalizar", status changes to "closed"

> **Note**: US2 is implemented before US1 because pool finalization is a prerequisite for prize withdrawal

### Implementation for User Story 2

- [x] T006 [US2] Add closePool service function in apps/api/src/services/pool.ts - verify pool is active, verify user is owner, check all matches have status "finished" (query match table for any non-finished), update pool status to "closed", block prediction upserts on closed pools (add status check in prediction service or route guard), return updated pool
- [x] T007 [US2] Add POST /api/pools/:poolId/close route in apps/api/src/routes/pools.ts - call closePool service, handle PoolError for MATCHES_NOT_FINISHED, POOL_NOT_ACTIVE, NOT_POOL_OWNER errors per contracts/api.md
- [x] T008 [US2] Add "Finalizar Bolao" button in apps/web/src/routes/pools/$poolId/manage.tsx - show only when pool status is "active", use useMutation to call POST /api/pools/:poolId/close, pass isPending to Button loading prop for loading state, show confirmation dialog before finalizing, invalidate pool query on success, show error toast on failure

**Checkpoint**: Pool finalization is fully functional and testable independently

---

## Phase 4: User Story 1 - Vencedor solicita retirada do premio (Priority: P1) MVP

**Goal**: Winner can view prize info and request withdrawal via PIX key on a finalized pool

**Independent Test**: Finalize a pool, log in as the winner, see prize amount, enter PIX key, submit withdrawal request, verify payment record created

### Implementation for User Story 1

- [x] T009 [US1] Create prize withdrawal service in apps/api/src/services/prizeWithdrawal.ts with functions: getPrizeInfo(poolId, userId) - get ranking, determine winners (rank 1 with ties), calculate winnerShare (prizeTotal / winnerCount), check if current user is winner, fetch existing withdrawal if any; requestWithdrawal(poolId, userId, pixKeyType, pixKey) - validate pool is closed, validate user is winner, validate no existing withdrawal, validate PIX key format, calculate winner share, create payment record (type "prize", status "pending"), create prizeWithdrawal record, return withdrawal
- [x] T010 [US1] Add GET /api/pools/:poolId/prize route in apps/api/src/routes/pools.ts - call getPrizeInfo, return prizeTotal, winnerCount, winnerShare, isWinner, withdrawal (mask pixKey showing only last 4 chars for privacy), winners per contracts/api.md
- [x] T011 [US1] Add POST /api/pools/:poolId/prize/withdraw route in apps/api/src/routes/pools.ts - parse and validate body with withdrawPrizeSchema, call requestWithdrawal service, handle errors (POOL_NOT_CLOSED, NOT_A_WINNER, WITHDRAWAL_ALREADY_REQUESTED, INVALID_PIX_KEY) per contracts/api.md
- [x] T012 [US1] Update cancel route in apps/api/src/routes/pools.ts - broaden existing prize payment check to block cancellation when ANY prize payment exists (any status, not just "completed"), return PRIZE_WITHDRAWAL_REQUESTED error
- [x] T013 [P] [US1] Create PixKeyInput component in apps/web/src/components/PixKeyInput.tsx - dropdown to select pixKeyType (CPF, E-mail, Telefone, Chave aleatoria), text input with appropriate mask/placeholder per type, client-side format validation using shared schema
- [x] T014 [P] [US1] Create PrizeWithdrawal component in apps/web/src/components/PrizeWithdrawal.tsx - fetch GET /api/pools/:poolId/prize with useQuery, show prize total and winner share (formatCurrency), if isWinner and no withdrawal: show PixKeyInput + submit button with useMutation (pass isPending to Button loading prop for loading state) to POST /api/pools/:poolId/prize/withdraw, if withdrawal exists: show withdrawal status and masked PIX key info, if not winner: show winners list and congratulations message
- [x] T015 [US1] Integrate PrizeWithdrawal component into apps/web/src/routes/pools/$poolId/index.tsx - show PrizeWithdrawal section when pool status is "closed", position after pool stats grid

**Checkpoint**: Prize withdrawal flow is fully functional - winner can view prize, submit PIX key, and request withdrawal

---

## Phase 5: User Story 3 - Vencedor e notificado sobre o premio (Priority: P3)

**Goal**: When a pool is finalized, winners receive a Telegram notification with prize info

**Independent Test**: Finalize a pool where the winner has Telegram linked, verify notification is sent

### Implementation for User Story 3

- [x] T016 [US3] Add notifyWinners function in apps/api/src/lib/telegram.ts - receive poolId, pool name, winners list (with phone numbers), prize share amount; for each winner: call findChatIdByPhone, if chatId found: send congratulatory message with pool name, prize amount (formatted in BRL), and instruction to access the app; use existing bot.api.sendMessage with Markdown parse_mode
- [x] T017 [US3] Call notifyWinners from closePool service in apps/api/src/services/pool.ts - after updating pool status to "closed", get ranking to determine winners (rank 1), get prize total and calculate share, call notifyWinners with winner data (fire-and-forget, don't block finalization on notification failure)

**Checkpoint**: All user stories are independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation, edge cases, and final cleanup

- [x] T018 [P] Run pnpm biome check --write . to fix any linting/formatting issues
- [x] T019 [P] Generate database migration with pnpm drizzle-kit generate for the new prize_withdrawal table
- [x] T020 Verify edge case: pool with 1 member finalizes and single member can withdraw full prize
- [x] T021 Verify edge case: tied winners each see their correct share amount

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001-T003) completion - BLOCKS all user stories
- **US2 (Phase 3)**: Depends on Phase 2 - Must complete before US1 (pool must be closable before prize can be withdrawn)
- **US1 (Phase 4)**: Depends on Phase 2 AND Phase 3 (needs closed pool status)
- **US3 (Phase 5)**: Depends on Phase 3 (hooks into closePool service)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 2 (P2)**: Can start after Phase 2 - No dependencies on other stories. **Implemented first** because US1 requires a closed pool.
- **User Story 1 (P1)**: Depends on US2 (needs pool finalization to exist). Core MVP feature.
- **User Story 3 (P3)**: Depends on US2 (hooks into finalization flow). Can be developed in parallel with US1.

### Within Each User Story

- Services before routes
- Routes before frontend components
- Core implementation before integration

### Parallel Opportunities

- Phase 1: All 3 setup tasks (T001, T002, T003) can run in parallel
- Phase 4 (US1): T013 (PixKeyInput) and T014 (PrizeWithdrawal) can be developed in parallel
- Phase 5 (US3) can be developed in parallel with Phase 4 (US1) after Phase 3 completes
- Phase 6: Linting (T018) and migration (T019) can run in parallel

---

## Parallel Example: Phase 1 Setup

```bash
# Launch all setup tasks together:
Task: "Add PIX key types and withdrawal status constants in packages/shared/src/constants/index.ts"
Task: "Add PrizeWithdrawal, PrizeInfo types in packages/shared/src/types/index.ts"
Task: "Add PIX key validation schema in packages/shared/src/schemas/index.ts"
```

## Parallel Example: US1 Frontend Components

```bash
# Launch frontend components together (after backend routes are done):
Task: "Create PixKeyInput component in apps/web/src/components/PixKeyInput.tsx"
Task: "Create PrizeWithdrawal component in apps/web/src/components/PrizeWithdrawal.tsx"
```

---

## Implementation Strategy

### MVP First (US2 + US1)

1. Complete Phase 1: Setup (shared types, constants, schemas)
2. Complete Phase 2: Foundational (DB schema)
3. Complete Phase 3: US2 - Pool finalization
4. Complete Phase 4: US1 - Prize withdrawal
5. **STOP and VALIDATE**: Test full flow end-to-end
6. Deploy if ready

### Incremental Delivery

1. Setup + Foundational -> Foundation ready
2. Add US2 (pool finalization) -> Test independently -> Deploy
3. Add US1 (prize withdrawal) -> Test independently -> Deploy (MVP!)
4. Add US3 (Telegram notifications) -> Test independently -> Deploy
5. Polish -> Final validation -> Deploy

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US2 is implemented before US1 despite lower priority because US1 depends on pool finalization
- All monetary values in centavos (integer math, no floating point)
- PIX key validation is format-only (actual key validity checked during manual payout)
- Telegram notification is fire-and-forget (don't block finalization)
- Commit after each task or logical group
