# Feature Specification: Web Push Notifications (PWA)

**Feature Branch**: `030-web-push`
**Created**: 2026-06-27
**Status**: Draft
**Input**: User description: "Add Web Push notifications to the m5nita PWA so re-engagement no longer depends on the Telegram bot — using the 030-web-push handoff as the base, refined through brainstorming."

## Overview

Today every m5nita notification (pre-kickoff reminders, winner alerts) reaches a user
only through Telegram (if they connected the bot) or, as a fallback, email. There is no
real-time, app-native channel: a torcedor who installed the PWA and signed in with
Google or email has no in-app way to be pulled back at the right moment.

This feature adds **Web Push** as a first-class, app-native notification channel. It is
the foundational retention lever: once a user opts in, the product can reach them on
their device the moment something relevant happens — "your match starts soon and you
have palpites faltando", "you scored X points in this game", "you won". Web Push is the
first of three retention bets; round recap and recurring leagues are separate, later
specs that build on this base.

### Scope decisions (resolved in brainstorming)

- **Channel policy — Push primary for everyone.** For any given user-facing event, the
  delivery channel is chosen in the order **Web Push → Telegram → email**. A user with at
  least one active push subscription receives that event via push (on all their devices)
  and **not** via Telegram or email. Users without push fall back to Telegram, then email.
  This deliberately promotes push above the existing Telegram channel.
- **v1 triggers** — three notification types are in scope:
  1. **Pre-kickoff / palpite reminders** (existing trigger, gains push delivery).
  2. **Winner alerts** (existing trigger, gains push delivery).
  3. **"Pontos conquistados ao final de cada jogo"** (net-new trigger): when a match
     finishes, each participant who predicted it gets a push, **per pool**, with the
     points they earned and their resulting position.
- **"Pontos conquistados" is push-only in v1** — no Telegram or email version of this new
  trigger. Users without a push subscription simply do not receive it.
- **Opt-in UX** — a soft in-app explainer is shown automatically the first time a
  signed-in user opens the app and has never seen it (because existing users already have
  predictions, the prompt is **not** tied to saving a first palpite). The native browser
  permission prompt only fires after the soft explainer. A toggle in `/settings` lets
  users enable/disable at any time.
- **iOS** — feature-detect and degrade gracefully. iOS only supports Web Push for a PWA
  installed to the home screen; when an iOS user tries to enable push from a normal Safari
  tab, show guidance to "Add to Home Screen" rather than failing.

### Explicitly out of scope (future specs)

- Position-change alerts ("você caiu para o 4º").
- Round recap notifications.
- Telegram/email versions of the "pontos conquistados" trigger.
- Per-trigger notification preferences (v1 is a single on/off switch).
- Rich notification actions/buttons beyond a title, body, and one deep link.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Opt in to push and be reminded to palpitar before kickoff (Priority: P1)

A torcedor who uses the PWA without Telegram opens the app, sees a short explanation of
why notifications help, and enables them. Later, when a match they have not yet predicted
is about to start, their device shows a push that takes them straight to the palpite
screen so they can submit before the deadline.

**Why this priority**: This is the minimum viable slice — the opt-in flow plus one
high-value trigger. It alone delivers the core retention value (pulling users back to
palpitar) for the audience that gets nothing app-native today. Without it, no other push
type can exist.

**Independent Test**: On a supported device, sign in, accept the soft explainer and the
native permission prompt, and confirm the subscription is stored. Then, with an upcoming
match and a missing palpite for that user, trigger the reminder and confirm a push is
delivered to the device and that tapping it opens the palpite screen for that pool/match.

**Acceptance Scenarios**:

1. **Given** a signed-in user on a push-capable browser who has never seen the prompt,
   **When** they open the app, **Then** a soft in-app explainer about notifications is
   shown before any native browser prompt.
2. **Given** the soft explainer is shown, **When** the user chooses to enable, **Then**
   the native permission prompt appears and, on grant, the device's subscription is
   stored against their account.
3. **Given** the user dismisses or declines the soft explainer, **When** they reopen the
   app later, **Then** the soft explainer does not appear again automatically (but they
   can still enable push from `/settings`).
4. **Given** a user with an active push subscription has not submitted a palpite for an
   upcoming match, **When** the pre-kickoff reminder fires, **Then** they receive the
   reminder as a Web Push (and not via Telegram or email).
5. **Given** a delivered reminder push, **When** the user taps it, **Then** the app opens
   focused on the palpite screen for the relevant pool/match.

---

### User Story 2 - See points earned right after each match (Priority: P2)

A user who submitted predictions wants the satisfying feedback loop of learning how they
did the moment a game ends. When a match finishes, for each of their pools that includes
that match, they get a push telling them the points they earned in that pool and their
new position in that pool's ranking, with a tap-through to the ranking/results.

**Why this priority**: This is the net-new engagement driver that makes push feel alive
and rewarding, distinct from the utilitarian reminder. It is push-native and high
frequency, so it builds the habit of opening the app around match endings.

**Independent Test**: With a user who predicted a match in two different pools, mark the
match finished and confirm the user receives exactly one push per pool, each stating the
points earned for that match in that pool and the user's resulting position, and that
tapping opens that pool's ranking/results. Confirm a second sync of the same finished
match does not re-notify.

**Acceptance Scenarios**:

1. **Given** a user predicted a match in a pool, **When** that match is marked finished,
   **Then** they receive a Web Push stating the points earned for that match in that pool
   and their resulting position in that pool's ranking.
2. **Given** a user is in multiple pools that include the same finished match, **When**
   the match finishes, **Then** they receive one push per pool (each with that pool's
   points and position).
3. **Given** a user did not submit a prediction for a match in a pool, **When** the match
   finishes, **Then** they receive no "pontos conquistados" push for that pool.
4. **Given** a "pontos conquistados" push has already been sent for a (user, pool, match),
   **When** the match-finish path runs again (re-sync, stale-to-finished promotion,
   restart), **Then** no duplicate push is sent.
5. **Given** a user has no active push subscription, **When** a match they predicted
   finishes, **Then** they receive no "pontos conquistados" notification on any channel
   (push-only in v1).

---

### User Story 3 - Know immediately when you win (Priority: P3)

When a pool closes and a user is among the winners, they are notified on their preferred
channel. For push-subscribed users this now arrives as a push that opens the pool's
results, rather than only via Telegram/email.

**Why this priority**: Winner alerts already exist on Telegram/email; routing them
through push is near-free and completes the channel story, but it is low frequency and
already partially served, so it ranks below the reminder and pontos triggers.

**Independent Test**: Close a pool with a known winner who has a push subscription and
confirm the winner alert is delivered via push (not Telegram/email), and that tapping it
opens the pool's results.

**Acceptance Scenarios**:

1. **Given** a winning user with an active push subscription, **When** their pool closes,
   **Then** the winner alert is delivered as a Web Push and not duplicated on Telegram or
   email.
2. **Given** a winning user with no push subscription but a connected Telegram, **When**
   their pool closes, **Then** the winner alert is delivered via Telegram (existing
   behavior preserved).

---

### User Story 4 - Control notifications across devices (Priority: P2)

A user can turn push on or off from `/settings` at any time, and can enable push
independently on more than one device (phone and laptop). Turning it off on one device
stops pushes to that device only.

**Why this priority**: Consent control is required for a respectful launch and to let
users recover from an accidental decline; multi-device support is needed because users
move between phone and desktop. It is grouped just below the core trigger because the
opt-in path in US1 already establishes the basic enable/disable mechanism.

**Independent Test**: Enable push on two devices for one account; confirm both receive a
test event. Disable on one device via `/settings`; confirm only the other device keeps
receiving events and the disabled device's subscription is removed.

**Acceptance Scenarios**:

1. **Given** a user with push enabled, **When** they open `/settings`, **Then** the
   current push status is shown with a control to disable it.
2. **Given** a user disables push in `/settings`, **When** a later event fires, **Then**
   that device receives no push.
3. **Given** a user enables push on a second device, **When** an event fires, **Then**
   both devices receive the push and neither device's subscription disabled the other.
4. **Given** a user previously declined the native prompt, **When** they enable push from
   `/settings` and grant permission, **Then** their subscription is (re)stored.

---

### Edge Cases

- **Permission denied at the browser prompt** → the app respects it, does not nag, and
  surfaces re-enable only via `/settings`.
- **Permission revoked at OS/browser level after enabling** → subsequent sends fail as
  expired; the system removes the dead subscription and `/settings` reflects "off".
- **Match score corrected after it first finished** → "pontos conquistados" is sent at
  most once (on first finalization); later corrections do not re-notify in v1.
- **Stale live match auto-promoted to finished** (existing "stale → finished after 12h"
  policy) → must also trigger "pontos conquistados" exactly once.
- **Popular match finishes** (many members across many pools) → a large burst of pushes
  must be delivered without overloading the system or the push service.
- **Unauthenticated visitor opens the app** → no soft explainer is shown (push requires a
  signed-in account).
- **Unsupported browser / iOS Safari tab** → the enable control is hidden or disabled;
  iOS tab users who try to enable see "Add to Home Screen" guidance.
- **Re-enabling on the same device** → does not create a duplicate stored subscription.
- **User with Telegram connected but also push-subscribed** → reminders and winner alerts
  go via push only (push primary), not Telegram.

## Requirements *(mandatory)*

### Functional Requirements

**Opt-in & consent**

- **FR-001**: The app MUST let a signed-in user enable Web Push notifications for their
  account on a supported device.
- **FR-002**: The app MUST present a soft in-app explanation of the value of
  notifications before any native browser permission prompt is triggered (never auto-fire
  the native prompt on load).
- **FR-003**: The soft explainer MUST appear automatically the first time a signed-in
  user opens the app and has never seen it; once shown (whether accepted or dismissed) it
  MUST NOT auto-appear again.
- **FR-004**: The `/settings` screen MUST provide a control to enable and disable push
  notifications at any time, reflecting the current status for the current device.
- **FR-005**: Disabling push (opt-out) MUST stop all future pushes to that device.

**Subscriptions & devices**

- **FR-006**: The system MUST persist each enabled device's push subscription associated
  with the authenticated user's account.
- **FR-007**: A single user MUST be able to have push enabled on multiple devices
  simultaneously; enabling on a new device MUST NOT affect other devices' subscriptions.
- **FR-008**: Enabling push again on a device that is already subscribed MUST be
  idempotent (no duplicate stored subscription for the same device).
- **FR-009**: Push subscriptions MUST belong to the authenticated user; enabling and
  disabling MUST require the user to be signed in.
- **FR-010**: The system MUST remove a subscription that the push service reports as
  expired or invalid, so future sends skip dead devices.

**Channel policy & delivery**

- **FR-011**: For any user-facing notification, the system MUST select exactly one
  channel per user per event using the order **Web Push → Telegram → email**: if the user
  has at least one active push subscription, deliver via push; else if Telegram is
  connected, deliver via Telegram; else deliver via email; else do not send.
- **FR-012**: When delivering via push, the system MUST deliver the event to all of the
  user's active device subscriptions.
- **FR-013**: The system MUST NOT deliver the same event to a single user on more than one
  channel (no Telegram-plus-push duplication).

**Triggers**

- **FR-014**: The existing pre-kickoff reminder (user has an upcoming match with no
  submitted palpite) MUST be deliverable via Web Push, following the channel policy
  (FR-011), reusing the existing reminder schedule and recipient resolution.
- **FR-015**: When a match is marked finished, for each pool the user participates in that
  includes that match AND for which the user submitted a prediction, the system MUST send
  a Web Push stating the points the user earned for that match in that pool and the user's
  resulting position in that pool's ranking — one push per (user, pool, match).
- **FR-016**: "Pontos conquistados" (FR-015) MUST be delivered via Web Push only in v1
  (no Telegram or email fallback); users without a push subscription do not receive it.
- **FR-017**: A "pontos conquistados" push MUST be sent at most once per (user, pool,
  match); match-finish re-runs (re-sync, stale-to-finished promotion, restarts) MUST NOT
  re-notify.
- **FR-018**: The existing winner alert MUST be deliverable via Web Push, following the
  channel policy (FR-011).

**Content & navigation**

- **FR-019**: All push titles and bodies MUST be free of emoji (consistent with the
  product's emoji-free copy) and written in Portuguese (pt-BR).
- **FR-020**: Every push MUST show a user-visible notification when received (no silent
  pushes).
- **FR-021**: Tapping a push MUST open the app focused on the relevant screen: the palpite
  screen for reminders, and the pool ranking/results for "pontos conquistados" and winner
  alerts.

**Platform handling**

- **FR-022**: Where the platform does not support Web Push (e.g., iOS Safari tab,
  unsupported browsers), the app MUST detect this and hide or disable the enable control
  gracefully rather than erroring.
- **FR-023**: On iOS, when a user attempts to enable push where it is unavailable in a
  Safari tab, the app MUST show guidance to install the PWA to the home screen to unlock
  notifications.

### Key Entities *(include if feature involves data)*

- **Push Subscription**: a single browser/device's authorization to receive pushes for a
  user. Belongs to exactly one user; a user can have many. Carries the unique device
  endpoint, the cryptographic material required to deliver encrypted messages to that
  endpoint, an optional device/user-agent label (to help users recognize devices), and a
  creation timestamp. Removed when the device opts out or the endpoint becomes invalid.
- **Notification event (channel-agnostic)**: the reminder, winner, or "pontos
  conquistados" payload with recipient context. Reuses the existing channel-agnostic
  notification concept; the channel is chosen at delivery time per FR-011.
- **Pool ranking / match score (existing, referenced)**: the source of "points earned"
  and "resulting position" for the "pontos conquistados" trigger; points are computed per
  pool because the same match can sit in multiple pools with different scoring rules.
- **"Already notified" record for pontos (conceptual)**: the dedupe guarantee behind
  FR-017, ensuring at-most-once delivery per (user, pool, match).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in user on a supported device can complete the enable flow (soft
  explainer → native grant → subscription stored) and successfully receive a test/triggered
  push within 1 minute of the triggering event.
- **SC-002**: After a user opts out, they receive zero further pushes on that device.
- **SC-003**: Across all sent events, no user receives the same event on more than one
  channel (0 Telegram-plus-push duplicates).
- **SC-004**: At least 95% of "pontos conquistados" pushes are delivered within 5 minutes
  of the match being marked finished.
- **SC-005**: Zero duplicate "pontos conquistados" pushes per (user, pool, match), even
  across repeated sync runs and restarts.
- **SC-006**: Among users who receive a pre-kickoff reminder push while having a missing
  palpite, at least 20% submit that palpite before the match deadline.
- **SC-007**: The share of send attempts to invalid/expired device subscriptions stays
  below 5% on a rolling basis (dead subscriptions are pruned promptly).
- **SC-008**: At least 25% of active web users who can receive push (supported device,
  signed in) enable it within the first month after launch.
- **SC-009**: 100% of iOS Safari-tab users who attempt to enable push see install
  guidance and encounter no errors.

## Assumptions

- The existing email fallback (spec 022) remains in place as the final channel; this
  feature only inserts Web Push ahead of Telegram and email in the delivery order.
- "Pontos conquistados" is intentionally push-only in v1; building Telegram/email versions
  is deferred.
- Position-change alerts and round recap are out of scope (separate future specs).
- The pre-kickoff reminder trigger reuses the existing reminder job's schedule, recipient
  resolution, and per-match dedupe; this feature changes only the delivery channel, not
  who is eligible or when reminders fire (aside from adding push subscription as an
  eligibility/contact path).
- Points and resulting position for "pontos conquistados" are derived from the existing
  per-pool scoring and ranking rules; no new scoring logic is introduced.
- The "has the user seen the soft explainer" state is tracked so the prompt shows at most
  once automatically; the exact storage mechanism is an implementation detail for `/plan`.
- The choice of how push handlers are added to the existing PWA service worker, the server
  push delivery mechanism, key management, the data schema for subscriptions, and any new
  dependency are implementation details deferred to `/plan` (the project otherwise avoids
  new runtime dependencies, so any addition must be justified there).
- Web Push requires a secure context; the feature runs over HTTPS in production
  (localhost is exempt for development).
- Success-criteria measurement: SC-004 (delivery latency) and SC-007 (invalid-endpoint
  rate) are measured from push send-outcome / dead-subscription-prune counters emitted by
  the delivery path (instrumented in this feature). SC-006 (reminder→palpite conversion)
  and SC-008 (opt-in adoption) are post-launch **product analytics** outcomes, not build
  tasks; they are observed after release rather than asserted by an automated test.

## Dependencies

- The existing notification routing seam (Telegram + email channel selection) and the
  existing reminder and winner-alert triggers.
- The existing per-pool scoring and ranking, and the match-finish path (including the
  stale-live → finished promotion) that signals when "pontos conquistados" should fire.
- The existing PWA (installability and service worker) and authenticated session.
