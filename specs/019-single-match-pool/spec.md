# Feature Specification: Single-Match Pool Creation

**Feature Branch**: `019-single-match-pool`
**Created**: 2026-05-22
**Status**: Draft
**Input**: User description: "quero conseguir criar bolão de somente um jogo de uma rodada/fase (seja esse jogo de uma competição do tipo league ou cup)"

## Clarifications

### Session 2026-05-22

- Q: How should ties be broken among members with identical scores in a single-match pool? → A: Split the prize pot equally among all tied top scorers (no extra input from members).
- Q: How should the pool resolve if the chosen match is cancelled/annulled by the data provider? → A: Apply the same behavior already used today when a match inside a multi-match pool is cancelled — no special-case logic for single-match scope.
- Q: What minimum-members rule applies at kickoff for a single-match pool? → A: The same rule already applied to multi-match pools today — no special-case behavior for single-match scope.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a pool tied to a single match (Priority: P1)

A user wants to run a pool focused on one specific match — for example "Real Madrid vs Barcelona on matchday 35" of La Liga, or "Brazil vs Argentina in the semifinal" of a cup. When creating a pool, in addition to picking a whole matchday range (existing behavior), the user can narrow the scope down to a single fixture. Once created, the pool only accepts predictions for that one match, and scoring/leaderboard are computed from that single result.

**Why this priority**: This is the entire feature. Without single-match scope, the user cannot run focused, short-lived pools around marquee fixtures, which is the explicit ask.

**Independent Test**: A user creates a pool, selects a competition, selects a single upcoming match (from either a league round or a cup phase), invites two other users, all three submit predictions for that match, the match finishes, and the leaderboard reflects scores based only on that match.

**Acceptance Scenarios**:

1. **Given** an active league competition with upcoming matches in matchday 35, **When** the owner opens the pool creation flow and chooses "single match" scope and picks the Real Madrid vs Barcelona fixture, **Then** the pool is created and is associated with exactly that match.
2. **Given** an active cup competition with upcoming matches in the "Semi-final" stage, **When** the owner picks a single fixture from that stage, **Then** the pool is created and associated with exactly that match regardless of stage label.
3. **Given** a single-match pool, **When** a member views the pool, **Then** only the chosen match is shown for prediction and only that match contributes to scoring.
4. **Given** a single-match pool whose match has already kicked off, **When** any user (member or owner) attempts to submit or change a prediction for it, **Then** the system rejects the change with the same kickoff-lock rule used by multi-match pools.
5. **Given** the chosen match has finished, **When** results are synced, **Then** all members' scores for the pool are computed only from that single match and the leaderboard reflects the final standings.

---

### User Story 2 - Discover and pick the specific match during pool creation (Priority: P1)

The pool owner needs to find the exact fixture quickly. During creation, after picking a competition, the owner sees a list of upcoming matches grouped by matchday (for league) or by stage/phase (for cup), and selects one. Past or in-progress matches are not selectable.

**Why this priority**: A single-match pool is unusable if the owner cannot reliably locate and pick the intended match. This is part of the same MVP slice as Story 1.

**Independent Test**: Open the pool creation flow, pick a competition, confirm the match picker shows only upcoming fixtures grouped sensibly, pick one, and confirm the pool summary reflects exactly that match before submitting.

**Acceptance Scenarios**:

1. **Given** the user selected "single match" scope and a league competition, **When** the match picker loads, **Then** matches are grouped by matchday and only matches that have not yet kicked off are selectable.
2. **Given** the user selected a cup competition, **When** the match picker loads, **Then** matches are grouped by stage/phase (e.g., Round of 16, Quarter-final, Final) and only matches that have not yet kicked off are selectable.
3. **Given** the user has selected one match, **When** they review the creation summary, **Then** the chosen home team, away team, kickoff time, and competition/stage label are clearly displayed before confirming.
4. **Given** a competition with no upcoming matches, **When** the user opens the match picker, **Then** an empty-state message explains there are no matches available and the user cannot proceed with single-match scope.

---

### Edge Cases

- The owner picks a match that gets postponed or rescheduled by the data provider before kickoff — the pool stays tied to that match, predictions remain valid, and the pool's display reflects the new kickoff time.
- The owner picks a match that gets cancelled or annulled by the data provider — the pool applies the same handling already used when a match inside a multi-match pool is cancelled (no special-case logic); per FR-013, this resolves the pool with every member tied at zero and the pot split equally per FR-008.
- The owner tries to create a single-match pool for a match that has already kicked off (e.g., due to a stale picker) — creation is rejected at submission with a clear error.
- All members submit predictions and the match ends in a result that produces ties across many members — the prize pot is split equally among all members tied at the top score (see FR-008).
- A user is already a member of a separate multi-match pool that covers the same fixture — both pools operate independently; predictions are not shared.
- The competition is a cup and the picked match is a two-legged tie — the pool scores only the specific leg the owner chose, not the aggregate; the owner sees the leg label (e.g., "1st leg" / "2nd leg") in the picker when the data provider exposes it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The pool creation flow MUST let the owner choose between "whole matchday/range" scope (existing) and "single match" scope, before submission.
- **FR-002**: When "single match" scope is chosen, the owner MUST pick exactly one upcoming match from the selected competition; the system MUST NOT allow zero or more than one match to be selected.
- **FR-003**: The match picker MUST work for both league-type and cup-type competitions, grouping league matches by matchday and cup matches by stage/phase.
- **FR-004**: The match picker MUST hide or disable matches that have already kicked off or finished.
- **FR-005**: A single-match pool MUST persist the identifier of the chosen match so that the rest of the product (predictions, scoring, leaderboard, invitation page, OG image, notifications) can derive the pool's scope from it.
- **FR-006**: For a single-match pool, only the chosen match MUST be shown to members for prediction; the prediction submission flow MUST reject attempts to submit predictions for any other match in the same competition.
- **FR-007**: Scoring for a single-match pool MUST be computed exclusively from the chosen match's final result, using the same per-match scoring rules already applied to multi-match pools.
- **FR-008**: The leaderboard for a single-match pool MUST display all members ranked by their score for the chosen match. When two or more members tie for the top score, the prize pot MUST be split equally among all tied top scorers; no additional tie-break input is requested from members and no further ranking is attempted among the tied group. The pot is divided in centavos: each tied member receives `floor(potCentavos / N)`; any indivisible remainder (`potCentavos mod N`, always strictly less than N centavos) MUST be retained by the platform and reflected in the platform-fee record. This rule also covers FR-013's all-tie-at-zero outcome when the chosen match is cancelled.
- **FR-009**: The prize and entry-fee model for single-match pools MUST be the same as for multi-match pools (no new pricing rules introduced); existing coupon, refund, and cancellation behavior MUST apply unchanged.
- **FR-010**: The invitation page and shareable preview (OG image) for a single-match pool MUST display all of the following so a recipient can identify the fixture without any other context: (a) an explicit "Single match" label (Portuguese: "Jogo único"), (b) the home team name and crest, (c) the away team name and crest, (d) the competition name, (e) the round/phase label (matchday number for league, stage label for cup), and (f) the kickoff date and time in the user's local timezone.
- **FR-011**: Telegram reminders and any kickoff-based notifications MUST trigger based on the single chosen match's kickoff time.
- **FR-012**: A single-match pool MUST close to new members once its chosen match has kicked off, matching the closure rule that effectively applies to multi-match pools once predictions can no longer be made. Any minimum-members rule, including its enforcement at kickoff and the consequence when not met, MUST be the same one already applied to multi-match pools today — no special-case logic for single-match scope.
- **FR-013**: If the chosen match is postponed, the pool MUST follow the new kickoff time automatically. If the chosen match is cancelled or annulled by the data provider, the pool MUST apply exactly the same handling already used when a match inside a multi-match pool is cancelled — no special-case logic for single-match scope. Combined with FR-008, this means: the cancelled match contributes no points to any member, all members tie at the resulting score, and the prize pot is split equally among them.
- **FR-014**: An owner MUST NOT be able to change the chosen match after pool creation; correcting a mistake requires creating a new pool.

### Key Entities *(include if feature involves data)*

- **Pool (existing)**: Gains an optional association to a single specific match. The existing matchday-range fields and the new single-match association are mutually exclusive — a given pool is either a "range" pool or a "single match" pool, never both.
- **Match (existing, unchanged)**: Already exposes competition, matchday (for league), stage/phase (for cup), kickoff time, and result; single-match pools rely on these existing attributes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A pool owner can create a single-match pool — from opening the creation flow to a confirmed pool — in under 90 seconds, comparable to creating a multi-match pool today.
- **SC-002**: 100% of single-match pools created in the system reference exactly one valid, not-yet-kicked-off match at the moment of creation.
- **SC-003**: 100% of predictions accepted by a single-match pool reference its chosen match; the system rejects any prediction targeting a different match.
- **SC-004**: For finished single-match pools, the leaderboard reflects the final standings within the same freshness window as multi-match pools (no additional delay introduced by this feature).
- **SC-005**: At least 30% of pools created in the first 60 days after launch are single-match pools, indicating users discover and adopt the new scope without prompting.
- **SC-006**: Support tickets or chat reports about "I created a pool for the wrong match" stay under 2% of single-match pools created, indicating the picker and confirmation summary are clear enough.

## Assumptions

- The existing match data sync (competitions, matchdays, cup stages, kickoff times, results) is sufficient to power the match picker and scoring; no new external data is required.
- The existing per-match scoring rules and tie-break rules already used by multi-match pools are appropriate for single-match pools without modification.
- The existing entry-fee, coupon, refund, and cancellation policies apply unchanged to single-match pools; introducing different economics for one-match pools is out of scope.
- Two-legged cup ties are represented in the data provider as two separate matches; single-match pools target one leg, not the aggregate.
- Owners cannot edit a single-match pool's chosen match after creation; if they need to fix it, they create a new pool (consistent with how immutable scope works today).
