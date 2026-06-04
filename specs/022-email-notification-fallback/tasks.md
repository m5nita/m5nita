---
description: "Task list for Email fallback for Telegram notifications"
---

# Tasks: Email fallback for Telegram notifications

**Input**: Design documents from `/specs/022-email-notification-fallback/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED — the project constitution (Principle II) mandates unit tests for new
adapters and updated jobs; acceptance scenarios in spec.md map directly to test cases.

**Organization**: Phase 2 (Foundational) holds the shared plumbing that both user stories
need (port reshape, Telegram transport, email helpers, composite + wiring). Phases 3–4 add
each user-facing channel path and its tests.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 = prediction reminders (P1); US2 = winner notifications (P2)

## Path Conventions

Backend-only feature under `apps/api/src/` (hexagonal layout).

---

## Phase 1: Setup

- [ ] T001 Capture baseline: run `pnpm test` and `pnpm biome check apps/api/src` and note the current passing notification/job suites (no source changes).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared plumbing required by BOTH user stories. No story path works until this is done.

**⚠️ CRITICAL**: Complete before Phase 3 / Phase 4.

- [ ] T002 Reshape `ReminderData` to channel-agnostic (`{ userName, phoneNumber, email, poolName, poolId, matches }`, drop `chatId`) and add `email: string | null` to `WinnerInfo` in `apps/api/src/application/ports/NotificationService.port.ts`
- [ ] T003 Refactor `apps/api/src/infrastructure/external/TelegramNotificationService.ts` into a Telegram transport: add per-recipient `sendReminderMessage(chatId, { poolName, poolId, matches })` and `sendWinnerMessage(chatId, { poolName, winnerName, prizeShare })`; keep `notifyAdminWithdrawalRequest`; remove `findChatIdByPhone` usage and the full-port `implements` (markdown formatting preserved) — depends on T002
- [ ] T004 [P] Update `apps/api/src/infrastructure/external/TelegramNotificationService.test.ts` to the new transport primitives (winner + reminder message formatting; APP_URL on/off) — depends on T003
- [ ] T005 [P] Add `sendPredictionReminderEmail({ to, userName, poolName, poolId, matches })` and `sendWinnerEmail({ to, winnerName, poolName, prizeShare })` to `apps/api/src/lib/resend.ts` — branded HTML consistent with `sendMagicLinkEmail`, official sender, CTA buttons (predictions link / withdrawal link), APP_URL-empty text fallback
- [ ] T006 Create `apps/api/src/infrastructure/external/CompositeNotificationService.ts` — `implements NotificationService`; composes `TelegramNotificationService`; per-recipient routing (resolve chat from phone → Telegram; else verified `email` → email; else skip) for `sendPredictionReminders` and `notifyWinners`; delegate `notifyAdminWithdrawalRequest` to Telegram; per-item try/catch so one failure never aborts the batch — depends on T002, T003, T005
- [ ] T007 Wire `CompositeNotificationService` in `apps/api/src/container.ts` (replace `new TelegramNotificationService(bot)` as the `notificationService`) — depends on T006

**Checkpoint**: Project compiles; composite routes both notification types; Telegram behavior preserved for linked users.

---

## Phase 3: User Story 1 — Prediction reminder by email (Priority: P1) 🎯 MVP

**Goal**: Participants without a linked Telegram but with a verified email receive the
"missing predictions" reminder by email; Telegram users are unaffected.

**Independent Test**: With one match starting within the window and a member who has no
prediction, no linked Telegram, and a verified email — running the reminder cycle sends a
reminder email to them (and a Telegram-linked peer gets Telegram, not email).

- [ ] T008 [P] [US1] Add reminder-email test in `apps/api/src/lib/resend.test.ts`: asserts `to`/`from`, subject contains pool name, HTML contains a match line and `/pools/{poolId}/predictions` link + CTA label — depends on T005
- [ ] T009 [US1] Update `apps/api/src/jobs/reminderJob.ts`: candidate query selects users with `phone_number IS NOT NULL` OR (`email_verified = true` AND `email IS NOT NULL`); select `name`, `email`, `emailVerified`; build channel-agnostic `ReminderData` (email set only when verified); stop resolving `chatId`; keep the `userId:poolId` dedup — depends on T002
- [ ] T010 [US1] Update `apps/api/src/jobs/reminderJob.test.ts`: mocks include `email`/`emailVerified`/`name`; assertions switch from `chatId` to contact fields; add a "verified email, no phone" candidate case; remove job-level `findChatIdByPhone` expectations — depends on T009
- [ ] T011 [P] [US1] Add reminder routing scenarios in `apps/api/src/infrastructure/external/CompositeNotificationService.test.ts`: chat→Telegram (no email), no-chat+verified-email→email, neither→skip, one-failure isolation — depends on T006

**Checkpoint**: US1 fully functional and independently testable.

---

## Phase 4: User Story 2 — Winner notification by email (Priority: P2)

**Goal**: Pool winners without a linked Telegram but with a verified email receive the
"you won + prize + withdrawal link" notice by email; Telegram winners are unaffected.

**Independent Test**: Close a pool with a winner who has no linked Telegram and a verified
email — the winner receives the branded winner email with prize and withdrawal CTA.

- [ ] T012 [US2] Rename `getMembersWithPhone` → `getMembersWithContact` and `PoolMemberWithPhone` → `PoolMemberWithContact` (add `email: string | null`, `emailVerified: boolean`) in `apps/api/src/domain/pool/PoolRepository.port.ts`
- [ ] T013 [US2] Implement `getMembersWithContact` in `apps/api/src/infrastructure/persistence/DrizzlePoolRepository.ts` (select `user.email`, `user.emailVerified`) — depends on T012
- [ ] T014 [US2] Update `apps/api/src/jobs/closePoolsJob.ts` to build winners with `email = (emailVerified && email) ? email : null` via `getMembersWithContact` — depends on T012, T002
- [ ] T015 [US2] Update `apps/api/src/jobs/closePoolsJob.test.ts` (winner carries email) and fix the `getMembersWithPhone` mock name in `apps/api/src/application/pool/CreatePoolUseCase.test.ts` and `apps/api/src/application/prize/GetPendingPrizesUseCase.test.ts` → `getMembersWithContact` — depends on T014
- [ ] T016 [P] [US2] Add winner-email test in `apps/api/src/lib/resend.test.ts`: subject contains pool name, HTML contains formatted BRL prize and a withdrawal CTA/link — depends on T005
- [ ] T017 [P] [US2] Add winner routing scenarios in `apps/api/src/infrastructure/external/CompositeNotificationService.test.ts`: chat→Telegram, no-chat+verified-email→email, tie (multiple winners) each by own channel, `notifyAdminWithdrawalRequest` delegates to Telegram — depends on T006

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T018 Run full verification and fix until green: `pnpm test`, `pnpm biome check --write apps/api/src`, `pnpm check:leaks`, `pnpm build` (and the `_architecture.test.ts` guardrail)
- [ ] T019 Dead-code/consistency sweep: confirm no lingering `chatId` on the port, no remaining `getMembersWithPhone` references, no unused imports (Constitution I — no dead code)

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002–T007)** → **US1 (T008–T011)** and **US2 (T012–T017)** → **Polish (T018–T019)**.
- US1 and US2 are independent once Foundational completes and can be done in either order
  (US1 is the MVP / P1).

### Within Foundational

- T002 → T003 → T004; T005 independent; T006 needs T002+T003+T005; T007 needs T006.

### Parallel Opportunities

- T004 and T005 can run in parallel (different files).
- Within US1: T008 and T011 are [P] (resend.test vs composite.test); T009→T010 sequential (same job file).
- Within US2: T016 and T017 are [P]; T012→T013, T014→T015 sequential.

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → Phase 2 Foundational → Phase 3 US1.
2. Validate: reminder reaches a verified-email user; Telegram user unaffected.
3. This alone delivers the original request.

### Incremental Delivery

1. Foundational ready → US1 (reminders) → demo → US2 (winners) → demo.
2. Phase 5 verification before PR/merge.

## Notes

- [P] = different files, no incomplete dependencies.
- Mocking limited to ports/external deps (Resend, grammY, `findChatIdByPhone`) per Constitution II.
- Commit after each logical group; keep Telegram behavior byte-for-byte for linked users.
