# Research: Knockout Scoring + New Global Scale

Phase 0 output. Each decision lists what was chosen, why, and what was rejected.

## R1 — What the data provider exposes for knockout results

**Decision**: Consume football-data.org v4's separated `score` sub-objects and decision metadata, not the merged `fullTime` alone. The `score` object provides: `winner` (`HOME_TEAM | AWAY_TEAM | DRAW`), `duration` (`REGULAR | EXTRA_TIME | PENALTY_SHOOTOUT`), `regularTime` (90' score), `extraTime` (extra-time-only goals), `penalties` (shootout tally), plus `fullTime` and `halfTime`.

**Rationale**: The current ingestion reads only `score.fullTime`. The v4 docs are **internally contradictory** about `fullTime` for shootout matches: the prose says it excludes penalties, but the official penalty-shootout example shows `fullTime: 7–6` for a `1–1 (6–5 pens)` game — i.e., `regularTime + extraTime + penalties`. Relying on `fullTime` for knockout is therefore unsafe and is the root cause of the corrupted-scoreline bug. The separated `regularTime`/`extraTime` are unambiguous.

**Alternatives considered**:
- *Keep using `fullTime` and "subtract" penalties* — rejected: requires knowing the shootout tally anyway and trusting the very field that is ambiguous.
- *Only store `winner` (not sub-scores)* — rejected: we still need the real on-pitch scoreline (reg+ET) to grade, and the user wants extra-time/penalty figures stored for display.

## R2 — The graded scoreline for any match

**Decision** (revised per the 2026-06-05 flow change): The scoreline used for grading and storage in `match.homeScore/awayScore` is the **regular-time (90-minute) score only**, computed at ingestion as:

```
gradedHome = regularTime?.home ?? fullTime.home
gradedAway = regularTime?.away ?? fullTime.away
```

Extra-time and penalty goals never count toward the scoreline. For `REGULAR` matches `regularTime` is absent → graded = `fullTime` (unchanged behavior, since full-time = the 90' score). For `EXTRA_TIME`/`PENALTY_SHOOTOUT` → graded = `regularTime` (the 90' score, always a draw for single-leg knockouts).

**Rationale**: One uniform rule covering group, league, and knockout, with no branching on stage and no trust in `fullTime` for overtime. The product decision is: scoreline = regular time; advancing past regular time (extra time or penalties) is rewarded separately via the advance bonus (R4).

**Alternatives considered**:
- *Grade on regulation + extra time* — was the earlier decision; superseded by the product owner: extra-time goals must not affect the scoreline.
- *Trust `fullTime`* — rejected: ambiguous/inflated for shootouts.

## R3 — The 5-tier scale algorithm (10/8/7/5/0)

**Decision**: Extend `Score.calculate` to the ordered ladder. Pseudocode:

```
if exact (ph==ah && pa==aa)            → 10
pr = sign(ph-pa); ar = sign(ah-aa)
if pr === ar && ar !== 0:              // same decisive winner
    predWinnerGoals = ar>0 ? ph : pa
    actWinnerGoals  = ar>0 ? ah : aa
    if predWinnerGoals === actWinnerGoals → 8   // winner + winner's goals
    if (ph-pa) === (ah-aa)               → 7    // winner + goal difference
    → 5                                          // winner only
if pr === ar (both draws, non-exact)   → 5      // correct draw
→ 0
```

**Rationale**: Tiers 8 and 7 are mutually exclusive when not exact (matching both winner's-goals and difference ⇒ exact). Draws can only reach 10/5/0 (no winner/difference tier), exactly as specified. It is a strict refinement: predictions that scored 7 before may now score 8; nothing decreases.

**Alternatives considered**:
- *Rank goal-difference (8) above winner's-goals (7)* — rejected: product owner ranked winner's-goals higher.
- *Add a "loser's goals" tier* — rejected: out of scope, not requested.

## R4 — Where the advance bonus is applied

**Decision** (revised per the 2026-06-05 flow change): Apply the +2 inside `ScoringPolicy.score(...)`, which gains an optional knockout context argument: `score(ph, pa, ah, aa, knockout?)` where `knockout = { decidedInOvertime, advancingSide: 'home'|'away', predictedAdvance: 'home'|'away'|null }`. Both `RangeScoringPolicy` and `SingleMatchScoringPolicy` compute the scoreline `Score`, then delegate to a shared pure rule `AdvanceBonus.apply(score, knockout)` that adds `SCORING.ADVANCE_BONUS` when `decidedInOvertime && predictedAdvance === advancingSide`. `decidedInOvertime` is true for both extra-time- and penalty-decided matches. The bonus is tracked in `ScoreBreakdown.advanceBonus` for display.

**Rationale**: Keeps the rule single-sourced (one helper, one constant) and applied at the one seam every caller already uses (`scoringPolicy.score`). The ~5 call sites (ranking, calcPoints, computeLivePoints, GetUserPredictions, GetMatchPredictions) pass the context they already have from the match + prediction; non-knockout/non-shootout callers pass `undefined` and get no bonus. Honors constitution V (rule in domain, not re-derived per layer) and G2/G3 guardrails.

**Alternatives considered**:
- *Compose the bonus at each call site after `score()`* — rejected: duplicates the rule across 5 sites, risks divergence, violates the no-duplication and single-source constitution rules.
- *New 6-arg `score` with raw winner/duration/pick primitives* — rejected in favor of a small `knockout` context object (avoids primitive-obsession; ISP-friendly optional param).

## R5 — Knockout detection

**Decision**: A match is knockout when its already-stored `stage` ∉ `{group, league}` (i.e., `round-of-32`, `round-of-16`, `quarter`, `semi`, `third-place`, `final`). Encapsulated as `isKnockout(stage)` in the domain.

**Rationale**: `stage` is already ingested and stored at fixture time, so eligibility is known before kickoff with zero new data. Includes the third-place playoff (which can go to penalties). (Recorded in spec Clarifications.)

**Alternatives considered**:
- *Branch on competition type (`cup` vs `league`)* — rejected: subsumed by `stage` (a cup's group games are `stage=group`; a league's are `stage=league`).
- *Wait for the result `duration`* — rejected: the advance pick must be offered before kickoff.

## R6 — Schema changes (additive, nullable)

**Decision**: One migration `0011` adds to `match`: `extra_time_home_score`, `extra_time_away_score`, `penalty_home_score`, `penalty_away_score` (integer, nullable), `winner` (text, nullable: `home|away|draw`), `duration` (text, nullable: `regular|extra_time|penalty_shootout`); and to `prediction`: `advance_pick` (text, nullable: `home|away`). `match.home_score/away_score` keep their meaning but now hold the graded reg+ET scoreline. Regulation score is recoverable as `home_score − extra_time_home_score` and is not stored separately (YAGNI).

**Rationale**: Additive + nullable = safe online migration, no backfill, no impact on existing rows. Stores exactly what the product owner asked (extra time, penalties) plus the minimum to grade/display (winner, duration).

**Alternatives considered**:
- *Store regulation score explicitly too* — rejected as redundant (derivable) per constitution I (no needless fields).
- *Store the advancing team name instead of `home|away`* — rejected: side is stable, language-agnostic, and matches the two-option pick.

## R7 — Forward-only (no backfill)

**Decision**: The new scale and knockout handling apply only to matches settled after deploy. The settlement job (`jobs/calcPoints.ts`) computes points when a match finishes; already-finished matches keep their stored `points` and scoreline. No migration backfill, no recompute pass.

**Rationale**: Explicit product decision — changing rules on already-scored games is unfair/confusing. The World Cup 2026 knockout stage starts after this ships, so it gets the new rules cleanly. Corrupted historical penalty scorelines (if any exist) are left untouched per this decision; none exist for the current active pools' finished matches (group/league only to date).

**Alternatives considered**:
- *Backfill + recompute* — rejected by product owner.

## R8 — Migration journal gotcha

**Decision**: After `drizzle-kit generate`, set the new `0011` entry's `when` in `drizzle/meta/_journal.json` to the next sequential value above the last entry (`1781510800000` → `1781510900000`).

**Rationale**: This repo uses hand-sequenced synthetic `when` timestamps; production runs migrations at boot and silently skips an out-of-order entry. (Documented project gotcha.)

**Alternatives considered**: none — this is a known, mandatory step.
