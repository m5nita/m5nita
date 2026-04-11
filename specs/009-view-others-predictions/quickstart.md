# Quickstart: View Other Participants' Predictions on Locked Matches

**Feature**: 009-view-others-predictions

A manual smoke test you can run after implementation to confirm the feature works end-to-end. Assumes a local dev environment with at least one pool, one completed match, and a handful of members who submitted predictions.

---

## 1. Bring up the stack

```bash
pnpm dev
```

Both `apps/api` (Hono) and `apps/web` (Vite) should start.

## 2. Seed (or use existing) data

Make sure you have, in your local DB:

- A pool with at least **4** members.
- At least one match in the pool's competition whose `matchDate` is in the past and `status` is `finished`.
- At least **3 of the 4** members have a saved prediction for that match. Leave at least one member without a prediction to exercise the "N sem palpite" toggle.
- Populate `prediction.points` for at least one finished match to exercise the `+N pts` rendering (scoring job or a direct `UPDATE`).

## 3. API smoke test

Log in as any member of the pool, grab the session cookie, then:

```bash
curl -s "http://localhost:3000/api/pools/<POOL_ID>/matches/<LOCKED_MATCH_ID>/predictions" \
  -H "cookie: <SESSION_COOKIE>" | jq
```

Expect a `200` with `predictors`, `nonPredictors`, `totalMembers`, `viewerDidPredict`. Verify:

- Your own `userId` is **not** inside `predictors` or `nonPredictors`.
- `predictors` is sorted by `points DESC NULLS LAST, name ASC`.
- `totalMembers === predictors.length + nonPredictors.length + (viewerDidPredict ? 1 : 0)`.

### Negative cases

| Call | Expected |
|---|---|
| Same URL with a match that is still in the future | `409 MATCH_NOT_LOCKED` |
| Same URL with a pool the session user is NOT a member of | `403 NOT_MEMBER` |
| Same URL with no session cookie | `401 UNAUTHENTICATED` |
| Unknown `matchId` | `404 MATCH_NOT_FOUND` |
| Valid match but from a different competition than the pool | `404 MATCH_NOT_IN_POOL` |

## 4. Web smoke test

1. Log in and navigate to `/pools/:poolId/predictions`.
2. Scroll to a locked match row — it should now show a `Ver palpites do bolão ▾` control below the `+N pts` status line.
3. Tap the control — the row expands inline:
   - Existing match row stays visible above the accordion content.
   - Accordion body shows a list of `nome · placar · pts` rows in the existing visual language (no avatars, no rank badges, no lock icons).
   - Your own prediction is **not** in the list.
   - Rows are sorted by points desc (ties broken by name asc).
   - At the bottom, `N sem palpite ▾` expands to reveal the non-predictors list.
4. Tap `Ocultar palpites do bolão ▴` — the row collapses and the page returns to its original layout with no residual content.
5. Repeat on an unlocked match — the expand control MUST NOT be visible.
6. Repeat on a finished match whose `prediction.points` is still `null` for some rows — those rows MUST render the pending/muted state instead of `+N pts`.

## 5. Constitution checks

- **Principle II (Testing)**: `pnpm --filter @m5nita/api test` passes, including the new integration tests for the endpoint (membership, lock guard, response shape, viewer exclusion, non-predictors, pending points).
- **Principle III (UX)**: Visually diff the accordion rows against the existing locked `ScoreInput` row — fonts, score-box borders, color tokens, and meta text MUST match. No new ornamental elements.
- **Principle IV (Performance)**: In DevTools Network, the new endpoint returns in < 200ms p95 with a pool of ~50 members locally. Accordion re-expand of the same match MUST not trigger a refetch (TanStack Query cache hit).
