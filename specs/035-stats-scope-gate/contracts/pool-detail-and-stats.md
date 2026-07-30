# Contract deltas: pool detail + the two statistics endpoints

No new endpoint. Three existing ones change.

---

## `GET /api/pools/:poolId` — added field

Served by `services/pool.ts:getPoolById` via
`apps/api/src/infrastructure/http/routes/pools.ts`.

```jsonc
{
  "id": "…",
  "name": "Bolão da firma",
  "matchdayFrom": 5,
  "matchdayTo": 8,
  "matchId": null,
  "statsAvailable": false,   // NEW
  "isMember": true
  // … everything else unchanged
}
```

`statsAvailable: boolean` — **resolved for the requesting viewer**:

```text
statsAvailable = PoolScope.fromRow(pool).supportsParticipantStats()
                 || statsUnlockRepo.isUnlocked(viewerId, poolId)
```

| Pool | Viewer | `statsAvailable` |
|---|---|---|
| whole competition | anyone | `true` |
| matchday range | no unlock | `false` |
| matchday range | holds an unlock | `true` |
| single fixture | no unlock | `false` |
| single fixture | holds an unlock | `true` |

Two viewers of the same pool may receive different values. The front end must
treat this field as the only source of truth and must not inspect `matchId` /
`matchdayFrom` to decide.

**Added to** `PoolDetail` in `packages/shared/src/types/index.ts` as a required
field, so a caller that forgets it fails to compile rather than silently rendering
the tab.

---

## `GET /api/pools/:poolId/stats` — new refusal

Unchanged for whole-competition pools and for anyone holding an unlock.

New behaviour: when the pool's scope does not offer statistics **and** the viewer
holds no unlock, the request is refused.

| Status | `error` | When |
|---|---|---|
| `404` | `SCOPE_UNSUPPORTED` | **NEW** — statistics are not offered for this pool's scope and the viewer has no unlock |
| `404` | `NOT_FOUND` | Pool does not exist (unchanged) |
| `404` | `NOT_MEMBER` | Viewer is not a member (unchanged, still checked first) |
| `200` | — | `{ unlocked: false, price, teaser }` or `{ unlocked: true, blocks }` (unchanged) |

Check order inside the use case: pool exists → membership → **unlock** → scope.
Putting the unlock lookup before the scope check is what makes the grandfather
exception work: a holder never reaches the scope gate.

---

## `POST /api/pools/:poolId/stats/unlock` — new refusal

| Status | `error` | When |
|---|---|---|
| `404` | `SCOPE_UNSUPPORTED` | **NEW** — no checkout is created for a pool that does not offer statistics |
| `409` | `ALREADY_UNLOCKED` | Viewer already holds an unlock (unchanged, still checked first) |
| `404` | `NOT_FOUND` / `NOT_MEMBER` | unchanged |
| `201` | — | Checkout created (unchanged for whole-competition pools) |

The refusal happens **before** the payment gateway is called, so no charge and no
`payment` row can be created for an unsupported pool.

`STATUS_MAP` in `apps/api/src/infrastructure/http/routes/stats.ts` gains
`SCOPE_UNSUPPORTED: 404`.
