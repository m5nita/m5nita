# Feature Specification: Require a winner before a match is `finished` (+ admin finalize)

**Feature Branch**: `032-require-winner-to-finish`
**Created**: 2026-06-30
**Status**: Draft
**Input**: Production incident on match `537418` (Netherlands–Morocco, round-of-32). The live-score sync persisted the match as `status='finished'` with `winner=NULL` (and a bogus tied penalty score), which silently skipped the `+2` knockout advance bonus for everyone who picked Morocco to advance — and, because scoring is gated on the not-finished→finished transition, it never re-scored when the provider later supplied the winner.

## Context & Problem

The knockout advance bonus (`+2`) is decided **solely** by the stored `match.winner` column (`'home'`/`'away'`) in `domain/match/KnockoutResult.ts` (`knockoutContextFor`). Penalties are never used to derive the winner. Three structural gaps combined to make the bug stick:

1. **Status without winner** — `Match.deriveStatusFromApi` (`domain/match/Match.ts:67-85`) maps a match to `finished` purely from the feed's `apiStatus` (or the 12h stale-live rule), with no requirement that `winner` is present.
2. **Premature finalization** — `jobs/calcPoints.ts` `calcPointsForMatch` finalizes (writes non-NULL `prediction.points`) checking `status` + scoreline but not `winner`.
3. **One-shot trigger** — `SyncLiveScoresUseCase.applyLiveMatch` (`:116-123`) fires `onMatchFinished` only on the not-finished→finished transition, so a later corrected winner never re-scores.

The data for `537418` was repaired manually (winner set, `+2` applied to the 7 affected predictions, standings recomputed, API restarted to flush caches). This feature prevents recurrence — the remaining World Cup knockout rounds (R16/QF/SF/Final) will hit the same path.

**Chosen direction:** enforce a single invariant — *a match is never `finished` without a known winner* — by holding it as `live` until the winner arrives. If a winner never arrives (provider outage / abandoned match / 12h-stale feed), alert the Telegram admins, who finalize the match with one tap; that action also re-scores. No penalty-derived winner inference, no auto-finish without a result.

## Clarifications

### Session 2026-06-30

- **Q: Scope the winner gate to knockout only, or all match types?** → **All types (universal).** `winner` is cosmetic for non-knockout scoring (scoreline-based), normal finished matches always carry a winner, and universal removes any coupling to stage taxonomy in the lifecycle code. Worst case for an exotic non-knockout match with a permanently-null winner is the same admin alert, which is acceptable/desirable.
- **Q: What happens to the existing 12h stale-live force-finish under this invariant?** → **Consistent: it also holds + alerts.** No path finalizes without a winner. A feed-stuck match waits for an admin instead of auto-finishing a resultless match (which would otherwise let a pool close/pay on a non-result).
- **Q: How does the admin resolve a held match?** → **Telegram inline buttons on the alert only** (no typed command). Reuses the existing `ADMIN_USER_IDS` + `isAdmin` allowlist and the withdrawal-pay alert/callback template. No HTTP admin surface is introduced.
- **Knob decisions:** hold as the existing `'live'` status (no new status value); alert grace window = **3h after kickoff**; alert dedup = **in-memory Set** (re-alert on process restart is acceptable); finalize action **rejects `draw` for knockout stages**. No DB migration.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Knockout decided after the gate (Priority: P1)

A round-of-32 match ends 1-1 and is decided on penalties. The provider reports `FINISHED` for a few seconds/minutes before populating `score.winner`. The pool members who correctly picked the advancing side must receive their `+2` once the winner is known — never silently dropped.

**Why this priority**: This is the exact production failure and the core value of the feature.

**Independent Test**: Drive two sync ticks — tick 1 returns `FINISHED` with `winner=null`; tick 2 returns `FINISHED` with `winner=AWAY_TEAM`. Assert the match is not finalized after tick 1 and is correctly finalized with the advance bonus after tick 2.

**Acceptance Scenarios**:

1. **Given** a knockout match the provider reports `FINISHED` with `winner=null`, **When** the live sync runs, **Then** the match is stored as `status='live'` (held), `prediction.points` stays `NULL`, and `onMatchFinished` is **not** fired.
2. **Given** that held match, **When** a later sync returns the same match `FINISHED` with `winner=AWAY_TEAM`, **Then** the match becomes `status='finished'`, scoring runs once, and every prediction with `advance_pick='away'` gains `+2` on top of its scoreline points.
3. **Given** the match self-heals via the provider, **Then** no admin alert is sent (resolved within the grace window).

### User Story 2 - Held match resolved by an admin (Priority: P1)

The provider never supplies a winner (data outage / abandoned). The pool must not stay frozen. An admin is alerted and finalizes the match with the real result in one tap; points are recomputed immediately.

**Why this priority**: Without a manual escape hatch, a held match would block its pool indefinitely.

**Independent Test**: Hold a match past the grace window, assert exactly one admin alert with three winner buttons; simulate a button tap as an allowlisted admin and assert the match finalizes and re-scores.

**Acceptance Scenarios**:

1. **Given** a match held awaiting a winner for longer than the grace window, **When** the live sync runs, **Then** the `ADMIN_USER_IDS` allowlist receives one Telegram message with match details and `[home] [away] [draw]` buttons, and is not re-alerted on subsequent ticks.
2. **Given** that alert, **When** an allowlisted admin taps the away button, **Then** the match is set `winner='away'`, `status='finished'`, points + standings + notifications are recomputed (the `onMatchFinished` path), and the message is edited to a confirmation.
3. **Given** a non-allowlisted Telegram user taps the button, **When** the callback runs, **Then** it is rejected with a permission message and no state changes.
4. **Given** a knockout match, **When** an admin taps the draw button, **Then** the finalize action is rejected (a knockout cannot end in a draw).

### User Story 3 - Stale feed without a winner (Priority: P2)

The feed stays `IN_PLAY` for 12h (stuck) with no winner. Under the new invariant the match is held + alerted instead of being auto-finished as a non-result.

**Why this priority**: Consistency of the invariant; lower frequency than US1/US2.

**Acceptance Scenarios**:

1. **Given** a match the feed still reports `IN_PLAY` with scores 12h+ after kickoff and `winner=null`, **When** the live sync runs, **Then** the match stays `status='live'` (not force-finished) and the admins are alerted once.

### Edge Cases

- **Group/league match, `winner` present (normal):** finishes immediately as today — the gate only activates when `winner` is null. No behavior change for the overwhelmingly common case.
- **Predictions remain open?** No. Holding as `live` does not reopen predictions — `Match.canBePredicted` requires `scheduled` + future kickoff.
- **Pool closing:** a held match defers pool closing until it truly finishes (provider winner or admin finalize). This is intended — pools must not close/pay on a pending result.
- **Provider corrects a winner on an already-finished match:** out of scope for auto-rescore; the admin finalize action is the manual remedy (it re-scores).
- **Double resolution (provider + admin nearly simultaneously):** finalize is idempotent; `calcPointsForMatch` recomputes from current DB state, so a redundant resolution is harmless.
- **Held match leaves the ±1 day sync window:** the grace-window alert (3h after kickoff) fires well before a match could age out of the sync window, so the admin is always notified while the match is still observable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001 — Winner-gated finish.** The system MUST NOT persist a match as `status='finished'` unless a `winner` of `home`, `away`, or `draw` is known. This applies to **all** stages and competitions.
- **FR-002 — Hold as `live`.** When the upstream signal would otherwise finish a match (provider `FINISHED`/`AWARDED`, or the stale-live rule) but `winner` is null, the match MUST be stored as `status='live'` and MUST keep ingesting scoreline / extra-time / penalty / minute updates on each sync tick.
- **FR-003 — Stale consistency.** The 12h stale-live rule MUST NOT force a match to `finished` without a winner; such a match is held (FR-002) and alerted (FR-006).
- **FR-004 — Self-heal on winner arrival.** Once the feed supplies the winner, the held match MUST transition to `finished` and trigger scoring exactly once, awarding the knockout advance bonus correctly.
- **FR-005 — No premature scoring.** While a match is held, no points are written; affected predictions keep `points = NULL`, and the live/provisional ranking path continues to show provisional points.
- **FR-006 — Admin alert.** When a match has been held awaiting a winner for longer than the grace window (default: 3h after kickoff), the system MUST send exactly one Telegram alert to the `ADMIN_USER_IDS` allowlist, including the teams, stage, current scoreline (and penalties if any), and winner-resolution buttons.
- **FR-007 — Alert dedup.** The system MUST NOT re-alert for the same held match on every sync tick. In-memory dedup is acceptable (a re-alert after a process restart is tolerated).
- **FR-008 — Resolution buttons.** The alert MUST include inline buttons to set the winner: home, away, and draw.
- **FR-009 — Finalize action.** Tapping a winner button MUST set the match `winner` + `status='finished'` and then recompute points, standings, and notifications by reusing the existing `onMatchFinished` path (`calcPointsForMatch` + `notifyMatchPointsUseCase`). It MUST be idempotent and usable as a correction tool: re-finalizing with a different winner re-scores from current state.
- **FR-010 — Finalize validation.** The finalize action MUST accept only `winner ∈ {home, away, draw}` and MUST reject `draw` for knockout stages.
- **FR-011 — Authorization.** Only Telegram users present in `ADMIN_USER_IDS` may invoke the finalize action, enforced by the existing `isAdmin` guard.
- **FR-012 — No new HTTP surface, no schema change.** No HTTP admin endpoint, no Better Auth role, and no database migration are introduced.

### Key Entities / Domain

- **`Match.deriveStatusFromApi`** (`domain/match/Match.ts`) — extended to receive the mapped `winner` and to return a richer result `{ status: MatchStatus, heldForWinner: boolean }`. `heldForWinner` is `true` when the would-be status is `finished` but `winner` is null. The pure-domain seam where the invariant lives.
- **`MatchStatus`** (`domain/match/MatchStatus.ts`) — unchanged value set; a held match uses the existing `live` value.
- **`StaleMatchPolicy`** — unchanged (still provides `isStaleSinceKickoff`); its result now feeds the gate rather than directly finishing.
- **`FinalizeMatchUseCase`** (new, application layer) — sets winner + finished and runs the `onMatchFinished` pair; idempotent; validates winner.
- **Admin alert callback** — new `onMatchHeldAwaitingWinner` (symmetric to `onMatchFinished`), backed by a new `TelegramNotificationService.notifyAdminMatchNeedsWinner`.
- **No DB changes** — held state is the existing `live` status; alert dedup is in-memory.

## Changes by Layer *(guidance for planning)*

- **Domain** — `Match.deriveStatusFromApi` gains a `winner` input and returns `{ status, heldForWinner }`; the gate logic (would-finish ∧ winner==null → hold as `live`) lives here. `StaleMatchPolicy` unchanged.
- **Application** — `SyncLiveScoresUseCase` consumes the richer return, suppresses the premature finish trigger while held, and emits the held signal (with grace-window + dedup) to an `onMatchHeldAwaitingWinner` callback. `SyncFixturesUseCase` consumes the richer return (gate only; no alert). New `FinalizeMatchUseCase` orchestrates set-winner → `calcPointsForMatch` → `notifyMatchPointsUseCase`.
- **Infrastructure** — `MatchMapper.mapStatus` forwards the mapped `winner` and returns the status string (and, where needed, exposes `heldForWinner`). `TelegramNotificationService` gains `notifyAdminMatchNeedsWinner` (broadcast to `ADMIN_USER_IDS` with inline buttons, mirroring `notifyAdminWithdrawalRequest`). `lib/telegram.ts` gains a `finalize_match:{matchId}:{winner}` `callbackQuery` handler (admin-guarded). `index.ts` wires `onMatchHeldAwaitingWinner` and owns the in-memory alert-dedup Set + grace constant.
- **Frontend** — none.
- **Database** — none (no migration).

## Testing *(mandatory)*

- **Unit — `Match.deriveStatusFromApi`:** `FINISHED`+winner→`finished`/not-held; `FINISHED`+null→`live`/held; `IN_PLAY`+scores+stale+null→`live`/held; `IN_PLAY`+scores+stale+winner→`finished`; `IN_PLAY` not-stale→`live`; `SCHEDULED`→`scheduled`.
- **Unit — `FinalizeMatchUseCase`:** sets winner+finished and triggers scoring; idempotent on re-run; rejects `draw` on a knockout stage; rejects an invalid winner value.
- **Unit/handler — Telegram callback:** allowlisted admin tap finalizes (use-case invoked, message edited); non-admin tap rejected with no state change; malformed callback data handled.
- **Integration — regression of `537418`:** two-tick scenario (FINISHED+null then FINISHED+away) asserts no finalize/points after tick 1, and `finished` + `+2` for `advance_pick='away'` after tick 2. Uses the real DB harness.
- **Alert behavior:** a match held past the grace window triggers exactly one admin notification (dedup verified across consecutive ticks).

## Out of Scope

- A dedicated `awaiting_result` status value or any UI label for the held state (held = existing `live`).
- An HTTP admin endpoint / Better Auth admin role.
- A proactive typed Telegram command (e.g. `/finalizar_partida`) — buttons-on-alert only.
- Auto-deriving the winner from penalty/extra-time scores.
- Auto re-scoring when the provider changes a winner on an already-`finished` match (the admin finalize button is the manual remedy).
- A durable alert-dedup table (in-memory dedup is the chosen default).
