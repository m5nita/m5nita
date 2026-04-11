# Contract: Get Match Predictions

**Feature**: 009-view-others-predictions
**Endpoint**: `GET /api/pools/:poolId/matches/:matchId/predictions`
**Auth**: Required (session cookie via Better Auth; `requireAuth` middleware)

---

## Purpose

Return the list of other pool members' predictions for a single match, but only once the match is locked. Also returns the list of pool members who did not submit a prediction, so the UI can power the "N sem palpite" toggle in the accordion.

---

## Path parameters

| Name | Type | Description |
|---|---|---|
| `poolId` | UUID | Pool the viewer is a member of |
| `matchId` | UUID | Match whose predictions are being requested |

No query parameters. No request body.

---

## Success response — `200 OK`

```json
{
  "matchId": "7f3a...",
  "isLocked": true,
  "totalMembers": 18,
  "viewerIncluded": true,
  "viewerDidPredict": true,
  "predictors": [
    { "userId": "u1", "name": "Ana Silva",     "homeScore": 2, "awayScore": 1, "points": 5 },
    { "userId": "u2", "name": "Gustavo Reis",  "homeScore": 2, "awayScore": 1, "points": 5 },
    { "userId": "u3", "name": "Bruno Costa",   "homeScore": 2, "awayScore": 0, "points": 2 },
    { "userId": "u4", "name": "Elena Rocha",   "homeScore": 1, "awayScore": 1, "points": 1 },
    { "userId": "u5", "name": "Carolina Lima", "homeScore": 2, "awayScore": 2, "points": 0 },
    { "userId": "u6", "name": "Diego Alves",   "homeScore": 3, "awayScore": 2, "points": 0 }
  ],
  "nonPredictors": [
    { "userId": "u7",  "name": "Fabio Melo" },
    { "userId": "u8",  "name": "Helena Vaz" },
    { "userId": "u9",  "name": "Icaro Pinto" },
    { "userId": "u10", "name": "Julia Mota" },
    { "userId": "u11", "name": "Karina Ruiz" }
  ]
}
```

### Shape guarantees

- `isLocked` is always `true` in 200 responses (the endpoint rejects unlocked matches with 409).
- Neither `predictors` nor `nonPredictors` includes the viewer. The viewer's own prediction is already visible on the match row in the UI.
- `predictors` is sorted by `points DESC NULLS LAST, name ASC`.
- `nonPredictors` is sorted by `name ASC`.
- `points: null` indicates the scoring pipeline has not yet processed the finished match; UI renders it as "aguardando" / muted state.
- Empty `predictors` array is valid (every member may have skipped the match; `nonPredictors` holds them all in that case).

---

## Error responses

| HTTP | `error` code | When |
|---|---|---|
| `401 Unauthorized` | `UNAUTHENTICATED` | No valid session. Raised by `requireAuth`. |
| `403 Forbidden` | `NOT_MEMBER` | Viewer is not a member of `poolId`. |
| `404 Not Found` | `POOL_NOT_FOUND` | `poolId` does not exist. |
| `404 Not Found` | `MATCH_NOT_FOUND` | `matchId` does not exist. |
| `404 Not Found` | `MATCH_NOT_IN_POOL` | Match exists but does not belong to this pool's competition (multi-competition safety net). |
| `409 Conflict` | `MATCH_NOT_LOCKED` | Match exists and is in scope, but its lock predicate is not yet satisfied. |

Error body shape (matches existing convention in `apps/api/src/routes/predictions.ts`):

```json
{ "error": "MATCH_NOT_LOCKED", "message": "Este jogo ainda não está bloqueado." }
```

Messages are localized to pt-BR to match existing API convention.

---

## Authorization sequence

1. `requireAuth` populates `c.get('user')`, else 401.
2. Service verifies `pool_member(poolId, viewerUserId)` exists, else 403 `NOT_MEMBER`.
3. Service verifies pool and match exist, else 404 (`POOL_NOT_FOUND` / `MATCH_NOT_FOUND`).
4. Service verifies the match belongs to the pool's competition, else 404 `MATCH_NOT_IN_POOL`.
5. Service verifies `match.matchDate <= now() OR match.status IN ('live','finished')`, else 409 `MATCH_NOT_LOCKED`.
6. Service runs the two SELECT queries from `data-model.md` and shapes the response.

---

## Performance contract

- p95 response time MUST be < 200ms under the standard API load profile (constitution IV).
- Typical payload ≤ 10KB gzipped for pools ≤ 200 members.
- No N+1 queries — the predictors query joins `user` in a single round-trip, and the non-predictors query uses `NOT EXISTS` against an indexed composite.

---

## Client integration (TanStack Query)

Query key (to be used by `apps/web/src/routes/pools/$poolId/predictions.tsx` and `ScoreInput`):

```ts
['match-predictions', poolId, matchId]
```

Cache semantics:
- `staleTime`: 30s (live match updates are fine at this cadence).
- `enabled`: only when the accordion for this match is actually open AND the match is locked — no speculative fetches for unlocked matches.
- Invalidation: the existing `onSuccess` of `PUT /api/pools/:poolId/predictions/:matchId` already invalidates `['predictions', poolId]`; no cross-invalidation is needed because the new endpoint never returns the viewer's own prediction.
