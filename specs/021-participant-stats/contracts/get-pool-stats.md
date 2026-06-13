# Contract: `GET /api/pools/:poolId/stats`

Server-side gated read of a participant's statistics for one pool. Route lives in `apps/api/src/infrastructure/http/routes/stats.ts`, delegates to `GetParticipantStatsUseCase`. Registered in `app.ts` under `/api`.

## Auth & gate

- Requires an authenticated session (same auth middleware as other `/api/pools/*` routes).
- Requires **current membership** of `:poolId` (`poolMember`). Non-member → `404` (do not reveal pool existence/state beyond membership).
- Entitlement is checked server-side via `statsUnlockRepo.isUnlocked(userId, poolId)`.

## Path params

| Param | Type | Notes |
|---|---|---|
| `poolId` | uuid | pool scope; statistics are always per-pool (FR-001) |

## Responses

### 200 — Locked (member, not yet unlocked)

```json
{
  "unlocked": false,
  "price": { "centavos": 199, "formatted": "R$ 1,99" },
  "teaser": {
    "blocks": ["hit_rate_vs_average", "ranking_evolution", "strengths_weaknesses", "points_left_on_table"],
    "headline": "Veja como você se compara ao bolão"
  }
}
```

- MUST NOT contain any computed statistic, ranking figure, or third-party data.
- `price` is produced from `StatsUnlockPrice` (the front never computes it — FR-005).

### 200 — Unlocked (member with entitlement)

```json
{
  "unlocked": true,
  "blocks": {
    "hitRateVsAverage": {
      "exactPct":   { "you": 0.22, "average": 0.15, "leader": 0.31 },
      "resultPct":  { "you": 0.61, "average": 0.54, "leader": 0.70 },
      "state": "ok"
    },
    "rankingEvolution": {
      "perRound": [ { "matchday": 1, "points": 12 }, { "matchday": 2, "points": 7 } ],
      "position": 4,
      "gapToLeader": 18,
      "trend": "rising",
      "state": "ok"
    },
    "strengthsWeaknesses": {
      "home": { "correct": 9,  "total": 14, "pct": 0.64 },
      "away": { "correct": 5,  "total": 12, "pct": 0.42 },
      "lowGoals":  { "correct": 11, "total": 16, "pct": 0.69 },
      "highGoals": { "correct": 3,  "total": 10, "pct": 0.30 },
      "state": "ok"
    },
    "pointsLeftOnTable": {
      "earned": 96,
      "maxPossible": 260,
      "leftOnTable": 164,
      "efficiency": 0.37,
      "efficiencyVsAverage": 0.05,
      "state": "ok"
    }
  },
  "pendingImpact": [
    {
      "matchId": "…",
      "homeTeam": "…", "awayTeam": "…",
      "kickoff": "2026-06-10T18:00:00Z",
      "hasPrediction": false,
      "action": "submit",
      "impact": "high"
    },
    {
      "matchId": "…",
      "homeTeam": "…", "awayTeam": "…",
      "kickoff": "2026-06-11T21:00:00Z",
      "hasPrediction": true,
      "action": "change",
      "impact": "high"
    }
  ],
  "suggestions": [
    { "kind": "home_strength", "text": "Você acerta mais o mandante — considere ao palpitar.", "basis": "own_history" }
  ]
}
```

Field rules:
- All numbers are **pre-computed by the API** (front never derives ratios/prize/fee).
- Every block carries a `state`: `"ok"` or `"insufficient_data"` (Blocks render an explicit "not enough data yet" empty-state for the latter — SC-008).
- `pendingImpact` lists **all of the viewer's own not-started in-scope matches — predicted or not** — ranked by impact; `impact` is a coarse bucket (`high`/`medium`/`low`) so no raw score leaks gameability. `hasPrediction` is the viewer's own state and `action` is `"submit"` (no prediction yet) or `"change"` (a prediction already exists and is still editable until kickoff). It NEVER includes any other member's prediction or any per-match consensus/percentage for a not-started match (FR-021/022).
- `action: "change"` only links to the existing predictions flow; the feature adds no new editing surface and does not alter the edit-until-kickoff rule (FR-019).
- `suggestions[].basis` is always `"own_history"` (FR-020); no third-party data.
- `kickoff` is the match deadline; reminders are ordered by impact.

### 401 — unauthenticated
### 404 — authenticated but not a member of `:poolId`

## Freshness / caching (client)

- The client MUST NOT poll this endpoint on the `livePollMs()` (30–40s) cycle (D5). Use refetch-on-focus + a long interval. During live matches the UI shows "atualiza quando os jogos terminam".
- Server serves the pool aggregate from `statsCache` (TTL 25s, single-flight) and the per-user snapshot from `participant_pool_stats`; pending impact is computed at read time with a short per-user cache. No heavy re-aggregation per request (FR-024).
