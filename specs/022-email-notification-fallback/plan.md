# Implementation Plan: Email fallback for Telegram notifications

**Branch**: `022-email-notification-fallback` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/022-email-notification-fallback/spec.md`

## Summary

Add email as a **fallback notification channel** for the two user-facing notifications
that today are Telegram-only: **prediction reminders** (`reminderJob`) and **pool winner
notifications** (`closePoolsJob`). Channel selection is **one channel per recipient**:
Telegram if the user has a linked Telegram chat, otherwise verified email, otherwise none.

Technical approach (hexagonal): introduce a `CompositeNotificationService` that implements
the existing `NotificationService` port and centralizes per-recipient channel routing. The
existing `TelegramNotificationService` becomes a Telegram **transport** exposing
per-recipient send primitives. Email send functions are added to the existing Resend lib.
The port DTOs become channel-agnostic (`ReminderData` carries contact info; `WinnerInfo`
gains `email`). The jobs stop resolving Telegram chat IDs and instead pass contacts; the
pool repository is extended to return member email + verification status. No new runtime
dependencies, no schema/database changes.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js ≥ 22
**Primary Dependencies**: Hono (HTTP), Drizzle ORM (Postgres), grammY (Telegram), Resend
(email — already present), Better Auth. No new dependencies.
**Storage**: PostgreSQL 16 via Drizzle. **No schema changes** — reads existing
`user.email` / `user.email_verified` / `user.phone_number`.
**Testing**: Vitest (unit + integration). Integration tests use a real test DB + MSW to
stub Resend/Telegram at the HTTP boundary (feature 016).
**Target Platform**: Linux server (API backend) — `apps/api`.
**Project Type**: Web monorepo (backend `apps/api`, frontend `apps/web`); this feature is
**backend-only**.
**Performance Goals**: No change to existing cadence — reminder cron every 15 min over
pools with matches in the next ~1h; winner notification on pool close. Email sends are
per-recipient, batched in a loop with per-item error isolation.
**Constraints**: Email only to verified addresses; exactly one channel per recipient (no
duplicates); a single recipient failure must not abort the batch.
**Scale/Scope**: Same order as current Telegram reminders (tens of pools × hundreds of
members). ~7 source files touched + 3 test files updated/added.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Code Quality**: PASS. New code is single-responsibility (composite = routing,
  transport = send, lib = email templates). No dead code (`getMembersWithPhone` is renamed,
  not duplicated). Naming explicit. Email/phone remain raw `string` in **application-port
  DTOs** (consistent with the existing `WinnerInfo.phoneNumber: string | null` and
  `ReminderData`); the value-object mandate applies to the **domain layer**, which this
  feature does not touch.
- **II. Testing Standards**: PASS. New `CompositeNotificationService` (adapter) gets unit
  tests covering routing for both notification types and error isolation; new email
  functions get send-shape tests; affected jobs' tests are updated. Mocking limited to
  ports/external deps (Resend, grammY, `findChatIdByPhone`).
- **III. UX Consistency**: PASS. Emails reuse the existing m5nita branded HTML style
  (magic-link email) and the official sender. Consistent terminology with the Telegram
  messages.
- **IV. Performance**: PASS. No new queries in hot paths beyond extending an existing
  member query with two already-present columns; same cron cadence; no unbounded growth
  (the in-memory reminder dedup set is unchanged).
- **V. Hexagonal Architecture & SOLID**: PASS — and **improves** boundaries. Routing/
  channel detail moves **out of the application job** into an infrastructure adapter
  (`CompositeNotificationService`). The `NotificationService` port stays the abstraction;
  Composite + Telegram transport + email are infrastructure adapters (OCP: email added as
  a new channel without changing domain/application logic; LSP: Composite is substitutable
  for the port; DIP: jobs depend on the port, not on Telegram/Resend).

**Result**: No violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/022-email-notification-fallback/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (DTO/contact shapes — no DB entities)
├── quickstart.md        # Phase 1 output (manual verification)
├── contracts/
│   └── notification-service.md   # Port + adapter contract
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/api/src/
├── application/ports/
│   └── NotificationService.port.ts      # ReminderData → channel-agnostic; WinnerInfo += email
├── infrastructure/external/
│   ├── CompositeNotificationService.ts   # NEW — implements port, routes per recipient
│   ├── CompositeNotificationService.test.ts  # NEW
│   └── TelegramNotificationService.ts    # refactor → Telegram transport primitives
├── lib/
│   ├── resend.ts                         # += sendPredictionReminderEmail, sendWinnerEmail
│   └── resend.test.ts                    # += cases for new email functions
├── domain/pool/
│   └── PoolRepository.port.ts            # getMembersWithPhone → getMembersWithContact (+email,+emailVerified)
├── infrastructure/persistence/
│   └── DrizzlePoolRepository.ts          # implement getMembersWithContact
├── jobs/
│   ├── reminderJob.ts                    # candidate query +verified email; stop resolving chatId
│   ├── reminderJob.test.ts               # updated assertions
│   ├── closePoolsJob.ts                  # build winners with email
│   └── closePoolsJob.test.ts             # updated mock/method name
└── container.ts                          # wire CompositeNotificationService
```

**Structure Decision**: Backend-only change inside the existing hexagonal layout of
`apps/api/src`. The feature is delivered entirely through the `application/ports` →
`infrastructure/external` boundary plus the two jobs and the pool repository; no frontend,
no shared-package, and no migration changes.

## Complexity Tracking

> No constitution violations — section intentionally empty.
