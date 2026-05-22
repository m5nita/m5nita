# Phase 1 — Data Model

## Entities

### Pool (existing — updated)

| Field | Type | Constraint | Notes |
|---|---|---|---|
| id | uuid | PK | Unchanged. |
| name | text | NOT NULL | Unchanged. |
| entry_fee | int (centavos BRL) | NOT NULL | Unchanged. |
| owner_id | text | FK → user.id | Unchanged. |
| invite_code | text | UNIQUE NOT NULL | Unchanged. |
| competition_id | uuid | FK → competition.id NOT NULL | Unchanged. |
| coupon_id | uuid | FK → coupon.id, NULL | Unchanged. |
| matchday_from | int | NULL | Existing — half of range scope. |
| matchday_to | int | NULL | Existing — half of range scope. |
| **match_id** | **uuid** | **FK → match.id, NULL** | **NEW** — single-match scope target. |
| is_open | boolean | NOT NULL DEFAULT true | Unchanged. |
| status | text | NOT NULL DEFAULT 'active' | Unchanged. |
| created_at, updated_at | timestamp | NOT NULL | Unchanged. |

**New constraint** (table-level CHECK, called `pool_scope_exclusivity_chk`):

```sql
CHECK (
  (
    (match_id IS NOT NULL)::int
    + ((matchday_from IS NOT NULL) OR (matchday_to IS NOT NULL))::int
  ) <= 1
)
```

Meaning: a pool has at most one explicit scope. All three NULL = "whole competition" (existing semantics, kept).

**New index**: `CREATE INDEX pool_match_id_idx ON pool(match_id);` to support reverse lookups (e.g., "which pools target match X") used by reminders and ranking.

---

### Match (existing — unchanged)

Fields already exposed and relied upon:

- `id uuid`
- `competition_id uuid`
- `matchday int NULL` (populated for league competitions)
- `stage text NULL` (populated for cup competitions; e.g., `ROUND_OF_16`, `SEMI_FINALS`, `FINAL`)
- `kickoff_at timestamp`
- `status text` (`SCHEDULED`, `TIMED`, `IN_PLAY`, `FINISHED`, `POSTPONED`, `CANCELLED`, …)
- `home_team`, `away_team`
- `home_score`, `away_score` (NULL until finished)

No schema changes to `match`.

---

## Domain value objects

### `PoolScope` (NEW — `apps/api/src/domain/shared/PoolScope.ts`)

A discriminated union value object representing the pool's prediction surface.

```ts
type PoolScopeKind = 'whole-competition' | 'range' | 'single-match'

class PoolScope {
  readonly kind: PoolScopeKind
  readonly range: MatchdayRange | null      // present when kind = 'range'
  readonly matchId: string | null           // present when kind = 'single-match'

  static wholeCompetition(): PoolScope
  static fromRange(range: MatchdayRange): PoolScope
  static singleMatch(matchId: string): PoolScope

  /** Build from raw DB columns; enforces mutual exclusivity. */
  static fromRow(args: {
    matchdayFrom: number | null
    matchdayTo: number | null
    matchId: string | null
  }): PoolScope

  /** Does this match belong to this pool's prediction surface? */
  contains(match: { id: string; matchday: number | null }): boolean

  /** Stable single-match id if this scope targets exactly one match. */
  singleMatchIdOrNull(): string | null
}
```

**Validation rules**:
- `fromRow` rejects any combination where both `matchId !== null` and (`matchdayFrom !== null` or `matchdayTo !== null`) — guards the same invariant the DB CHECK enforces.
- `singleMatch(matchId)` rejects empty / non-UUID `matchId`.
- `contains` semantics:
  - `kind = 'whole-competition'` → `true` for any match.
  - `kind = 'range'` → `match.matchday !== null && range.contains(match.matchday)`.
  - `kind = 'single-match'` → `match.id === this.matchId`.

100% unit-test coverage required (Principle II).

---

### `MatchdayRange` (existing — unchanged)

Reused as-is. `PoolScope.fromRange` wraps it.

---

## Domain entity update

### `Pool` (updated)

- Remove field `matchdayRange: MatchdayRange | null`.
- Add field `scope: PoolScope` (non-null).
- Constructor signature changes accordingly; callers updated.
- Behavior already on `Pool` (`activate`, `close`, `canJoin`, `canAcceptPredictions`, `isOwnedBy`, `calculatePrize`, `calculatePlatformFee`) is unchanged.

---

## Mapper update

`PoolMapper` (`apps/api/src/infrastructure/persistence/mappers/PoolMapper.ts`):

- Read: build `PoolScope.fromRow({ matchdayFrom, matchdayTo, matchId })`.
- Write: project `scope` back to three DB columns by case:
  - `whole-competition` → `(matchdayFrom: null, matchdayTo: null, matchId: null)`
  - `range` → `(matchdayFrom: range.from, matchdayTo: range.to, matchId: null)`
  - `single-match` → `(matchdayFrom: null, matchdayTo: null, matchId: scope.matchId)`

---

## State transitions

No new pool state transitions. The scope itself is **immutable after creation** (FR-014). No setters on `Pool.scope`.

The chosen match's lifecycle (postponed → re-kickoff, cancelled, finished) drives the same downstream behavior already used by multi-match pools — no new states added to `Pool`.

---

## Migration plan

1. Generate Drizzle migration adding:
   - `match_id uuid REFERENCES match(id)` (nullable, no default)
   - `pool_match_id_idx` index
   - `pool_scope_exclusivity_chk` CHECK constraint
2. Backfill: not required — existing rows have `match_id = NULL` and continue to behave as range or whole-competition pools.
3. Rollback: drop CHECK, index, then column. Safe since no existing data depends on the column.

---

## Touchpoints in existing code (informational; no schema impact)

Consumers that today inspect `pool.matchdayRange` (or raw `matchdayFrom`/`matchdayTo`) and must be updated to use `pool.scope`:

- `application/prediction/GetUserPredictionsUseCase.ts` — filter via `scope.contains(match)`.
- `infrastructure/persistence/DrizzlePoolRepository.ts` — ranking + freeze queries need the `match_id` branch in their `WHERE` clauses (single OR over `match.id = pool.match_id` next to the existing range OR).
- `infrastructure/http/routes/ranking.ts` and the live-match probe — use `scope`.
- `jobs/closePoolsJob.ts` and `jobs/reminderJob.ts` — filter relevant matches using `scope`.
- `services/pool.ts` legacy path — if still used by any caller, port it or remove (CLAUDE.md "no dead code").
