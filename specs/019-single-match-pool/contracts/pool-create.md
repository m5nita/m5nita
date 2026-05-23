# Contract — Pool creation (range + single-match modes)

## `POST /api/pools`

### Request body (JSON)

```jsonc
{
  "name": "string (1..80)",
  "entryFee": 1000,                       // centavos BRL, integer
  "competitionId": "uuid",
  "couponCode": "string|null",            // optional
  // Exactly one of the following groups MUST be present (or none = whole competition):
  "matchdayFrom": 30,                     // int | null
  "matchdayTo":   30,                     // int | null
  "matchId":      "uuid|null"             // NEW — present iff single-match scope
}
```

**Mutual exclusivity rule** (validated server-side and by `packages/shared/src/schemas/pool.ts`):

- If `matchId !== null` ⇒ `matchdayFrom === null && matchdayTo === null`.
- If `matchdayFrom !== null || matchdayTo !== null` ⇒ `matchId === null`, and the existing matchday-range rules apply (`matchdayFrom <= matchdayTo`, both or neither).
- If all three are `null` ⇒ "whole competition" scope (existing behavior, unchanged).

### Validation errors (HTTP 400)

| Code | When |
|---|---|
| `INVALID_SCOPE` | Both `matchId` and a matchday-range field are present. |
| `INVALID_MATCHDAY_RANGE` | `matchdayFrom > matchdayTo`, or only one of the two is set (existing). |
| `INVALID_COMPETITION` | Competition not found or not active (existing). |
| `MATCH_UNAVAILABLE` | `matchId` is set but: not found, belongs to a different competition, or kickoff is in the past. |
| `INVALID_COUPON` | Existing. |

### Success response (HTTP 201)

```jsonc
{
  "pool": {
    "id": "uuid",
    "name": "string",
    "entryFee": 1000,
    "competitionId": "uuid",
    "matchdayFrom": 30,           // null when single-match or whole-competition
    "matchdayTo":   30,           // null when single-match or whole-competition
    "matchId":      "uuid|null",  // NEW
    "inviteCode":   "string",
    "status":       "pending|active|closed",
    "isOpen":       true
  },
  "payment": { /* unchanged CheckoutResult */ },
  "platformFee": 100,
  "originalPlatformFee": 100,
  "discountPercent": 0,
  "couponCode": null
}
```

The `matchdayFrom`/`matchdayTo`/`matchId` triple in the response reflects the persisted scope after construction.

---

## `GET /api/competitions/:competitionId/upcoming-matches` (NEW)

Backs the match picker on the pool-create form.

### Request

No query parameters. Path param `competitionId` (uuid).

### Authorization

Same as existing `/api/competitions/:id`-style endpoints — authenticated user.

### Success response (HTTP 200)

```jsonc
{
  "matches": [
    {
      "id":          "uuid",
      "matchday":    30,                       // int | null (null for cup)
      "stage":       "QUARTER_FINALS",         // string | null (null for league)
      "kickoffAt":   "2026-06-01T18:00:00Z",
      "homeTeam":    { "id": "uuid", "name": "Real Madrid", "crest": "https://…" },
      "awayTeam":    { "id": "uuid", "name": "FC Barcelona", "crest": "https://…" },
      "status":      "SCHEDULED"               // SCHEDULED | TIMED | POSTPONED
    }
  ]
}
```

### Selection rules (server-side)

- `competition.status = 'active'`.
- `match.competition_id = :competitionId`.
- `match.kickoff_at > now()`.
- `match.status IN ('SCHEDULED', 'TIMED', 'POSTPONED')`.
- Ordered by `kickoff_at ASC, id ASC` (stable secondary sort).

### Error response (HTTP 404)

`{ "code": "COMPETITION_NOT_FOUND" }` — competition does not exist or is inactive.

### Empty state (HTTP 200)

`{ "matches": [] }` when there are no upcoming matches. The frontend renders the "no upcoming matches" empty state and disables the "create" submit for single-match scope.
