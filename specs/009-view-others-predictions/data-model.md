# Data Model: View Other Participants' Predictions on Locked Matches

**Feature**: 009-view-others-predictions
**Phase**: 1 — Design & Contracts

This feature introduces **no database schema changes**. It reuses four existing entities and introduces two shared response types.

---

## Existing entities reused (read-only)

### `prediction` (apps/api/src/db/schema/prediction.ts)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `userId` | FK → user.id | |
| `poolId` | FK → pool.id | |
| `matchId` | FK → match.id | |
| `homeScore` | int | |
| `awayScore` | int | |
| `points` | int, nullable | `null` = pending scoring; non-null = final |
| `createdAt` / `updatedAt` | timestamp | |

Existing indexes used: unique `(userId, poolId, matchId)`, composite `(matchId)`. No new indexes required.

### `pool_member` (apps/api/src/db/schema/poolMember.ts)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `poolId` | FK → pool.id | |
| `userId` | FK → user.id | |
| `joinedAt` | timestamp | |

Used to: (a) authorize the viewer, (b) enumerate the full member roster for the non-predictors list.

### `match` (apps/api/src/db/schema/match.ts)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `matchDate` | timestamp | Lock predicate: `matchDate <= now()` |
| `status` | enum | `scheduled / live / finished / postponed / cancelled` |
| `homeScore` / `awayScore` | int, nullable | Final score when finished |

Used to enforce the lock guard and to return match context in the payload (final score, status).

### `user` (apps/api/src/db/schema/user.ts)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | text | Display name shown in the predictions list |

---

## New shared types (packages/shared/src/types/index.ts)

```ts
export interface MatchPredictor {
  userId: string;
  name: string;
  homeScore: number;
  awayScore: number;
  points: number | null; // null = pending scoring
}

export interface MatchNonPredictor {
  userId: string;
  name: string;
}

export interface MatchPredictionsResponse {
  matchId: string;
  isLocked: true; // endpoint only returns when locked; always true in successful responses
  totalMembers: number;       // every pool_member for this pool
  predictors: MatchPredictor[]; // excludes the viewer
  nonPredictors: MatchNonPredictor[]; // excludes the viewer if the viewer didn't predict
  viewerIncluded: boolean; // true if the viewer is a pool member (always true in successful responses)
  viewerDidPredict: boolean; // whether the viewer submitted a prediction for this match
}
```

### Field rules

- `predictors` is sorted server-side: `points DESC NULLS LAST, name ASC`. The UI renders in the order received.
- The viewer's own row is **always** excluded from both `predictors` and `nonPredictors` arrays, regardless of whether they predicted. `viewerDidPredict` lets the UI avoid redundant "you didn't predict" messaging, since the match row already shows that state.
- `nonPredictors` is sorted `name ASC`.
- `points` is the raw `prediction.points` value; `null` means the scoring pipeline has not yet processed this match (spec edge case: "pending scoring").
- `totalMembers` includes the viewer; therefore `predictors.length + nonPredictors.length + (viewerDidPredict ? 1 : 0) === totalMembers` always holds (assuming `viewerIncluded === true`).

---

## Validation & access rules

Enforced by the service layer before the query runs:

1. **Authentication** — `requireAuth` middleware populates `c.get('user')`. A missing session returns 401 from middleware.
2. **Pool membership** — `pool_member` row for `(poolId, viewerUserId)` must exist. Otherwise throw `PredictionError('NOT_MEMBER', ...)` → 403.
3. **Pool ↔ match scope** — the match must belong to the competition that the pool tracks. Otherwise throw `PredictionError('MATCH_NOT_IN_POOL', ...)` → 404. This is a safety net to prevent cross-competition leakage in multi-competition pools.
4. **Lock guard** — the match must satisfy `match.matchDate <= now() OR match.status IN ('live','finished')`. Otherwise throw `PredictionError('MATCH_NOT_LOCKED', ...)` → 409.

No state transitions are introduced by this feature.

---

## Query plan

Two read queries, both indexed:

```sql
-- (1) Predictors — indexed by (matchId)
SELECT p.user_id, u.name, p.home_score, p.away_score, p.points
FROM prediction p
INNER JOIN "user" u ON u.id = p.user_id
WHERE p.pool_id = $1 AND p.match_id = $2
ORDER BY p.points DESC NULLS LAST, u.name ASC;

-- (2) Non-predictors — via NOT EXISTS on the pool member roster
SELECT pm.user_id, u.name
FROM pool_member pm
INNER JOIN "user" u ON u.id = pm.user_id
WHERE pm.pool_id = $1
  AND NOT EXISTS (
    SELECT 1 FROM prediction p
    WHERE p.pool_id = pm.pool_id AND p.user_id = pm.user_id AND p.match_id = $2
  )
ORDER BY u.name ASC;
```

Both queries use existing indexes; expected plan is Index Scan + Nested Loop for pools ≤ 200 members.
