# Feature Specification: Live Advance Bonus (Extra Time) + Opponent Advance Picks

**Feature Branch**: `031-knockout-live-advance-bonus`
**Created**: 2026-06-28
**Status**: Draft
**Input**: User description: "1. Se o jogo for para prorrogação e uma equipe fizer um gol na prorrogação temos que mostrar o +2 para quem apostou nessa equipe que momentaneamente está ganhando (o ajuste não serve somente para o interim entre o final do jogo e o cálculo). 2. Temos que mostrar, ao listar os placares (Ver palpites dos oponentes), qual equipe cada um dos participantes selecionou para se classificar."

## Context & Problem

Feature `023-knockout-scoring` introduced the **advance bonus**: a +2 awarded when a knockout match is settled past regular time (extra time or penalties) and the member named the advancing side. Today that bonus is applied **only at settlement** (`jobs/calcPoints.ts`), once the match is `finished` and the provider has reported the `winner`. Two gaps follow:

1. **The +2 is invisible while a match is being decided.** During extra time, the live points shown on the prediction card and in the live ranking grade only the regular-time (90') scoreline — which is always a draw for an overtime knockout — so a member who picked the team currently leading in extra time sees no reflection of the bonus they are on track to earn. The drama of extra time is exactly when this should be visible.
2. **A member cannot see which team each opponent picked to advance.** The "Ver palpites dos oponentes" (view opponents' predictions) list shows each opponent's scoreline and points, but not their advance pick — so the most interesting knockout call is hidden from the social view.

This feature makes the advance bonus **live during extra time** (provisional, following who is currently ahead), displays the bonus **separately from the scoreline points** for clarity, and **surfaces each opponent's advance pick** in the predictions list.

## Clarifications

### Session 2026-06-28

- Q: During which phases, and how, should the +2 appear live? → A: **Extra time = dynamic**, **penalties = only at the end (consolidated)**. During extra time the "provisional advancing side" is whoever is currently ahead on the **aggregate 90'+extra-time score**; the member who picked that side sees the +2 added live. It updates each sync (~1 min), switches sides if the match turns, and disappears if the aggregate is level. During a penalty shootout the +2 is **not** shown live (the shootout score swings on every kick and the sync is only ~1 min, so it would flicker) — the penalty-decided +2 appears when the match finishes, via the existing settlement path. Regular time of a knockout never shows the +2 (the match may still end in 90').
- Q: How should the bonus be displayed? → A: **Separate from the scoreline points**, e.g. `+5 +2` (correct non-exact draw + provisional leader), `+0 +2` (wrong scoreline but correct leader), `+10 +2` (exact draw + leader). The decomposition is clearer than collapsing into a single `+7`. The summed total still drives ranking/ordering; only the display is decomposed. Applies both **live (extra time)** and at the **final result**, on the member's own card and in the opponents list.
- Q: Should the live ranking reflect the provisional +2? → A: **Yes** — otherwise the card and the live ranking would disagree for the same overtime match.
- Q: How should an opponent's advance pick be shown? → A: A compact **chip with the team flag (crest) + short label**, between the scoreline and the points, only on knockout matches.
- Q: Where does the provisional-leader rule live? → A: In the **domain**, reusing the existing `AdvanceBonus` rule and `KnockoutContext` so the +2 is single-sourced (one helper, one constant) per the architecture guardrails (G2/G3).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The +2 appears live while extra time is being played (Priority: P1)

As a pool member watching a knockout match in extra time, I want my +2 advance bonus to show up live the moment the team I picked goes ahead, decomposed from my scoreline points (`+5 +2`), so I can feel the bonus I'm earning as the drama unfolds — not only after the final whistle.

**Why this priority**: This is the headline request and the engagement payoff. It makes the most dramatic phase of a knockout immediately rewarding on screen.

**Independent Test**: Put a knockout match into extra time live (90' draw 1–1, extra-time goal makes the aggregate 2–1 to the home side). Confirm a member who picked the home side to advance sees their scoreline points plus a live `+2`, the live ranking reflects it, and a member who picked the away side does not.

**Acceptance Scenarios**:

1. **Given** a knockout match live in extra time, level 1–1 at 90' and 2–1 on aggregate (home scored in ET), **When** the member who predicted 1–1 and picked **home** views their card, **Then** it shows `+10 +2` (exact 90' draw + provisional leader), and the live ranking counts 12 for that match.
2. **Given** the same match, **When** a member who predicted 0–0 and picked **home** views their card, **Then** it shows `+5 +2` (correct non-exact draw + leader).
3. **Given** the same match, **When** a member who predicted 2–1 (a home win) and picked **home** views their card, **Then** it shows `+0 +2` (wrong scoreline, correct leader).
4. **Given** the same match, **When** a member who picked **away** views their card, **Then** no +2 is shown (only the scoreline points).
5. **Given** the match is level again on aggregate during extra time (away equalizes, 2–2), **When** any card is viewed, **Then** no +2 is shown to anyone (no provisional leader).
6. **Given** the match turns in extra time (away leads 3–2 on aggregate), **When** cards are viewed, **Then** the +2 moves to members who picked **away**, and is removed from those who picked **home**.
7. **Given** a knockout match live **in a penalty shootout** (level after extra time), **When** any card is viewed, **Then** no provisional +2 is shown (penalties resolve only at the end).
8. **Given** a knockout match **finished** and decided on penalties, **When** points settle, **Then** the +2 is awarded to members who picked the advancing side exactly as today (no regression), and the card/list show the decomposed `+X +2` at the final result.
9. **Given** a knockout match still in **regulation time** (no extra time yet), **When** cards are viewed, **Then** no +2 is shown regardless of who is leading (the match may still end in 90').
10. **Given** a non-knockout (group/league) match live, **When** cards are viewed, **Then** behavior is unchanged (no advance bonus concept).

---

### User Story 2 - Each opponent's advance pick is visible in the predictions list (Priority: P2)

As a pool member viewing opponents' predictions for a locked knockout match, I want to see which team each opponent picked to advance, shown as a flag chip next to their scoreline, so I can compare reads on who goes through.

**Why this priority**: A self-contained social/visibility improvement. Independent of Story 1's live math, though both touch the same opponents-list surface.

**Independent Test**: On a locked knockout match where opponents picked different sides, open "Ver palpites dos oponentes" and confirm each predictor row shows a chip with the picked team's flag and short label; an opponent who made no pick shows no chip; on a group-stage match no chips appear.

**Acceptance Scenarios**:

1. **Given** a locked knockout match with opponents who set advance picks, **When** the member opens the opponents list, **Then** each predictor row shows a chip (team flag + short label) for the side that opponent picked to advance.
2. **Given** an opponent who predicted a scoreline but set **no** advance pick, **When** the list is shown, **Then** that row shows **no** chip.
3. **Given** a group-stage (non-knockout) match, **When** the opponents list is shown, **Then** **no** advance-pick chips appear for any row.
4. **Given** any opponent row, **When** the match is in extra time live, **Then** the row's points also follow the decomposed `+X +2` rule from Story 1.

### Edge Cases

- **Aggregate level during extra time** → no provisional leader, no +2 (covered by 1.5).
- **Provider lag**: `duration` flips to `extra_time` and the extra-time sub-scores populate on the next ~1-min sync; the live +2 follows that cadence (eventual, not instant) — acceptable and expected.
- **Extra time with no goals** (still level) → no provisional +2; if it then goes to penalties, still no live +2 (penalties at the end).
- **Single-match pools**: the scoreline part already includes the proximity bonus (`category + proximity`); the `+X +2` decomposition uses that combined scoreline part as `X` and the advance bonus as the `+2` (e.g. `+9 +2`).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: During a knockout match that is **live in extra time**, the system MUST compute a **provisional advancing side** = the side ahead on the **aggregate regular-time + extra-time score**; if the aggregate is level, there is **no** provisional advancing side.
- **FR-002**: When a provisional advancing side exists and a member's advance pick equals it, the system MUST add the **+2** to that member's **live** points for the match (same constant and rule as the settled bonus).
- **FR-003**: The system MUST NOT show a provisional +2 during a **live penalty shootout**, during **regulation time**, or for **non-knockout** matches.
- **FR-004**: At settlement (match `finished`), the advance bonus MUST continue to be awarded exactly as today (no regression), including penalty-decided matches.
- **FR-005**: The **live ranking** MUST include the provisional +2 (FR-002) so it agrees with the prediction card.
- **FR-006**: Points that include an advance bonus MUST be **displayed decomposed** as `+{scoreline} +{advance}` (e.g. `+5 +2`, `+0 +2`, `+10 +2`), both live and at the final result, on the member's own card and in the opponents list. When the advance bonus is 0, points are shown as a single value as today.
- **FR-007**: The summed total (scoreline + advance) MUST remain the value used for ranking, ordering, and storage; only the on-screen presentation is decomposed.
- **FR-008**: The opponents-predictions response MUST include each predictor's **advance pick** (home/away/null) and enough of the bonus breakdown (advance-bonus portion) to render FR-006 for range pools as well as single-match pools.
- **FR-009**: The opponents-predictions list MUST render, for **knockout** matches only, a **flag-chip** of the team each opponent picked to advance; rows with no pick render no chip; non-knockout matches render no chips.
- **FR-010**: The provisional-leader rule MUST live in the **domain** and reuse the existing advance-bonus rule/constant (no second copy of the +2 logic), satisfying guardrails G2/G3.

### Key Entities / Domain

- **Provisional advancing side** (new pure domain function, e.g. `liveAdvancingSide` in `domain/match/KnockoutResult.ts`): given `{ status, duration, regHome, regAway, extraHome, extraAway }`, returns `'home' | 'away' | null`. Non-null only when `status='live'` and `duration='extra_time'` and the aggregate is not level.
- **KnockoutContext** (existing): reused unchanged in shape. For the live case it is built with the provisional advancing side; `AdvanceBonus.apply` is the single seam that adds the +2. (Implementation note: the context flag currently named `decidedInOvertime` may be renamed to a phase-neutral name like `pastRegularTime` to read correctly for both live and settled cases — a rename, not a new rule.)
- **LiveBreakdown** (existing, in `computeLivePoints`): extended with an `advanceBonus` field so the UI can render the decomposition.
- **MatchPredictor** (shared type): extended with `advancePick` and the `advanceBonus` portion.

## Changes by Layer *(guidance for planning)*

- **Domain** (`domain/match/KnockoutResult.ts`): add `liveAdvancingSide(...)`; reuse `AdvanceBonus`/`KnockoutContext`/`SCORING.ADVANCE_BONUS`.
- **Application**:
  - `application/prediction/computeLivePoints.ts`: accept `duration/extraTime + advancePick`; build the live `KnockoutContext`; include `advanceBonus` in `LiveBreakdown`.
  - `services/ranking.ts` (`computeLivePointsByUser`): select `duration`, extra-time sub-scores and each prediction's `advancePick`; apply the same context.
  - `application/prediction/GetMatchPredictionsUseCase.ts` and `GetUserPredictionsUseCase.ts`: thread the new live data; expose the `advanceBonus` portion for **range** pools too (today only single-match) and include `advancePick` per predictor (Story 2).
- **Shared** (`packages/shared/src/types`): add `advancePick` to `MatchPredictor`; add `advanceBonus` to the live-breakdown type.
- **Frontend**:
  - `components/prediction/ScoreInput.tsx`: render `+{scoreline} +{2}` when the advance bonus is present (keep the `?` breakdown panel).
  - `components/prediction/MatchPredictionsList.tsx`: receive `homeTeam/awayTeam/homeFlag/awayFlag`; render the advance-pick chip and the decomposed points.
  - `routes/pools/$poolId/predictions.tsx`: pass team names/flags into the opponents accordion.

## Testing *(mandatory)*

- **Domain**: `liveAdvancingSide` — extra-time leader (home/away), level aggregate → null, turn-around, penalty-shootout-live → null, regulation/null → null, non-live → null.
- **Application**: live +2 present during extra time and absent during a live shootout; live ranking includes the provisional +2; `advancePick` and `advanceBonus` exposed for range and single-match pools; settlement path unchanged (regression).
- **Frontend**: card renders `+X +2` live and at the final result; opponents list renders the chip (and omits it for no-pick / non-knockout rows).

## Out of Scope

- Changing the scoreline grading rule (still regular-time only) or the 10/8/7/5/0 scale.
- Live +2 during penalty shootouts (explicitly deferred to settlement per the clarification).
- Backfilling or recomputing already-settled matches.
- Any new provider call or schema change — all required fields (`duration`, extra-time/penalty sub-scores, `advance_pick`) already exist and are already synced.
