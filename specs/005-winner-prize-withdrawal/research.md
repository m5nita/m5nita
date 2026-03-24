# Research: 005-winner-prize-withdrawal

**Date**: 2026-03-22

## R1: Pool Finalization Strategy

**Decision**: Pool finalization is a manual action by the pool owner, allowed only when all matches in the system have status `finished`.

**Rationale**: Matches are global (World Cup matches shared across all pools). The owner must explicitly finalize to signal that the pool is complete and prizes can be claimed. This prevents premature finalization and gives the owner control.

**Alternatives considered**:
- Automatic finalization when all matches finish: rejected because it removes owner control and could surprise users.
- Per-pool match sets: rejected because the current data model treats matches as global; adding per-pool match lists adds unnecessary complexity for a single-tournament app.

## R2: Prize Distribution for Ties

**Decision**: When multiple users tie for 1st place (same totalPoints and exactMatches), the prize is divided equally among them. Each tied winner can independently request their share.

**Rationale**: User chose this approach (Option A). It's fair, simple to implement, and doesn't require additional tiebreaker logic.

**Alternatives considered**:
- Additional tiebreakers (e.g., first to reach the score): adds complexity with little value.
- Winner takes all with arbitrary selection: unfair.

## R3: Prize Payout Method

**Decision**: PIX key collection with manual payout by platform admin. Payment record of type `prize` is created with status `pending`. Admin processes the transfer externally and updates status to `completed`.

**Rationale**: Automated PIX transfers require PSP integration (e.g., Stripe doesn't support PIX payouts natively in Brazil). Manual processing is appropriate for MVP scale. The payment record tracks the lifecycle.

**Alternatives considered**:
- Stripe Connect payouts: not available for PIX in Brazil.
- Automated bank transfer API (e.g., via Pix API from a bank): too complex for initial version, planned as future evolution.

## R4: PIX Key Validation

**Decision**: Validate PIX key format on the client and server side. Supported formats:
- CPF: 11 digits
- Email: standard email format
- Phone: +55 followed by 10-11 digits
- Random key (EVP): UUID format (32 hex chars with dashes)

**Rationale**: Format validation catches typos before submission. Actual key validity can only be confirmed during the real PIX transfer (done manually by admin).

**Alternatives considered**:
- No validation: poor UX, increases admin errors.
- Real-time PIX key lookup via DICT API: requires banking integration, out of scope.

## R5: Blocking Pool Cancellation

**Decision**: Extend the existing cancel check. Currently, cancellation is blocked if a `prize` payment with status `completed` exists. We also block if any `prize` payment exists (any status), meaning once a winner requests withdrawal, the pool cannot be cancelled.

**Rationale**: The existing code checks `payment.type === 'prize' && payment.status === 'completed'`. We need to broaden this to any prize payment (including `pending`) to prevent the race condition where a prize is requested but not yet processed and the owner tries to cancel.

**Alternatives considered**:
- Only block on completed prize payments: creates a window where cancellation could void a pending prize request.

## R6: Winner Notification via Telegram

**Decision**: Reuse the existing `findChatIdByPhone` + `bot.api.sendMessage` pattern from the reminder job. When a pool is finalized, look up each winner's Telegram chatId and send a congratulatory message with prize amount.

**Rationale**: The notification infrastructure already exists. Follows the established pattern.

**Alternatives considered**:
- Push notifications: no PWA push notification infrastructure exists yet.
- Email: no email system exists in the project.

## R7: Match Completion Check

**Decision**: To verify all matches are finished, query the `match` table for any match with `status !== 'finished'`. If any non-finished match exists, block finalization.

**Rationale**: Simple query that covers all edge cases (scheduled, live, postponed, cancelled). Only `finished` status indicates a completed match with a final score.

**Alternatives considered**:
- Check only for `scheduled` or `live`: misses `postponed` matches that haven't been played yet.
