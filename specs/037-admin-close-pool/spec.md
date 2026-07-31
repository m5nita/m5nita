# Feature Specification: Admin closes a pool stranded by postponed matches

**Feature Branch**: `037-admin-close-pool`
**Created**: 2026-07-31
**Status**: Draft
**Input**: User description: "Estou com um bolão em prod (c17fba18-8a5b-42a1-af9f-76ecb828f0e5) que meio que finalizou, mas não está finalizado no sistema pq alguns jogos da rodada foram adiados. Como podemos ajustar isso?"

## Overview

A pool closes when every match in its scope is terminal. `MatchStatus.TERMINAL_VALUES`
counts only `finished` and `cancelled`, so a **postponed** match holds its pool open
for as long as the federation takes to reschedule it — and holds the prize with it,
since `GetPrizeInfoUseCase` refuses any pool that is not `closed`.

That is the state of pool `c17fba18` ("Rafinha é careca!", Brasileirão round 21):
six matches finished, four postponed on 29/07 with no new date in the feed. Its three
members played out a six-match pool, the ranking is settled (22 / 15 / 15), and the
winner cannot withdraw.

Waiting is not just slow — it is wrong. Nobody predicted the four postponed matches:
the pool was created at 19:05 on 29/07, after their original kickoff, so they were
never predictable. If the federation reschedules them, the feed returns them as
`SCHEDULED` with a future date, `Match.canBePredicted` starts accepting predictions
again, and a pool everyone considers over reopens and its ranking can change weeks
later. Closing the pool seals that: `PoolStatus.canAcceptPredictions()` rejects
`closed`.

This adds a **manual escape hatch** for an admin, in the Telegram bot, alongside the
`/cupom_*` and `/competicao_*` commands and the existing admin match-finalize action.
The automatic closing rule is deliberately left untouched.

## Clarifications (resolved during brainstorming)

- **Escape hatch, not a rule change**: `closePoolsJob` keeps closing pools exactly
  when it does today. Deciding automatically that a postponed match no longer matters
  was considered and rejected — an admin makes the call.
- **Addressed by invite code**: `/bolao_encerrar 9VZJQ9J9`, not by UUID. The code is
  short, visible in the app, and `PoolRepository.findByInviteCode` already exists.
- **Refuses by default, `confirmar` overrides**: the command refuses while any
  in-scope match can still be played or predicted, and names them. A second argument
  `confirmar` forces the close anyway, for anomalies the default rule cannot foresee
  (for example a match stuck `live` by a feed bug).
- **Postponed matches are left alone**: no marking them `cancelled`, no touching the
  feed's data. The lie would come back the moment the sync ran again, and it would
  corrupt round 21 for every future pool.
- **Winners are notified through the existing path**: the command sends the same
  notification the automatic job sends, so an admin close is indistinguishable from a
  natural one for the members.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Release a pool stranded by postponed matches (Priority: P1)

As an admin, when a pool's remaining matches were postponed and cannot affect its
ranking, I close it from Telegram and the winner is notified and can withdraw.

**Why this priority**: it is the reported problem, and it is what unblocks a real
prize in production.

**Independent Test**: with a pool whose unfinished in-scope matches are all postponed
past their original kickoff, run the command; the pool becomes `closed`, the winner
receives the prize notification, and the prize endpoint stops refusing.

**Acceptance Scenarios**:

1. **Given** an active pool whose only non-terminal in-scope matches are postponed
   with kickoff in the past, **When** an admin sends `/bolao_encerrar CODIGO`,
   **Then** the pool becomes `closed` and the reply states the pool name, how many
   pending matches were ignored, the winner(s) and each one's prize share.
2. **Given** the same close, **When** it completes, **Then** the winner receives the
   same notification the automatic job sends.
3. **Given** the now-closed pool, **When** the winner opens it, **Then** the prize
   information loads instead of `POOL_NOT_CLOSED` and a withdrawal can be requested.
4. **Given** the postponed matches are later rescheduled and played, **When** the sync
   marks them `scheduled` and then `finished`, **Then** no member can add a prediction
   to the closed pool and the final ranking does not change.

### User Story 2 - Refuse to close a pool that is still being played (Priority: P1)

As an admin, if I aim the command at the wrong pool, it refuses instead of destroying
a pool in progress.

**Why this priority**: closing is irreversible from the members' side — predictions
are blocked and there is no reopen path. The guard is what makes the hatch safe.

**Independent Test**: run the command against a pool with a future scheduled match;
the pool stays `active` and the reply names the blocking matches.

**Acceptance Scenarios**:

1. **Given** an active pool with an in-scope match `scheduled` for the future,
   **When** an admin sends `/bolao_encerrar CODIGO`, **Then** the pool stays `active`,
   the reply lists the blocking matches, and it shows the `confirmar` form.
2. **Given** an active pool with an in-scope match `live`, **When** the command runs
   without `confirmar`, **Then** it refuses the same way.
3. **Given** either case, **When** the admin sends `/bolao_encerrar CODIGO confirmar`,
   **Then** the pool closes and the reply flags which matches were left open.
4. **Given** a non-admin Telegram user, **When** they send the command, **Then** they
   get the same permission refusal the other admin commands give and nothing happens.

### Edge Cases

- **Pool already closed**: replies that it is already closed and does **not** notify
  the winners a second time.
- **Unknown invite code**: replies that no pool has that code.
- **Pool `pending` or `cancelled`**: refused — only an `active` pool can be closed,
  which is what `Pool.close()` already enforces.
- **Lowercase code typed**: normalised to uppercase; the `InviteCode` charset is
  uppercase without `I`, `O`, `0`, `1`.
- **Missing argument**: replies with the usage line, matching `/competicao_desativar`.
- **Tie at the top**: every first-place member is notified and the prize splits, the
  same way the automatic job splits it.
- **Pool with no ranking rows** (nobody scored): closes, notifies nobody, and says so.
- **Single-match pool whose match was postponed**: the same rule applies through
  `Pool.unfinishedMatchesQuery()`; no branching on scope in the command.
- **Postponed match already carrying a future date**: treated as blocking, so the
  close is refused without `confirmar`. The feed can still promote it back to a
  predictable fixture before that kickoff.
- **Postponed match that members did predict** (pool created before the postponement):
  the close still discards those predictions' future points. The command reports the
  stranded matches so the admin sees what is being given up before deciding.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST classify a non-terminal match in a pool's scope as
  **blocking** when its kickoff is in the future or it is live, and **stranded**
  otherwise. A postponed match whose original kickoff has not passed yet is therefore
  blocking, because the feed can still turn it back into a predictable fixture before
  that moment.
- **FR-002**: That classification MUST live in the domain layer, so no other layer
  re-derives it from a raw status string.
- **FR-003**: The system MUST expose the unfinished in-scope matches of a pool, not
  only whether any exist, so they can be classified and named to the admin.
- **FR-004**: An admin MUST be able to close a specific pool from Telegram by its
  invite code.
- **FR-005**: The command MUST be refused for non-admin users, using the same
  permission check and message as the existing admin commands.
- **FR-006**: The close MUST be refused when any in-scope match is blocking, unless
  the admin passes `confirmar`.
- **FR-007**: A refusal MUST name the blocking matches and show the `confirmar` form.
- **FR-008**: A successful close MUST notify the winner(s) through the same path the
  automatic job uses, with the same prize calculation.
- **FR-009**: Closing MUST be idempotent — a pool that is not `active` is reported as
  such and produces no second notification.
- **FR-010**: The automatic closing behaviour MUST NOT change: `closePoolsJob` closes
  the same pools at the same moment as before this feature.
- **FR-011**: The feature MUST NOT modify match data. Postponed matches keep their
  status, date and scores.
- **FR-012**: A successful close MUST report the pool name, the count of ignored
  stranded matches, the winner(s) and the per-winner prize share.

### Key Entities *(include if feature involves data)*

- **Pool** — gains no column. The existing `status` transition `active → closed` is
  the whole state change.
- **Match** — read only. Its status is never written by this feature.
- **No migration.** No schema change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Pool `c17fba18-8a5b-42a1-af9f-76ecb828f0e5` is `closed`, its winner is
  notified, and the R$ 2,85 prize (3 × R$ 1,00 entry, 5% platform fee) is withdrawable.
- **SC-002**: An admin closes a stranded pool in one Telegram message, without a
  database query to find the pool and without a manual `UPDATE`.
- **SC-003**: A command aimed at a pool with matches still to be played leaves it
  `active`.
- **SC-004**: `closePoolsJob.test.ts` passes unchanged, showing the automatic path did
  not move.
- **SC-005**: After the close, a rescheduled and played round-21 match does not change
  the pool's final ranking.

## Assumptions

- The four postponed matches of round 21 have no predictions in this pool, verified in
  production: all three members hold exactly six predictions, matching the six
  finished matches. So the close cannot discard anyone's points.
- `ADMIN_USER_IDS` is configured in production, since the coupon and competition
  commands and the withdrawal-paid button already depend on it.
- The federation may or may not reschedule those four matches. The design is correct
  either way: closed pools accept no predictions.
- A closed pool never needs to be reopened. There is no reopen path today and this
  feature does not add one.

## Out of Scope

- Changing when pools close automatically — explicitly rejected in brainstorming.
- Treating `postponed` as terminal in `MatchStatus`.
- Listing or discovering stranded pools from Telegram (`/bolao_pendentes`), a web
  admin panel, or any other admin surface.
- Cancelling, rescheduling or otherwise editing matches.
- Reopening, cancelling or refunding a pool.
- Any change to scoring, ranking or the withdrawal flow.

## Dependencies

- `PoolRepository.findByInviteCode`, `findById`, `updateStatus`, `getMemberCount`,
  `getMembersWithContact` — all present.
- `Pool.close()` and `Pool.unfinishedMatchesQuery()` — present.
- `Match.canBePredicted`, `MatchStatus.isLive` — present.
- `PrizeCalculation`, `FeePolicy`, `EntryFee` — present.
- `NotificationService.notifyWinners` — present, used by `closePoolsJob`.
- `isAdmin` and the grammY `bot` in `lib/telegram.ts` — present.
- Production deploy is required before the fix can be applied to pool `c17fba18`.
