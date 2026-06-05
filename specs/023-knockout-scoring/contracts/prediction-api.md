# Contract: Prediction & Match HTTP surface

Additive, backward-compatible changes. Existing clients that omit the new fields keep working.

## Upsert a prediction

`PUT /api/pools/:poolId/predictions/:matchId`

**Request body** (`upsertPredictionSchema`, extended):

```jsonc
{
  "homeScore": 1,          // int >= 0 (unchanged)
  "awayScore": 1,          // int >= 0 (unchanged)
  "advancePick": "home"    // NEW — optional: "home" | "away" | null
}
```

Validation rules:
- `advancePick` is optional. `null`/omitted is allowed (no pick).
- `advancePick` MUST be ignored/rejected-as-noise for non-knockout matches: the server stores it only when the match `stage` is knockout (`isKnockout`). A pick on a non-knockout match is dropped (stored as null), not an error.
- Deadline unchanged: editable until kickoff (`Prediction.canSubmitFor`). Same `MATCH_STARTED` (403) and `NOT_MEMBER` (403) errors.

**Response**: the upserted prediction including `advancePick` and (when the match is settled) the `points` breakdown.

## Prediction / match read responses

`GET /api/pools/:poolId/predictions`, `GET /api/pools/:poolId/matches/:matchId/predictions`, and any endpoint returning predictions or match results now include:

Prediction object — added fields:
```jsonc
{
  "advancePick": "home",        // "home" | "away" | null
  "points": 12,                 // total (unchanged field; may now exceed 10 on overtime knockouts)
  "category": 10,               // breakdown (existing for single-match; now also exposes…)
  "bonus": 0,                   // proximity bonus (single-match only)
  "advanceBonus": 2             // NEW — 0 or 2
}
```

Match result object — added fields:
```jsonc
{
  "homeScore": 1,               // graded scoreline = regular-time (90') score (NOT extra time / shootout)
  "awayScore": 1,
  "winner": "home",             // NEW — "home" | "away" | "draw" | null
  "duration": "penalty_shootout", // NEW — "regular" | "extra_time" | "penalty_shootout" | null
  "penaltyHomeScore": 5,        // NEW — null unless shootout
  "penaltyAwayScore": 4,        // NEW
  "extraTimeHomeScore": 0,      // NEW — null unless extra time
  "extraTimeAwayScore": 0
}
```

Display contract: when `duration` is `extra_time` or `penalty_shootout`, the UI renders the advancing side and how it was decided, e.g. `1–1 (5–4 pens, <home team> advances)` or `0–0 (1–0 in extra time, <home team> advances)`.

## Backward compatibility

- Clients that do not send `advancePick` behave exactly as today.
- Clients that ignore the new match/prediction fields render as today (scoreline + points).
- `points` may exceed the previous per-match maximum (10, or 14 in single-match pools) by +2 on knockout matches settled past regular time (extra time or penalties) — intended (FR-013).
