# Feature Specification: "Novo bolão" broadcast + per-type notification preferences

**Feature Branch**: `034-new-pool-broadcast`
**Created**: 2026-07-29
**Status**: Draft
**Input**: User description: "Quero criar um fluxo de notificação quando um novo bolão é criado, quem estiver criando o bolão deve poder selecionar uma opção para notificar os usuários do sistema para eles entrarem nesse novo bolão. Acho que essa notificação só faz sentido via push notification e telegram"

## Overview

Today a pool only fills up if its creator personally shares the invite link.
Nothing tells the rest of the base that a pool exists. This feature adds an
opt-in choice at creation — *"avisar todo mundo do m5nita sobre este bolão"* —
that, once the pool's entry payment is confirmed, sends every other registered
user a single notification deep-linking to that pool's invite page.

Announcing to the whole base is a loud act, so it ships together with the thing
that makes it safe: **per-type notification preferences**. A catalog of
notification types plus per-user override records, and a section in the settings
screen where each person chooses what they want to receive. One type — "você
venceu / prêmio disponível" — is deliberately **not** opt-outable: it is the
notification that tells someone there is money waiting to be withdrawn.

## Clarifications (resolved during brainstorming)

- **Audience**: **all registered users** except the creator (58 users today, of
  which ~16 are reachable). Not restricted to people who already played.
- **Channels**: Web Push first (all of the user's devices), Telegram if push did
  not deliver — **at most one channel per person, and no email**.
- **Per-pool choice**: a checkbox on the create-pool form, **unchecked by
  default**. Announcing to the whole base is an explicit act, never a side
  effect of creating a pool.
- **Who may trigger**: **any** pool creator, with **no daily cap**. Each pool
  announces at most once.
- **When**: **after the entry payment is confirmed and the pool goes live** —
  never while the pool is still awaiting payment, or people would receive
  invitations to pools that may never exist.
- **Preference model**: a **catalog of types** plus one override record per
  `(user, type)` — *not* one column per type — so adding a future toggle never
  requires a schema change.
- **Non-opt-outable type**: the winner / prize-available notification always
  delivers.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Announce a new pool to the base (Priority: P1)

As a user creating a pool, I tick *"avisar todo mundo do m5nita sobre este
bolão"*. After my payment is confirmed and the pool goes live, every other user
who accepts new-pool notifications receives one notification naming the pool,
its competition, its scope and its entry fee, which opens that pool's invite
page so they can join.

**Why this priority**: it is the feature that was asked for, and it is what lets
a new pool fill up without the creator chasing people one by one.

**Independent Test**: create a pool with the option ticked, confirm its payment,
and verify exactly one notification per eligible recipient, none for the creator,
and none at all for a pool whose payment never completes.

**Acceptance Scenarios**:

1. **Given** a creator who ticked the option, **When** the entry payment is
   confirmed, **Then** every other user with push enabled receives one push
   notification that opens the pool's invite page.
2. **Given** a recipient with no push but a Telegram chat linked to their phone,
   **When** the announcement runs, **Then** they receive the Telegram message and
   nothing on any other channel.
3. **Given** a recipient reachable by push **and** Telegram, **When** the
   announcement runs, **Then** they receive push only.
4. **Given** a recipient reachable by neither, **When** the announcement runs,
   **Then** nothing is sent and no error surfaces.
5. **Given** a creator who did **not** tick the option, **When** the payment is
   confirmed, **Then** nobody is notified.
6. **Given** a pool whose payment is never confirmed, **When** time passes,
   **Then** nobody is notified.
7. **Given** the same payment confirmation delivered twice, **When** both are
   processed, **Then** the announcement happens once.
8. **Given** both notification channels failing, **When** the announcement runs,
   **Then** the payment stays completed, the pool stays live, the creator's
   membership exists, and the failure is recorded in the logs.

---

### User Story 2 - Choose what I want to receive (Priority: P1)

As a user, I open the settings screen and see the list of notification types the
app sends, each with a plain-language description and a switch. I turn off the
ones I do not want. The choice belongs to my account: it applies no matter which
channel the notification would have arrived on.

**Why this priority**: it is the release valve for User Story 1. Shipping an
announcement to the whole base with no way out is how a useful app becomes a
muted app.

**Independent Test**: with a seeded user, turn each type off and verify the
matching notification stops while the others keep arriving; verify the locked
type keeps arriving regardless.

**Acceptance Scenarios**:

1. **Given** a user who never opened the settings, **When** the list loads,
   **Then** every type shows its default state (all on today).
2. **Given** a user who turns off "novos bolões", **When** an announcement runs,
   **Then** they receive nothing, **and** prediction reminders and per-match
   points notifications still reach them.
3. **Given** a user who turns off "lembretes de palpite", **When** the reminder
   run happens, **Then** they receive nothing on **any** channel, including the
   email fallback.
4. **Given** the non-opt-outable type, **When** the list renders, **Then** it
   appears as a locked row marked *"sempre ativo"* with no switch, **and** an
   attempt to disable it through the API is rejected.
5. **Given** a stored "disabled" record for a non-opt-outable type, **When** that
   notification is sent, **Then** it is still delivered.
6. **Given** a request naming an unknown type, **When** it is processed, **Then**
   it is rejected and no record is created.
7. **Given** a user who turns one type off and another on, **When** the settings
   are reloaded, **Then** both choices persisted and no other type changed.

---

### Edge Cases

- **The creator is the only registered user**: the recipient list resolves empty
  and the flow completes without error.
- **A recipient's push registration has expired**: the existing cleanup removes
  it, the person counts as "push did not deliver", and Telegram is tried.
- **A user registers between pool creation and payment confirmation**: they are
  included — recipients are resolved at send time, not at creation time.
- **A single-match pool whose fixture cannot be loaded** while the message is
  being composed: the scope wording degrades to a generic "Jogo único" and the
  announcement still goes out.
- **A pool created with the option ticked and later cancelled**: nothing extra is
  sent; the announcement already happened when the pool went live.
- **A type the code sends is missing from the catalog**: a consistency check
  fails the build rather than the notification silently disappearing in
  production.
- **A user disables every opt-outable type**: they still receive the winner /
  prize-available notification.

## Requirements *(mandatory)*

### Functional Requirements

**Announcement of a new pool**

- **FR-001**: The create-pool form MUST offer an optional "notify everyone"
  choice, **unchecked by default**, and submit it with the creation request.
- **FR-002**: The choice MUST be persisted with the pool at creation time and
  MUST survive the payment round-trip.
- **FR-003**: The announcement MUST happen only after the entry payment is
  confirmed **and** the pool has gone live. A pool still awaiting payment MUST
  NOT announce.
- **FR-004**: Each pool MUST announce **at most once**, including when the same
  payment confirmation is delivered more than once.
- **FR-005**: Recipients MUST be every registered user except the pool's creator.
- **FR-006**: Each recipient MUST receive **at most one channel**: push first
  (across all their devices), Telegram only if push did not deliver. Email MUST
  NOT be used for this notification.
- **FR-007**: Recipients reachable by neither channel MUST be skipped silently.
- **FR-008**: The notification MUST carry the pool name, competition name, scope
  wording, entry fee and the creator's first name, and MUST open the pool's
  invite page.
- **FR-009**: The scope wording MUST come from a single rule and read
  `Campeonato completo`, `Rodada {N}`, `Rodadas {N} a {M}`, or
  `{Casa} x {Visitante}` for a single-fixture pool — degrading to `Jogo único`
  when the fixture cannot be resolved.
- **FR-010**: A failure while announcing MUST NOT fail, roll back or retry the
  payment confirmation; it MUST be recorded in the logs.
- **FR-011**: There MUST be no per-creator limit on how many announcements can
  be sent.
- **FR-012**: Only the creator's **first name** may be included, since the
  message reaches the whole base.

**Notification preferences**

- **FR-013**: The system MUST keep a catalog of notification types, each with a
  stable code, a user-facing label and description, whether it can be turned
  off, its default state, and its display order.
- **FR-014**: A user's choices MUST be stored as one record per `(user, type)`
  override. **Absence of a record MUST resolve to the catalog default**, so
  existing users need no backfill.
- **FR-015**: Users MUST be able to read the ordered list of types together with
  their own resolved state and whether each type can be turned off.
- **FR-016**: Users MUST be able to change one type at a time; the request MUST
  be rejected for an unknown type or for an attempt to disable a type that
  cannot be turned off.
- **FR-017**: The preference check MUST be applied at the single point that
  routes a notification to a channel, so that scheduled runs (reminders, points,
  pool closing) need no changes and no second copy of the rule exists.
- **FR-018**: A type that cannot be turned off MUST always be delivered, even if
  a disabling record exists for it.
- **FR-019**: The settings screen MUST render whatever types the catalog
  currently holds — switchable types as switches, the locked type as a row marked
  *"sempre ativo"* — and MUST make clear that these choices belong to the account
  while the existing push control belongs to the device.
- **FR-020**: Introducing a new notification type later MUST require only a new
  catalog entry: no schema change and no front-end change.
- **FR-021**: The catalog MUST start with: new pool announced, prediction
  reminder, per-match points (all switchable, on by default) and winner / prize
  available (not switchable).
- **FR-022**: A preference MUST apply to every channel a notification could take
  (push, Telegram, email).

### Key Entities *(include if feature involves data)*

- **Notification type (catalog)**: code (identity), label, description, whether
  it can be turned off, default state, display order. Small and near-static, but
  consulted on every notification.
- **Notification preference**: a `(user, type)` pair with an on/off value and the
  moment it changed. Exists only where the user diverged from the default.
- **Pool**: gains the creator's "notify everyone" intent as part of the pool's
  own state, defaulting to off.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When a creator ticks the option and their payment is confirmed,
  every eligible reachable user receives exactly one notification within 30
  seconds of confirmation.
- **SC-002**: No user ever receives two notifications about the same pool, on any
  combination of channels, including when the payment confirmation is delivered
  twice.
- **SC-003**: A user who turns off "novos bolões" receives zero new-pool
  notifications and continues to receive reminders and per-match points.
- **SC-004**: Delivery of the winner / prize-available notification is unaffected
  by any stored preference.
- **SC-005**: Adding a hypothetical fifth notification type requires only a new
  catalog entry — demonstrated by adding one and seeing it appear, switchable, in
  the settings list with no schema change and no change to the screen itself.
- **SC-006**: Payment confirmation succeeds at the same rate as before: with the
  announcement forced to fail, the payment is still completed, the pool is live
  and the creator is a member.
- **SC-007**: A user can find and change what they receive in the settings screen
  in under 30 seconds, with the effect of each toggle stated in plain language.

## Assumptions

- The base is small (58 users, ~16 reachable today), so announcing to everyone
  one recipient at a time as part of confirming the payment is adequate: no
  queue, no batching, no scheduled sweeper.
- At-most-once delivery is inherited from the existing single-claim guarantee on
  payment confirmation — only the caller that wins the claim announces — so no
  extra "already announced" marker is introduced.
- Announcing reveals that a given person created a pool to the whole base. This
  is inherent to what was asked; only the first name is used.
- The invite page already handles someone arriving by link who is not yet a
  member, so no new joinable surface is needed.
- Users who are unreachable today become reachable automatically once they
  enable push or link Telegram; no migration or invitation is needed.

## Out of Scope

- Email as a channel for the new-pool announcement.
- Per-creator rate limits, admin-only announcing, or moderation of
  announcements.
- A public directory / "descobrir bolões" screen.
- Retrying a failed announcement (no sweeper, no "announced at" marker).
- A notification history or in-app inbox.
- Changing the existing per-device push enable/disable control.
- The statistics-tab scope change, which is specified separately as feature
  `035-stats-scope-gate`.

## Dependencies

- `030-web-push` — push registrations, sending, and notification-click handling.
- `002-telegram-otp` — the Telegram bot and phone-to-chat resolution.
- `024-complete-checkout-use-case` — the transactional payment-confirmation step
  the announcement hangs off.
- `019-single-match-pool` / `006-multi-competition` — the pool scope concept the
  scope wording is derived from.
