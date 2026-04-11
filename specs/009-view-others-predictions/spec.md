# Feature Specification: View Other Participants' Predictions on Locked Matches

**Feature Branch**: `009-view-others-predictions`
**Created**: 2026-04-11
**Status**: Draft
**Input**: User description: "quero criar uma forma de visualizar os palpites dos outros participantes do bolão para os jogos já bloqueados (já iniciados/finalizados)"

## Clarifications

### Session 2026-04-11

- Q: How should participants who didn't submit a prediction appear in the list? → A: Hidden behind a toggle — by default only predictors are listed; a "N members didn't predict" control expands to reveal the rest.
- Q: How should others' predictions be surfaced on the palpites page without cluttering it? → A: Inline accordion — each locked match row on the existing palpites page is expandable; tapping it reveals the predictions list in place, collapsible back.
- Q: How should the viewing user's own prediction appear within the list? → A: Not shown in the list — the viewer's own prediction is already visible on the match row above the expanded list, so the list contains only other participants to avoid duplication.
- Q: How should each row in the predictions list be visually structured? → A: Variant A ("ranked list"), adapted to the app's existing visual language — one participant per row, structured as `participant name · score boxes · points`. No avatars, no rank badges, no lock icons, no new ornamental elements; the list strictly reuses the fonts, colors, and score-box styling already used by the existing match row, so the accordion feels native.

## User Scenarios & Testing

### User Story 1 - View all participants' predictions for a locked match (Priority: P1)

As a pool participant, I want to see what every other participant predicted for a specific match after it has been locked — directly on the palpites page, by expanding the locked match row in place — so I can compare my guess against theirs, understand how the group is betting, and feel more engaged with the competition during and after the match.

**Why this priority**: This is the core value of the feature. Without it, there is nothing to deliver. Comparing predictions is the single most requested social element in prediction pools and directly drives engagement during live matches and after final whistles.

**Independent Test**: On the palpites page, tap a locked match row and verify an inline section expands in place showing the list of other participants with their predicted scores. Collapsing the row returns the page to its original layout. The feature can ship with just this capability and provide value immediately.

**Acceptance Scenarios**:

1. **Given** a match whose lock time has passed, **When** a participant taps the locked match row on the palpites page, **Then** the row expands inline to show a list of other pool participants with the score each one predicted (the viewer's own prediction is not repeated in this list because it is already shown on the row itself).
2. **Given** a match that is still open for predictions, **When** a participant views the palpites page, **Then** the match row renders in its normal (editable) state with no expand control and no predictions of other members visible; the expand control only appears once the match locks.
3. **Given** a finished match with a final score, **When** a participant expands the row, **Then** each listed prediction is shown alongside the points that participant earned for that match.
4. **Given** a locked match where some pool members did not submit a prediction, **When** the list is expanded, **Then** the default view shows only the participants who predicted plus a control like "N members didn't predict" that can be expanded to reveal the non-predictors.
5. **Given** an expanded locked match row, **When** the participant collapses the row, **Then** the palpites page returns to its original layout with no residual content from the expanded list.

---

### User Story 2 - Sort and filter the predictions list (Priority: P2)

As a participant viewing others' predictions, I want to sort the list (by points earned, by participant name, by exact-score hits) so that I can quickly identify who got the best result or find a specific friend.

**Why this priority**: Enhances usability once the base list exists. Nice to have but not required for the first shippable version — a static list already delivers the core value.

**Independent Test**: With the list visible, apply each available sort option and confirm the order changes accordingly without losing any entries.

**Acceptance Scenarios**:

1. **Given** the predictions list for a finished match, **When** the user sorts by points earned descending, **Then** participants with the highest points for that match appear first.
2. **Given** the predictions list, **When** the user sorts alphabetically by name, **Then** participants are ordered from A to Z.

---

### User Story 3 - See a quick aggregate summary of the group's predictions (Priority: P3)

As a participant, I want a short summary showing how the group predicted the match (e.g., "12 of 20 picked a home win", "average predicted score: 2–1") so I can grasp group sentiment at a glance without reading every row.

**Why this priority**: A polish layer. Adds delight and context but depends entirely on the base list existing. Can be added later without blocking the MVP.

**Independent Test**: With more than one prediction on a locked match, the summary area shows at least the counts of predicted outcomes (home win / draw / away win) and matches the underlying list.

**Acceptance Scenarios**:

1. **Given** a locked match with predictions from multiple participants, **When** the user opens the match, **Then** a summary area shows counts of predicted outcomes and an average predicted score.
2. **Given** a match where every participant predicted the same outcome, **When** the summary is displayed, **Then** it clearly reflects the unanimous choice.

---

### Edge Cases

- What happens when a match is locked but zero participants submitted a prediction? The list renders an empty state explaining no one predicted this match.
- What happens when a match is postponed or cancelled after being locked? Predictions already locked remain visible; the match status is shown alongside.
- What happens when a new participant joins the pool after matches have already been locked? They can see others' predictions for those past matches but appear in their own row as "no prediction submitted" for matches that pre-date their joining.
- What happens for a match in the "locked but not yet kicked off" window (locked 10 minutes before kickoff)? Predictions are revealed as soon as the match is locked, not only after kickoff, so the user immediately sees the full list.
- What happens when points for a finished match have not yet been computed (scoring pipeline delay)? Predictions are shown; the points-earned column shows "pending" until scoring runs.
- What happens in multi-competition pools where a single participant plays across competitions? The view always scopes the predictions list to the competition the match belongs to.

## Requirements

### Functional Requirements

- **FR-001**: System MUST allow any pool participant to view the list of predictions submitted by other participants of the same pool for a given match, but only once that match is locked. The list MUST be reachable by expanding the locked match row inline on the existing palpites page (no separate screen, modal, or navigation step).
- **FR-002**: System MUST NOT expose any participant's prediction for a match while that match is still open for predictions (i.e., before lock time); rows for unlocked matches MUST NOT be expandable.
- **FR-003**: System MUST display, for each listed prediction, the participant's display name, the predicted score, and — when the match is finished and scored — the points that prediction earned. The viewing participant's own prediction MUST NOT be repeated inside this list, because it is already shown on the match row itself.
- **FR-003a**: The predictions list MUST render each row with the layout `name · score · points` and MUST reuse the existing visual language of the palpites page (same fonts, same uppercase team-name treatment, same score-box style in its locked/muted state, same `+N pts` styling in green or muted). No new ornamental UI — avatars, rank badges, lock icons, badges, or decorative elements — is introduced by this feature.
- **FR-003b**: The expand/collapse control MUST live inside the existing match row area using the same meta text style already used for match status (e.g., a small uppercase control such as "Ver palpites do bolão ▾" / "Ocultar palpites do bolão ▴"), so it reads as part of the existing row and not as a new component.
- **FR-010**: System MUST allow the user to collapse an expanded locked match row so the palpites page returns to its original layout.
- **FR-004**: System MUST, by default, show only participants who submitted a prediction for the locked match, and MUST also surface a count of members who did not predict along with a control (e.g., toggle or "show more") that reveals those non-predictors on demand.
- **FR-005**: System MUST scope the visible predictions strictly to the pool (and competition, in multi-competition pools) the viewing participant belongs to; predictions from other pools MUST NOT be visible.
- **FR-006**: System MUST keep the predictions list accessible indefinitely after the match ends, so participants can revisit historical matches and review past predictions.
- **FR-007**: System MUST sort the predictions list by `points DESC NULLS LAST, name ASC` as a stable default order. For finished matches, this ranks highest scorers first; for locked-but-not-yet-scored matches, `points` is uniformly `null` and the list naturally falls back to alphabetical by name via the NULLS LAST tiebreaker. No status-dependent branching is required.
- **FR-008**: System MUST NOT render the expand control or any hint of other participants' predictions on rows for unlocked matches. The unlocked match row stays visually identical to its current state (editable score inputs). The expand affordance only appears once the lock predicate is satisfied, at which point its presence is itself the signal that others' predictions are now viewable.
- **FR-009**: System MUST reflect administrative corrections to scoring (recomputed points) in the predictions list without requiring the user to reload manually more than once.

### Key Entities

- **Match**: A game belonging to a competition, with a scheduled start time, a lock time, a status (open, locked, live, finished, cancelled), and — when finished — a final score.
- **Prediction**: A participant's predicted score for a specific match, submitted before lock time. After the match is scored, it also carries the points earned.
- **Pool Participant**: A user enrolled in a specific pool (and competition), whose identity is shown alongside their prediction via a display name.
- **Pool**: The grouping that scopes which participants' predictions are visible to one another. A participant only ever sees predictions from participants of the same pool.

## Success Criteria

### Measurable Outcomes

- **SC-001**: After a match locks, any pool participant can reveal the predictions list for that match with a single tap on the match row from the palpites page (no navigation away from the page).
- **SC-002**: Zero predictions are exposed for any match before its lock time, verified across all pools and competitions.
- **SC-003**: At least 60% of active pool participants open the "other participants' predictions" view for at least one match per round within the first two rounds after launch, demonstrating the feature is discoverable and desirable.
- **SC-004**: Support tickets and in-app feedback containing phrases like "can't see others' predictions" drop to near zero within one round after launch.
- **SC-005**: The predictions list for a typical match (up to 200 participants) is fully visible to the user within 2 seconds of opening the match details on a standard mobile connection.

## Assumptions

- "Locked" means the moment predictions can no longer be edited for a match, which in this product happens at the match's scheduled kick-off time. Revealing predictions at lock time (not only at final whistle) is the desired behavior.
- Participants are identified by their existing pool display name; no new privacy controls, aliases, or opt-outs are introduced in this feature. Every participant implicitly consents to having their locked predictions visible to other members of the same pool by joining the pool.
- The feature is read-only: no comments, reactions, or other social interactions are added in this iteration.
- Points-earned values shown in the list reuse the existing scoring rules; this feature does not change how points are calculated.
- The view is available on the same surfaces where match details already exist. No new platform or channel is introduced.
- Multi-competition pools already scope matches and participants correctly; this feature inherits that scoping and does not redefine it.
