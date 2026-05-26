# Feature Specification: Single-Match Scoring (Proximity Bonus)

**Feature Branch**: `020-single-match-scoring`
**Created**: 2026-05-26
**Status**: Draft
**Input**: User description: "quando temos somente um jogo por bolão acho que os critério de pontuação deveriam ser outros"

## Problem

The current scoring (10 / 7 / 5 / 0) is designed for multi-match pools where points accumulate across many fixtures. In a **single-match pool** (feature 019), the entire ranking is decided by a single result — and 10/7/5/0 collapses dozens of distinct predictions into 4 buckets, producing frequent multi-way ties and a fragmented prize.

This spec introduces a **proximity bonus** that adds 0–4 points on top of the existing category, applied **only** to single-match pools, to discriminate finer-grained predictions while preserving the existing scoring narrative for everything else.

## Decisions

### Session 2026-05-26

- Q: Should the scoring change apply to all pools or only single-match pools? → A: Single-match pools only (`pool.match_id IS NOT NULL`). Multi-match pools keep the current 10/7/5/0 unchanged.
- Q: Cap of the proximity bonus? → A: 4 points. Maximum total per match = 14. Cap is strictly less than the gap between scoring categories (5), so the bonus never promotes a prediction into a higher category.
- Q: Tie-breaker when totals are identical? → A: Split the prize pot equally among all tied top scorers. No timestamp, no extra input.
- Q: How is distance computed when the predicted winner is inverted (e.g., real "A wins", prediction "B wins")? → A: Signed-sum formula. The column where the loser became the winner is summed instead of subtracted. See "Distance formula" below.
- Q: UI presentation? → A: Decomposed (`10 + 4 = 14`) wherever a per-prediction score is shown, so the rule is self-explanatory.

## Scoring Formula

### Components

**Category points** (unchanged from current system):

| Outcome | Points |
|---|---|
| Exact score | 10 |
| Correct winner + correct goal difference | 7 |
| Correct winner only (or draw without exact score) | 5 |
| Wrong winner | 0 |

**Proximity bonus** (new, single-match pools only):

```
distance = distance(prediction, actual)   # see "Distance formula" below
bonus    = max(0, 4 - distance)           # capped at 4
```

**Total** = `category + bonus`. Range: **0 to 14**.

### Distance formula (signed-sum)

Let:

- `pH`, `pA` = predicted home and away goals
- `rH`, `rA` = real (final) home and away goals

Determine if the winner is **inverted** — that is, the prediction picks a different winning side than the real result. Inversion only applies when both are decisive (neither is a draw) and the winning side differs.

- **No inversion** (winner correct, or either side is a draw):
  `distance = |pH − rH| + |pA − rA|`
- **Winner inverted** (e.g., real "home wins", prediction "away wins"):
  On the column corresponding to the side that flipped role (was loser, is now winner), sum instead of subtract:
  `distance = |pH − rH| + (pA + rA)` *(when away wins in prediction but home wins in reality)*
  or symmetrically:
  `distance = (pH + rH) + |pA − rA|` *(when home wins in prediction but away wins in reality)*

### Worked examples

**Real 2×1** (A wins):

| Prediction | Category | Distance | Bonus | **Total** |
|---|---|---|---|---|
| 2×1 | 10 | 0 | 4 | **14** |
| 3×2 | 7 | 2 | 2 | **9** |
| 1×0 | 7 | 2 | 2 | **9** |
| 3×1 | 5 | 1 | 3 | **8** |
| 2×0 | 5 | 1 | 3 | **8** |
| 1×1 | 0 | 1 | 3 | **3** |
| 0×0 | 0 | 3 | 1 | **1** |
| 1×2 *(inv)* | 0 | 1 + (1+2) = 4 | 0 | **0** |
| 0×3 *(inv)* | 0 | 2 + (1+3) = 6 | 0 | **0** |

**Real 0×0** (draw):

| Prediction | Category | Distance | Bonus | **Total** |
|---|---|---|---|---|
| 0×0 | 10 | 0 | 4 | **14** |
| 1×1 | 5 | 2 | 2 | **7** |
| 2×2 | 5 | 4 | 0 | **5** |
| 1×0 | 0 | 1 | 3 | **3** |
| 2×1 | 0 | 3 | 1 | **1** |

**Real 4×2** (A wins big):

| Prediction | Category | Distance | Bonus | **Total** |
|---|---|---|---|---|
| 4×2 | 10 | 0 | 4 | **14** |
| 3×1 | 7 | 2 | 2 | **9** |
| 5×3 | 7 | 2 | 2 | **9** |
| 4×1 | 5 | 1 | 3 | **8** |
| 5×2 | 5 | 1 | 3 | **8** |
| 1×0 | 5 | 5 | 0 | **5** |
| 2×4 *(inv)* | 0 | 2 + (2+4) = 8 | 0 | **0** |

### Hierarchy guarantee

Because the bonus cap (4) is strictly less than the gap between category tiers (5), the bonus can never promote a prediction past the next category. A "wrong winner" prediction always scores strictly below any "correct winner" prediction, regardless of proximity.

## Scope

### In scope

- Apply the formula above when computing points for predictions in pools where `pool.match_id IS NOT NULL` (single-match pools, feature 019).
- Show the decomposition (`category + bonus = total`) wherever a per-prediction score is displayed: leaderboard rows, prediction cards, history.
- Update tie-resolution wording in the UI to reflect that totals now have wider range (0–14) but the same "split the pot on tie" rule.

### Out of scope

- Multi-match pools (matchday-range and full-competition pools) keep the current 10/7/5/0 scoring with no bonus.
- No changes to the database schema. Bonus is computed at read-time from the stored prediction and match scores; only the existing `points` column on `prediction` is used to persist the total.
- No new user input. Predictions stay as `homeScore` + `awayScore`.

## User Scenarios

### User Story 1 — Single-match pool with finer ranking (P1)

A user creates a pool for a single match (Real Madrid vs Barcelona). 8 friends join, each submits a prediction. The match finishes 2×1.

**Before this feature**: 3 friends predicted "Real wins by some score" → all tied at 5 points → 1/3 of the prize each.

**With this feature**: those 3 friends are separated by their proximity:
- Friend A predicted 2×0 → 5 + 3 = **8**
- Friend B predicted 3×1 → 5 + 3 = **8**
- Friend C predicted 4×0 → 5 + 1 = **6**

A and B still tie (and split half the top prize between them), but C cleanly falls behind. Total prize fragmentation goes from 3 ways to 2 ways.

**Acceptance**:

1. **Given** a single-match pool with 5+ members and varied predictions, **When** the match finishes, **Then** the leaderboard ranks by total (category + bonus), highest first.
2. **Given** two members with identical predictions, **When** the match finishes, **Then** both share the same rank and the prize pot is split equally between them (existing behavior, unchanged).
3. **Given** a member predicted the wrong winner but their goal totals are numerically close, **When** the match finishes, **Then** their total is strictly less than any "correct winner" prediction — even when both are at the lowest non-zero bonus.

### User Story 2 — Transparent decomposition (P2)

A user opens their prediction card after the match ended and sees their score broken into the two components, so they understand why they ranked where they did.

**Acceptance**:

1. **Given** a member viewing their prediction in a finished single-match pool, **Then** the UI shows `category + bonus = total` (e.g., `7 + 2 = 9 pts`) with a tooltip explaining the proximity bonus.
2. **Given** a leaderboard row in a finished single-match pool, **Then** the row shows the total and, on tap/hover, reveals the decomposition.
3. **Given** a member viewing a multi-match pool, **Then** the UI shows the score as today (just total per prediction), with no decomposition.

## Functional Requirements

- **FR-001**: For a prediction in a single-match pool, the system MUST compute points as `category + bonus`, where `category` follows the existing 10/7/5/0 rules and `bonus = max(0, 4 - distance)`.
- **FR-002**: Distance MUST follow the signed-sum formula above, summing instead of subtracting on the column where the loser became the winner.
- **FR-003**: For predictions in multi-match pools, the system MUST compute points using the existing rules (category only, no bonus).
- **FR-004**: The system MUST persist the total (category + bonus) in the existing `prediction.points` column. No new column.
- **FR-005**: Live points computation (during a match in progress) MUST use the same formula for single-match pools.
- **FR-006**: The leaderboard MUST rank members by total points descending, and members with identical totals MUST share the same rank.
- **FR-007**: Prize distribution MUST split the pot equally among all members tied for first place (existing behavior, unchanged).
- **FR-008**: Per-prediction UI MUST show the score decomposed (`category + bonus = total`) in single-match pools, and as a single number in multi-match pools.

## Non-Functional

- **Backward compatibility**: Existing single-match pools whose matches already finished retain their stored 10/7/5/0 totals. The new formula applies only to predictions scored at or after the feature ships. (No retroactive recomputation.)
- **Performance**: Bonus computation is O(1) per prediction. No database changes; no new indexes.

## Open questions

None at spec time. All clarifications resolved in the Decisions section.
