# Phase 0 Research: Email fallback for Telegram notifications

All open questions were resolved during brainstorming. No `NEEDS CLARIFICATION` markers
remained in the spec. This file records the decisions and their rationale.

## Decision 1 — Channel selection policy

- **Decision**: One channel per recipient. Telegram if the user has a **linked Telegram
  chat** (resolved from phone number); otherwise verified email; otherwise skip.
- **Rationale**: Reaches every user exactly once, maximizes reach (covers Google/magic-link
  users with no phone), and avoids duplicate notifications. Preferring Telegram preserves
  the richer, instant existing experience.
- **Alternatives considered**: (a) Both channels always → double-notifies users with both;
  rejected as spammy. (b) Email for everyone with an email → duplicates for Telegram users.

## Decision 2 — Email eligibility

- **Decision**: Send only to **verified** emails (`user.email_verified = true` and
  `user.email` not null).
- **Rationale**: Google and magic-link logins produce verified emails; restricting to
  verified protects sender reputation and avoids bounces/spam complaints.
- **Alternatives considered**: Any non-null email → risks invalid addresses; rejected.

## Decision 3 — Notification scope

- **Decision**: Email fallback for **prediction reminders** and **pool winner
  notifications** only.
- **Rationale**: Both are user-facing and time-sensitive. The **admin withdrawal-request**
  notification targets admins by Telegram ID (no admin→email mapping) and carries an
  interactive "Mark as paid" button that only works in Telegram. **Login OTP** is an auth
  flow with its own email path (magic-link). Both stay Telegram-only.

## Decision 4 — Architecture: CompositeNotificationService

- **Decision**: A `CompositeNotificationService` implements the existing
  `NotificationService` port and owns per-recipient channel routing. The existing
  `TelegramNotificationService` becomes a Telegram transport exposing per-recipient send
  primitives. Email functions live in the existing `lib/resend.ts`.
- **Rationale**: Fits hexagonal architecture (Constitution V). The "prefer Telegram, else
  email" policy needs a single place that sees both channels — the composite. It also
  removes the existing leak where the application job (`reminderJob`) resolved Telegram chat
  IDs directly. OCP: email is a new channel added without touching domain/application logic.
- **Alternatives considered**: (a) Split routing inside the job + two ports → routing leaks
  into the application layer; rejected. (b) A single multi-channel class mixing both
  transports + both formats → violates SRP / large class; rejected.

## Decision 5 — Carrying contact + verified email to the notifier

- **Decision**: Make `ReminderData` channel-agnostic
  (`{ userName, phoneNumber, email, poolName, poolId, matches }`) and add `email` to
  `WinnerInfo`. The reminder candidate query includes users with **either** a phone **or** a
  verified email; the winner builder extends `getMembersWithPhone` →
  `getMembersWithContact` to also return `email` + `emailVerified`.
- **Rationale**: The composite must decide the channel, so it needs both contacts. `email`
  is passed only when verified (else `null`), keeping the eligibility rule (Decision 2) at
  the data-collection edge and the routing logic simple.
- **Alternatives considered**: Keep `chatId` on the DTO → couples the port to Telegram and
  blocks the email channel; rejected.

## Decision 6 — Email content & delivery semantics

- **Decision**: Branded HTML consistent with the existing magic-link email (wordmark, red
  accent bar, CTA button); official sender `M5nita <noreply@notifications.m5nita.com>`.
  Reminder subject `⚽ Não esqueça seus palpites — {poolName}`, CTA → `{APP_URL}/pools/
  {poolId}/predictions`. Winner subject `🏆 Você venceu o bolão {poolName}!`, CTA →
  `{APP_URL}`. Per-recipient send is wrapped in try/catch (log and continue), mirroring the
  current Telegram behavior. If `APP_URL` is empty, fall back to a text instruction (no
  broken button).
- **Rationale**: UX consistency (Constitution III) and resilience (one bad recipient must
  not abort the batch — FR-008).

## No new dependencies / no schema changes

Resend is already a project dependency (used for magic-link). The needed columns
(`email`, `email_verified`, `phone_number`) already exist on the `user` table. Therefore no
package additions and no Drizzle migration.
