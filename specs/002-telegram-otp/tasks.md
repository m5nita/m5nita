# Tasks: Replace Twilio with Telegram Bot for OTP Delivery

**Input**: Design documents from `/specs/002-telegram-otp/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in the feature specification — test tasks omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: Swap dependencies, add environment configuration, create database schema

- [x] T001 Remove `twilio` and add `grammy` dependency in `apps/api/package.json`
- [x] T002 [P] Update environment variables in `apps/api/.env.example` — remove `TWILIO_*`, add `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME`
- [x] T003 [P] Create `telegram_chat` table schema in `apps/api/src/db/schema/telegram.ts` with Drizzle ORM (phoneNumber PK, chatId `bigint({ mode: 'bigint' })` to avoid precision loss with large Telegram IDs, timestamps)
- [x] T004 Export `telegram_chat` schema from `apps/api/src/db/schema/index.ts` (or wherever schema barrel file is)
- [x] T005 Generate and apply database migration via `pnpm drizzle-kit generate`

**Checkpoint**: Dependencies installed, env vars configured, `telegram_chat` table exists in schema

---

## Phase 2: Foundational — Telegram Bot Instance

**Purpose**: Create the grammY bot instance that both the webhook route and OTP sender depend on

**CRITICAL**: Both US1 (bot handlers) and US2 (OTP sending) depend on the bot instance

- [x] T006 Create grammY bot instance in `apps/api/src/lib/telegram.ts` — export `bot` initialized with `TELEGRAM_BOT_TOKEN`, export a `sendOtpViaTelegram(chatId, code)` helper function that calls `bot.api.sendMessage` wrapped in try/catch (on failure, throw a user-friendly error "Falha ao enviar código. Tente novamente." to satisfy R9)

**Checkpoint**: Bot instance ready — user story implementation can begin

---

## Phase 3: User Story 1 — Bot Registration (Priority: P1) MVP

**Goal**: Users can `/start` the Telegram bot, share their phone number, and have the phone→chatId mapping stored in the database

**Independent Test**: Send `/start` to the bot, share phone contact, verify row is created in `telegram_chat` table

### Implementation for User Story 1

- [x] T007 [US1] Add `/start` command handler in `apps/api/src/lib/telegram.ts` — reply with welcome message and `request_contact` keyboard button
- [x] T008 [US1] Add `message:contact` handler in `apps/api/src/lib/telegram.ts` — normalize phone to `+` prefix, upsert into `telegram_chat` table, reply with confirmation and `remove_keyboard`
- [x] T009 [US1] Create webhook route in `apps/api/src/routes/telegram.ts` — use grammY's `webhookCallback(bot, "hono", { secretToken: process.env.TELEGRAM_WEBHOOK_SECRET })` and mount at `POST /api/telegram/webhook`. Verify the `secretToken` option is passed to satisfy R8 (webhook security)
- [x] T010 [US1] Register the telegram webhook route in `apps/api/src/index.ts` — import `telegramRoutes` and add `app.route('/api', telegramRoutes)` alongside the existing webhook routes (no auth middleware, similar to `webhooksRoutes`)

**Checkpoint**: Bot fully functional — users can register their phone via Telegram

---

## Phase 4: User Story 2 — OTP Delivery via Telegram (Priority: P1) MVP

**Goal**: Replace Twilio `sendOTP` with Telegram Bot API so OTP codes are delivered as Telegram messages

**Independent Test**: Request OTP for a phone registered in `telegram_chat` — verify message arrives in Telegram. Request OTP for unregistered phone — verify `TELEGRAM_NOT_CONNECTED` error is returned.

### Implementation for User Story 2

- [x] T011 [US2] Modify `sendOTP` callback in `apps/api/src/lib/auth.ts` — remove Twilio import and client, replace with: look up `chatId` from `telegram_chat` table by phone, call `sendOtpViaTelegram(chatId, code)`. Throw error with `TELEGRAM_NOT_CONNECTED` code if phone not found. Telegram API errors are already handled by `sendOtpViaTelegram` (T006). Keep dev-mode console logging.
- [x] T012 [US2] Remove `twilio` import from `apps/api/src/lib/auth.ts` and verify no other files import it

**Checkpoint**: OTP delivery works end-to-end via Telegram for registered phones

---

## Phase 5: User Story 3 — Login UX for Telegram Connection (Priority: P2)

**Goal**: Login page shows clear instructions for users who haven't connected their phone to the Telegram bot

**Independent Test**: Attempt to send OTP for an unregistered phone — verify the login page shows Telegram connection instructions with a link to the bot

### Implementation for User Story 3

- [x] T013 [US3] Add `TELEGRAM_BOT_USERNAME` to frontend environment (e.g., `VITE_TELEGRAM_BOT_USERNAME` in `apps/web/.env.example`)
- [x] T014 [US3] Update login page in `apps/web/src/routes/login.tsx` — (1) change button text from "Enviar código via WhatsApp" to "Enviar código", (2) update OTP step copy from "Enviamos um código para" to "Enviamos um código pelo Telegram para", (3) handle `TELEGRAM_NOT_CONNECTED` error from `sendOtp` call showing instructional UI with a deep link to `https://t.me/{bot_username}?start=login` and steps to share phone number

**Checkpoint**: Users see actionable guidance when their phone isn't connected to the bot

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, verify nothing is broken

- [x] T015 [P] Remove any remaining Twilio references across the entire codebase (search for `twilio`, `TWILIO`, `whatsapp`)
- [x] T016 [P] Update test fixtures that reference Twilio mocks in `apps/api/src/routes/__tests__/` — replace with Telegram bot mocks if needed
- [x] T017 Run `pnpm biome check --apply .` to fix lint/formatting
- [x] T018 Run `pnpm test` and fix any broken tests
- [x] T019 Run `pnpm build` to verify production build succeeds

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on T001 (grammy installed) and T003 (schema exists)
- **US1 (Phase 3)**: Depends on Phase 2 (bot instance)
- **US2 (Phase 4)**: Depends on Phase 2 (bot instance) and T003 (schema for lookup). Can run in parallel with US1 if bot instance is ready.
- **US3 (Phase 5)**: Depends on US2 (needs to know the error code to handle)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (Bot Registration)**: Depends on foundational bot instance only — independently testable
- **US2 (OTP Delivery)**: Depends on foundational bot instance and schema — independently testable with a pre-seeded `telegram_chat` row
- **US3 (Login UX)**: Depends on US2 error code contract — independently testable by simulating the error

### Within Each User Story

- Models/schema before services
- Services before routes
- Core implementation before integration

### Parallel Opportunities

- T002, T003 can run in parallel (different files)
- US1 and US2 can run in parallel after Phase 2 (different files, no shared state)
- T015, T016 can run in parallel (different concerns)

---

## Parallel Example: Setup Phase

```bash
# Launch in parallel (different files):
Task: "Update .env.example" (T002)
Task: "Create telegram_chat schema" (T003)
```

## Parallel Example: US1 + US2

```bash
# After Phase 2, launch in parallel:
Task: "Add /start handler" (T007) + "Add contact handler" (T008) — US1
Task: "Modify sendOTP in auth.ts" (T011) — US2
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Complete Phase 1: Setup (T001–T005)
2. Complete Phase 2: Bot instance (T006)
3. Complete Phase 3: US1 — Bot Registration (T007–T010)
4. Complete Phase 4: US2 — OTP Delivery (T011–T012)
5. **STOP and VALIDATE**: Test full flow — register phone via bot, login via web app, receive OTP in Telegram
6. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. US1 (Bot Registration) → Users can register phones → Validate
3. US2 (OTP Delivery) → Full login works via Telegram → Validate (MVP!)
4. US3 (Login UX) → Polished error handling → Validate
5. Polish → Clean codebase, all tests pass → Ship

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Keep dev-mode console OTP logging for local development
- Phone numbers must always be normalized to `+55...` format
- The `telegram_chat` table is independent of the `user` table by design
- Commit after each task or logical group
