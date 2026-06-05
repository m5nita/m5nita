# Contract: Domain scoring

The single source of truth for points. All scoring callers go through `ScoringPolicy.score(...)`; no layer re-derives these rules (constitution V, guardrails G2/G3).

## Constants (`packages/shared/src/constants/index.ts`)

```ts
export const SCORING = {
  EXACT_MATCH: 10,
  WINNER_AND_WINNER_GOALS: 8,   // NEW
  WINNER_AND_DIFF: 7,
  OUTCOME_CORRECT: 5,
  MISS: 0,
  ADVANCE_BONUS: 2,             // NEW — advancing past regular time (extra time or penalties)
} as const
```

## `Score.calculate(ph, pa, ah, aa): Score`

Ordered ladder, first match wins:

1. `ph === ah && pa === aa` → `EXACT_MATCH` (10)
2. same decisive winner (`sign(ph-pa) === sign(ah-aa) !== 0`):
   - winner's goals equal (`(home win ? ph : pa) === (home win ? ah : aa)`) → `WINNER_AND_WINNER_GOALS` (8)
   - `(ph-pa) === (ah-aa)` → `WINNER_AND_DIFF` (7)
   - else → `OUTCOME_CORRECT` (5)
3. both draws (`sign(ph-pa) === sign(ah-aa) === 0`) → `OUTCOME_CORRECT` (5)
4. else → `MISS` (0)

Invariants:
- Draws yield only {10, 5, 0}.
- Tiers 8 and 7 are mutually exclusive for non-exact predictions.
- Strict refinement of the old scale: no prediction's points decrease; some 7s become 8s.

## `ScoringPolicy.score(ph, pa, ah, aa, knockout?): Score`

```ts
type KnockoutContext = {
  decidedInOvertime: boolean   // extra time OR penalty shootout
  advancingSide: 'home' | 'away'
  predictedAdvance: 'home' | 'away' | null
}
```

- `RangeScoringPolicy`: `base = Score.calculate(...)`; return `AdvanceBonus.apply(base, knockout)`.
- `SingleMatchScoringPolicy`: `base = SingleMatchScore.calculate(...)` (5-tier category + 0–4 proximity bonus); return `AdvanceBonus.apply(base, knockout)`.
- `maxPoints()` reflects the scoreline ceiling (range: 10; single-match: 14); the +2 advance bonus is additive on top for knockout matches settled past regular time.

## `AdvanceBonus.apply(score, knockout?): Score`

```
if !knockout || !knockout.decidedInOvertime            → score (unchanged)
if knockout.predictedAdvance === knockout.advancingSide → score + ADVANCE_BONUS
                                                          (breakdown.advanceBonus = 2)
else                                                    → score (unchanged)
```

Pure, deterministic, no side effects. `predictedAdvance === null` → no bonus.

## Caller obligations

The scoring call sites that settle/display finished matches (`jobs/calcPoints.ts`, `GetUserPredictionsUseCase`, `GetMatchPredictionsUseCase`) build the `knockout` context via `knockoutContextFor(match, prediction.advancePick)` (domain helper), which returns `undefined` for non-knockout / no decisive winner:

```
knockoutContextFor(match, advancePick) =
  isKnockout(match.stage) && match.winner ∈ {home, away}
    ? { decidedInOvertime: match.duration ∈ {extra_time, penalty_shootout},
        advancingSide: match.winner,
        predictedAdvance: advancePick }
    : undefined
```

Live scoring (`computeLivePoints`, `services/ranking.ts` live path) passes `undefined` while the match is live (the overtime result is not yet known); the bonus only materializes at settlement and is read from the stored `points` thereafter.

## Test matrix (unit, pure domain — 100% coverage target)

- Scale: every cell of the §5 truth tables in `data-model.md` (decisive 2–0 and draw 1–1), both home- and away-win symmetric cases.
- Bonus: overtime × {pick home, pick away, pick none} × {home advances, away advances}; extra time and penalties behave identically; plus `decidedInOvertime=false` (no bonus) and non-knockout (no context).
- Composition: single-match proximity bonus + advance bonus stack correctly; breakdown fields (`category`, `bonus`, `advanceBonus`) sum to `points`.
- Ingestion mapping (adapter/integration): graded scoreline = `regularTime` (90') for `extra_time`/`penalty_shootout`; = fullTime for `regular`; never includes extra-time or penalty goals.
