# Quickstart: validating Knockout Scoring + New Scale

How to exercise and verify the feature locally.

## Prerequisites

```bash
pnpm install
pnpm drizzle-kit generate   # generates 0011 migration after schema edits
# → then bump the new entry's `when` in apps/api/drizzle/meta/_journal.json
#   to 1781510900000 (sequential, above 1781510800000)
pnpm drizzle-kit migrate    # or rely on boot-time migrate in dev
pnpm dev
```

## 1. New scale (unit, fastest signal)

```bash
pnpm test apps/api/src/domain/scoring
```

Expect the truth-table tests to pass: for a 2–0 result, predictions 2–0/2–1/3–1/1–0/0–0 → 10/8/7/5/0; for 1–1, predictions 1–1/0–0/anything-decisive → 10/5/0.

## 2. Knockout ingestion mapping (integration)

With the real-DB integration harness, feed a stubbed football-data v4 response for a shootout match:

```jsonc
{ "score": { "winner": "HOME_TEAM", "duration": "PENALTY_SHOOTOUT",
             "regularTime": { "home": 1, "away": 1 },
             "extraTime":   { "home": 0, "away": 0 },
             "penalties":   { "home": 5, "away": 4 },
             "fullTime":    { "home": 6, "away": 5 } } }   // note: ambiguous, must be ignored
```

Verify the stored match row: `home_score=1, away_score=1`, `winner='home'`, `duration='penalty_shootout'`, `penalty_home_score=5`, `penalty_away_score=4`. The `6–5` fullTime must **not** appear anywhere.

## 3. Advance pick + bonus (end-to-end)

1. Create a single-match pool (or any pool) over a knockout fixture.
2. As two members, submit identical predictions `1–1`, one picking `home` to advance, the other `away`.
3. Settle the match as the §2 shootout (home advances).
4. Check standings: the `home`-picker scores **2 more** than the `away`-picker (e.g., 12 vs 10).
5. Settle a different knockout match in extra time (no shootout) and confirm the advance pick changes nobody's points.

## 4. Result display

On the predictions/results screen for the shootout match, confirm it renders the advancing side and shootout tally, e.g. `1–1 (5–4 pens, <home team> advances)`, and that the scoreline shown is `1–1`, not `6–5`.

## 5. Forward-only

Confirm a match already finished/scored before applying the migration keeps its stored `points` and scoreline unchanged (no recompute).

## Success criteria mapping

- SC-001/002 → step 2 + 4. SC-003 → step 3. SC-004 → step 1. SC-005 → step 5. SC-006 → step 3 (submit picks before kickoff).
