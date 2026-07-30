# Phase 1 Data Model: no changes

**No migration.** No table is created, altered, backfilled or cleaned up. The
feature is a read-side rule over data that already exists.

## What is read

| Source | Columns | Used for |
|---|---|---|
| `pool` | `matchday_from`, `matchday_to`, `match_id` | Reconstructing `PoolScope`, whose kind decides whether statistics are offered |
| `stats_unlock` | `(user_id, pool_id)` | The grandfather exception — a viewer who already paid keeps access |

The `stats_unlock` lookup is the existing `StatsUnlockRepository.isUnlocked`,
already backed by a unique index on `(user_id, pool_id)`.

## What is deliberately left alone

- **`stats_unlock` rows** — no deletion, no refund flag, no change. The 2 records
  on matchday-range pools keep granting access (FR-002, FR-008).
- **`participant_pool_stats` snapshots** — rows already stored for shorter pools
  stay. They are written on demand when the panel is opened, so with the tab gone
  nothing reads or refreshes them; deleting them would be a migration for no gain.
- **`payment` rows of type `stats_unlock`** — untouched. No new ones will be
  created for non-whole-competition pools (FR-007), and existing ones remain valid
  history.

## Derived value added to the API payload

| Field | Type | Where | Meaning |
|---|---|---|---|
| `statsAvailable` | `boolean` | `PoolDetail` (`GET /api/pools/:poolId`) | Resolved **for the requesting viewer**: the pool's scope offers statistics, or this viewer already holds an unlock |

It is computed, never stored. Two viewers of the same pool can legitimately
receive different values — that is the grandfather exception in action.

## Domain mapping

| Concept | Home |
|---|---|
| "does this scope carry meaningful per-participant statistics" | `PoolScope.supportsParticipantStats()` |
| same question asked of a pool | `Pool.supportsParticipantStats()` (delegates) |
| "statistics are not offered here" | `StatsError('SCOPE_UNSUPPORTED')` → HTTP `404` |
