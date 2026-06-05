# Data Model: Knockout Scoring + New Global Scale

Phase 1 output. Additive only — no column drops, no type changes, no backfill.

## 1. `match` table (new columns, all nullable)

| Column | Type | Values | Meaning |
|---|---|---|---|
| `extra_time_home_score` | integer, null | ≥ 0 | Extra-time-only goals (home). Null unless `duration = extra_time \| penalty_shootout`. |
| `extra_time_away_score` | integer, null | ≥ 0 | Extra-time-only goals (away). |
| `penalty_home_score` | integer, null | ≥ 0 | Shootout tally (home). Null unless `duration = penalty_shootout`. |
| `penalty_away_score` | integer, null | ≥ 0 | Shootout tally (away). |
| `winner` | text, null | `home` \| `away` \| `draw` | Advancing/winning side. `draw` only for non-knockout finished draws. |
| `duration` | text, null | `regular` \| `extra_time` \| `penalty_shootout` | How the match was decided. |

**Unchanged**: `home_score` / `away_score` keep their columns but now store the **graded scoreline = regulation (90-minute) score** (never extra-time or shootout goals). For `regular` matches this equals the final score (no behavior change). The extra-time and penalty figures live in their own columns for display only.

**Provider → column mapping** (football-data v4 `score`):
- `duration` ← `score.duration` lowercased (`REGULAR`→`regular`, etc.).
- `winner` ← `score.winner` (`HOME_TEAM`→`home`, `AWAY_TEAM`→`away`, `DRAW`→`draw`).
- `extra_time_*` ← `score.extraTime.{home,away}` (null when absent).
- `penalty_*` ← `score.penalties.{home,away}` (null when absent).
- `home_score`/`away_score` ← `score.regularTime ?? score.fullTime` — the 90-minute score; extra-time/penalty goals are never folded in (see research R2).

## 2. `prediction` table (new column, nullable)

| Column | Type | Values | Meaning |
|---|---|---|---|
| `advance_pick` | text, null | `home` \| `away` | Which side the member thinks advances if the match goes to penalties. Null = no pick / non-knockout. |

**Unchanged**: `home_score`, `away_score`, `points`, uniqueness `(user_id, pool_id, match_id)`.

## 3. Repository port shapes

`MatchData` (`domain/match/MatchRepository.port.ts`) gains: `winner: 'home'|'away'|'draw'|null`, `duration: 'regular'|'extra_time'|'penalty_shootout'|null`, `extraTimeHome/Away: number|null`, `penaltyHome/Away: number|null`. `home_score/away_score` stay (graded scoreline). `MatchRepository.updateScores` gains the same knockout fields (or a sibling `updateResult`) so the sync path can persist them when a match finishes.

`UpsertMatchData` inherits the new optional fields. The prediction repo upsert gains `advancePick?: 'home'|'away'|null`.

## 4. Domain value objects

### `KnockoutResult` (new, `domain/match/`)
Pure helpers built from a finished match's result. Expose:
- `gradedScoreline(subScores): { home; away }` → the **regular-time (90') score** (`regularTime ?? fullTime`); extra-time/penalty goals never folded in.
- `knockoutContextFor(match, predictedAdvance): KnockoutContext | undefined` → `undefined` for non-knockout or no decisive winner; otherwise `{ decidedInOvertime: duration ∈ {extra_time, penalty_shootout}, advancingSide: winner, predictedAdvance }`.
Used by ingestion (graded scoreline) and the scoring path (context).

### `MatchStage` helper (new, `domain/match/`)
`isKnockout(stage: string): boolean` → `stage ∉ {'group','league'}`. Single source for "should this match offer an advance pick / is it bonus-eligible".

### `AdvanceBonus` (new, `domain/scoring/`)
Pure rule: `apply(score: Score, knockout?: KnockoutContext): Score`. Adds `SCORING.ADVANCE_BONUS` (= 2) to `score` (and to `breakdown.advanceBonus`) iff `knockout?.decidedInOvertime && knockout.predictedAdvance === knockout.advancingSide`. Otherwise returns `score` unchanged.

### `Score` / `ScoreBreakdown` (modified, `domain/scoring/`)
- `Score.calculate(ph, pa, ah, aa)` implements the 5-tier ladder (see truth table below).
- `ScoreBreakdown` gains `advanceBonus: number` (default 0). Display total = `category + bonus + advanceBonus`.

### `ScoringPolicy` (modified, `domain/scoring/`)
- `score(ph, pa, ah, aa, knockout?: KnockoutContext): Score` — both policies compute the base scoreline `Score` then return `AdvanceBonus.apply(base, knockout)`.
- `KnockoutContext = { decidedInOvertime: boolean; advancingSide: 'home'|'away'; predictedAdvance: 'home'|'away'|null }`.

### `Prediction` (modified, `domain/prediction/`)
- Carries `advancePick: 'home'|'away'|null`.
- `calculatePoints(actualHome, actualAway, knockout?)` delegates to the policy with the knockout context.

## 5. Scoring truth table (the new scale)

For real result **2–0** (decisive, home win):

| Prediction | Tier | Points |
|---|---|---|
| 2–0 | exact | 10 |
| 2–1 | winner + winner's goals (home=2) | 8 |
| 3–1 | winner + difference (2) | 7 |
| 1–0, 4–0, 3–0 | winner only | 5 |
| 0–0, any away win | miss | 0 |

For real result **1–1** (draw):

| Prediction | Tier | Points |
|---|---|---|
| 1–1 | exact | 10 |
| 0–0, 2–2, 3–3 | correct draw | 5 |
| any non-draw | miss | 0 |

## 6. Advance bonus matrix

Match is a knockout settled **past regular time** (extra time or penalties), 90-minute score 1–1, **home** advances. Base = `Score.calculate` vs the 90-minute 1–1.

| Prediction | advance_pick | Base | Bonus | Total |
|---|---|---|---|---|
| 1–1 | home | 10 | +2 | **12** |
| 1–1 | away | 10 | 0 | 10 |
| 1–1 | (none) | 10 | 0 | 10 |
| 0–0 | home | 5 | +2 | 7 |
| 2–1 (home win at 90) | home | 0 | +2 | 2 |
| 2–1 (home win at 90) | away | 0 | 0 | 0 |

When the same match is decided in **regulation time** (`decidedInOvertime = false`), the bonus is never added regardless of `advance_pick`. In single-match pools the proximity bonus (0–4) still applies to the base; the +2 stacks on top.

## 7. State / lifecycle

No new match statuses. The knockout sub-scores, `winner`, and `duration` are written on the same transition that already sets the final score (scheduled/live → finished) in the sync use cases. Settlement (`jobs/calcPoints`) computes points once on finish; forward-only, no recompute of previously-settled matches.
