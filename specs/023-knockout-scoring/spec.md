# Feature Specification: Knockout Scoring (Extra Time & Penalties) + New Global Scoring Scale

**Feature Branch**: `023-knockout-scoring`  
**Created**: 2026-06-05  
**Status**: Draft  
**Input**: User description: "Pontuação de jogos de mata-mata (prorrogação + pênaltis) e nova escala de pontos global."

## Context & Problem

The pool grades each member's scoreline prediction against the real match result. Today scoring knows nothing about knockout (elimination) matches: it has no concept of extra time or penalty shootouts, and it grades every match on a single home/away scoreline taken from the match-data source.

This causes two problems for elimination rounds (e.g., the World Cup knockout stage):

1. **Corrupted scoreline for shootout matches.** When a knockout match is decided on penalties, the upstream match-data source can report a scoreline that *adds the shootout goals into the match score* (for example, a 1–1 game decided 6–5 on penalties is reported as 7–6). The pool stores and grades against this inflated number, so members who correctly predicted the real 1–1 are marked wrong, and the displayed score is wrong.
2. **No way to reward calling who advances.** Two members who both nail the exact 90-minute draw of an overtime match tie on points, with no way to reward the one who also called the team that went through.

This feature grades the scoreline on the **regular-time (90-minute)** result, lets members predict who advances when a knockout goes past regular time (extra time or penalties), and refines the points scale used for every match.

## Clarifications

### Session 2026-06-05

- Q: How does the system know a match is "knockout" (subject to extra time/penalties) so it shows the advance pick and can award the +2 bonus? → A: By the match **stage** already provided by the data source and stored at fixture time. Knockout = any stage other than group/league (round-of-32, round-of-16, quarter, semi, third-place, final). Eligibility is therefore known **before kickoff** (from stage); whether a match actually went past regular time is confirmed **after** it finishes by the decision type. No new data source field or call is needed for detection — only the result sub-scores (regulation/extra-time/penalties), winner, and decision type are newly captured.
- Q: What does the scoreline prediction grade against, and when does the advance bonus apply? → A: **Flow change** — the scoreline prediction grades **only against the regular-time (90-minute) score**; extra-time and shootout goals never count toward the scoreline. The +2 advance bonus applies whenever the match is **settled past regular time — in extra time OR a penalty shootout** — and the member named the advancing side. (Implication: a knockout only goes past regular time when it is level after 90 minutes, so the graded 90-minute scoreline of any such match is always a draw; the advance bonus is therefore the only reward for naming the winner, with no double-counting.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Knockout matches are scored on the regular-time scoreline and show who advanced (Priority: P1)

As a pool member, when a knockout match goes to extra time or penalties, I want my scoreline prediction graded against the **regular-time (90-minute) score** — extra-time and shootout goals never counting toward the scoreline — and I want the result to clearly show which team advanced and how (extra time or penalties) — so that a correct 90-minute prediction is never marked wrong and I can see what really happened.

**Why this priority**: This is a correctness fix. Without it, every shootout-decided match in a knockout tournament is scored against a corrupted number and members lose points they earned. It is the minimum needed for the World Cup knockout stage to be scored fairly.

**Independent Test**: Settle a knockout match that was 1–1 at 90 minutes and decided 5–4 on penalties, and confirm: (a) the scoreline used for points is 1–1 (the 90-minute score), not the inflated shootout-inclusive number; (b) the result display names the advancing team and how it was decided.

**Acceptance Scenarios**:

1. **Given** a knockout match that is 1–1 at 90 minutes and is decided 5–4 on penalties, **When** the match is settled, **Then** the scoreline used for scoring is 1–1 and the result is displayed as "1–1 (5–4 on penalties, <team> advances)".
2. **Given** a member who predicted 1–1 for that match, **When** points are calculated, **Then** the member is awarded the exact-score points for the 1–1 at 90 minutes (not zero).
3. **Given** a knockout match that is 0–0 at 90 minutes and decided 1–0 in extra time, **When** it is settled, **Then** the scoreline used for scoring is the 90-minute 0–0 (extra-time goals do not count), and the result shows the advancing team won in extra time.
4. **Given** a knockout match decided 1–0 in regulation time, **When** it is settled, **Then** it is scored exactly as a normal match on the 1–0 result and the advance pick has no effect.

---

### User Story 2 - Members predict who advances (extra time or penalties) and earn a bonus for calling it (Priority: P2)

As a pool member, on any knockout match I want to choose which team I think advances if the match goes past regular time — in extra time or penalties — regardless of the scoreline I predicted, and earn a small bonus if I call it correctly, so that reading a tight knockout right is rewarded and the most dramatic moments matter.

**Why this priority**: This is the engagement payoff of the feature and the differentiator that breaks ties between members who predicted the same 90-minute draw. It depends on Story 1 (the system must know the real advancing team) but is a separable slice.

**Independent Test**: On a knockout match, submit two predictions with identical scorelines (1–1) but different "advances" picks; settle the match past regular time (extra time or penalties) won by one side; confirm the member who picked the actual winner scores exactly 2 points more than the other.

**Acceptance Scenarios**:

1. **Given** any knockout match (one that *can* go past regular time, known from its stage before kickoff), **When** a member opens their prediction **before kickoff**, **Then** the "who advances" pick is shown (home or away), independent of the scoreline — regardless of whether the match will actually go to extra time or penalties.
2. **Given** a member who set an advance pick, **When** the match kicks off, **Then** the pick locks exactly like the scoreline and can no longer be changed.
3. **Given** a member who predicted 1–1 and picked Team A to advance, **When** the match is 1–1 at 90 minutes and Team A advances (in extra time or on penalties), **Then** the member receives the scoreline points plus a +2 bonus.
4. **Given** a member who predicted 1–1 and picked Team B to advance, **When** the match is 1–1 at 90 minutes and Team A advances, **Then** the member receives only the scoreline points (no bonus).
5. **Given** a member who predicted a 2–1 win and picked Team A to advance, **When** the match is 1–1 at 90 minutes and Team A advances past regular time, **Then** the member receives 0 scoreline points (predicted a winner; the 90-minute result was a draw) plus the +2 bonus, for 2 points total.
6. **Given** a knockout match decided in regulation time (no extra time or penalties), **When** points are calculated, **Then** the "advances" pick is ignored and does not change any member's points.

---

### User Story 3 - Refined scoring scale rewards near-misses on every match (Priority: P3)

As a pool member, I want the points scale to recognize how close my prediction was — distinguishing "exact score", "right winner and the winner's goal count", "right winner and goal margin", and "right result" — so that better predictions earn more across every match in the pool.

**Why this priority**: This is a global enhancement to fairness and engagement, valuable on its own and independent of the knockout work, but not required to fix the correctness problem.

**Independent Test**: For a match that finishes 2–0, submit predictions of 2–0, 2–1, 3–1, 1–0, and 0–0 and confirm they score 10, 8, 7, 5, and 0 respectively.

**Acceptance Scenarios**:

1. **Given** a match that finishes 2–0, **When** points are calculated, **Then** a prediction of 2–0 scores 10, 2–1 scores 8, 3–1 scores 7, 1–0 scores 5, and 0–0 scores 0.
2. **Given** a match that finishes 1–1, **When** points are calculated, **Then** a prediction of 1–1 scores 10, any other draw (0–0, 2–2) scores 5, and any non-draw scores 0.
3. **Given** matches that were already finished and scored before this feature shipped, **When** the feature is released, **Then** their stored points are unchanged (the new scale applies only to matches settled afterward).

---

### Edge Cases

- **Predicted a decisive 90-minute score, match went past regular time**: The 90-minute result of any match that goes past regular time is a draw, so a member who predicted a winner scores 0 on the scoreline, but can still earn the +2 advance bonus if their advance pick was correct (see Story 2, scenario 5).
- **No advance pick made**: If a member submits a scoreline but never picks who advances, they simply cannot earn the +2 bonus; nothing else changes.
- **Advance bonus only when the match leaves regular time**: A correct advance pick earns nothing if the match is decided in regulation time — the bonus exists only to reward naming who got through in extra time or penalties. Because the 90-minute result of any overtime match is a draw, the scoreline never also rewards the winner, so there is no double-counting.
- **Non-knockout matches**: Group and league matches never offer an "advances" pick and are unaffected except by the new scoring scale.
- **Two-legged ties**: Each leg is a separate match, scored on that leg's own 90-minute result; only a leg that itself goes past regular time exposes the advance bonus. There is no aggregate scoring.
- **Live, not-yet-final knockout match**: While a knockout match is in progress, provisional points are shown on the running score; the final settled points may differ (e.g., a live 1–1 that later goes to extra time or penalties). The settled result is authoritative.
- **Missing provider sub-scores**: If the data source has not yet supplied the separated regulation/extra-time/penalty figures for a finished knockout match, the match is treated as not-yet-settled rather than scored on an ambiguous figure.

## Requirements *(mandatory)*

### Functional Requirements

#### Scoring scale (all matches)

- **FR-001**: The system MUST award scoreline points on a five-tier scale, evaluated in this order: exact score → correct winner and the winner's exact goal count → correct winner and correct goal difference → correct result (right winner, or correctly predicting a draw) → wrong result, worth **10 / 8 / 7 / 5 / 0** respectively.
- **FR-002**: For a drawn result, only exact score (10), correct-draw (5), and wrong result (0) are achievable; the "winner's goals" and "goal difference" tiers MUST NOT apply to draws.
- **FR-003**: The scoring scale MUST apply to every match type (group, league, and knockout).
- **FR-004**: The scoring scale MUST apply only to matches settled after this feature is released; matches already finished and scored MUST NOT be recomputed or have their stored points changed.

#### Knockout result (correctness & display)

- **FR-005**: For scoring purposes, a match's scoreline MUST be its **regular-time (90-minute) score** only. Extra-time and penalty-shootout goals MUST NOT count toward the graded scoreline. (For a match that never leaves regular time, this is simply its final score.)
- **FR-006**: The system MUST NOT use any data-source value that merges extra-time or penalty-shootout goals into the graded scoreline.
- **FR-007**: For each match the system MUST capture and retain: the regulation score, the extra-time score, the penalty-shootout score, the advancing/winning team, and how the match was decided (regulation, extra time, or penalty shootout).
- **FR-008**: When a match is settled past regular time, the result display MUST show the advancing team and how it was decided — extra time or penalties, with the shootout score when applicable (e.g., "1–1 (5–4 on penalties, <team> advances)" or "0–0 (1–0 in extra time, <team> advances)").

#### Knockout detection

- **FR-015**: The system MUST classify a match as "knockout" (eligible for an advance pick and the +2 bonus) by its stage, known before kickoff: any stage other than group or league. Detection MUST NOT require waiting for the match result.

#### Advance prediction & bonus

- **FR-009**: For every knockout match — i.e., any match that *can* go past regular time, detected from its stage **before kickoff** (FR-015) — each prediction MUST display the "who advances" pick (home or away), independent of the predicted scoreline. The pick is shown and made **before the match**; it MUST NOT be gated on the match actually reaching extra time or penalties (the member predicts it in advance, exactly like the scoreline).
- **FR-010**: The advance pick MUST be optional and editable up to kickoff, then **locked at kickoff exactly like the scoreline** — once the match starts it cannot be changed. It is part of the pre-match prediction, never entered during or after extra time/penalties.
- **FR-011**: The system MUST add a **+2** bonus to a member's scoreline points **only when** the match is settled **past regular time — in extra time or penalties** — **and** the member's advance pick equals the advancing team.
- **FR-012**: When a knockout match is decided in regulation time, the advance pick MUST NOT affect any member's points.
- **FR-013**: A knockout match settled past regular time MAY therefore award a member more than the normal per-match maximum; this is intended and accepted, because the advance pick is available on every prediction for that match.
- **FR-014**: Group and league matches MUST NOT offer an advance pick and MUST NOT be affected by the advance bonus.

### Key Entities

- **Match Result**: The settled outcome of a match. Now distinguishes the regulation score, the extra-time score, and the penalty-shootout score; records the advancing/winning team and how the match was decided (regulation / extra time / penalty shootout). The scoreline used for grading is the **regulation (90-minute) score**, never including extra-time or shootout goals.
- **Prediction**: A member's forecast for a match. Carries the predicted home/away scoreline and, for knockout matches, an optional "advancing team" pick used only to evaluate the advance bonus.
- **Score (points breakdown)**: The points a prediction earns — the scoreline points from the five-tier scale, plus, for knockout matches settled past regular time, the +2 advance bonus when the advance pick was correct.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For 100% of matches settled past regular time, the scoreline used for scoring and shown to members equals the regulation (90-minute) score (zero matches scored on an extra-time- or shootout-inflated figure).
- **SC-002**: For 100% of matches settled past regular time, members can see which team advanced and how (extra time or penalties) in the result display.
- **SC-003**: On a knockout match settled past regular time, two members with the same exact 90-minute-draw prediction differ by exactly 2 points based on their advance pick (the one who named the actual winner scores 2 more).
- **SC-004**: For a match finishing 2–0, representative predictions of 2–0 / 2–1 / 3–1 / 1–0 / 0–0 yield 10 / 8 / 7 / 5 / 0 points respectively.
- **SC-005**: Zero matches that were already finished and scored before release have their stored points changed by this feature.
- **SC-006**: Members can submit or change an advance pick on any open knockout match before its kickoff, with the same success rate as submitting a scoreline.

## Assumptions

- The match-data source provides, for finished matches, the separated regulation score, extra-time score, penalty-shootout score, the winner/advancing team, and the decision type (regulation / extra time / penalty shootout). (Confirmed available from the current provider.)
- The match-data source provides the match **stage** at fixture time (before kickoff); the system already stores it. Knockout eligibility is derived from stage (∉ {group, league}) and needs no new data, call, or waiting for the result.
- Knowing a match is knockout means it is *eligible* to go past regular time, not that it *will*; whether it actually did (extra time or penalties) is confirmed only by the post-match decision type, which gates the +2 bonus.
- "Advancing team" for a knockout match equals the match winner as reported by the data source.
- A single-leg knockout goes past regular time only when it is level at 90 minutes, so the graded 90-minute scoreline of any such match is a draw. The advance bonus is therefore the sole reward for naming the winner of an overtime match, with no double-counting against the scoreline.
- Two-legged ties are handled as separate matches (existing behavior); each leg is scored on its own result, and only a leg that itself goes to a shootout can expose the advance bonus. Aggregate-tie advancement is out of scope.
- The advance pick is a binary choice between the two teams in the fixture (home or away); there is no "draw" option, since a knockout always has a winner.

## Out of Scope

- Recomputing or backfilling points for matches settled before release.
- Changing the prediction deadline (remains kickoff).
- Changing the pre-creation fee/prize preview or any monetary calculation.
- Aggregate scoring across both legs of a two-legged tie.
- Predicting the penalty-shootout score itself (only "who advances" is predicted).
