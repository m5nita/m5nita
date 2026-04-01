# Data Model: Multi-Competition Support

## New Entity: Competition

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Internal identifier |
| externalId | text | NOT NULL | football-data.org competition code (e.g., "PD", "WC") |
| name | text | NOT NULL | Display name (e.g., "La Liga", "Copa do Mundo 2026") |
| season | text | NOT NULL | Season identifier (e.g., "2025", "2026") |
| type | text | NOT NULL | "cup" or "league" |
| status | text | NOT NULL, default "active" | "active" or "finished" |
| featured | boolean | NOT NULL, default false | Controls visibility on home page and matches listing |
| createdAt | timestamp | NOT NULL, default now | Creation timestamp |
| updatedAt | timestamp | NOT NULL, default now | Last update timestamp |

**Uniqueness**: (externalId, season) must be unique.
**Indexes**: externalId, status.

## Modified Entity: Match

Added fields:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| competitionId | UUID | NOT NULL, FK -> competition.id | Competition this match belongs to |

**New index**: competitionId (for filtering matches by competition).
**Stage enum**: Add `'league'` to existing stages.

## Modified Entity: Pool

Added fields:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| competitionId | UUID | NOT NULL, FK -> competition.id | Competition this pool covers |
| matchdayFrom | integer | nullable | Start of matchday range (inclusive). Null = all matchdays |
| matchdayTo | integer | nullable | End of matchday range (inclusive). Null = all matchdays |

**New index**: competitionId.
**Validation**: If matchdayFrom is set, matchdayTo must also be set, and matchdayFrom <= matchdayTo.

## Relations

```
Competition 1──N Match      (competition.id -> match.competitionId)
Competition 1──N Pool       (competition.id -> pool.competitionId)
Pool        N──1 Competition (pool.competitionId -> competition.id)
Match       N──1 Competition (match.competitionId -> competition.id)
```

Existing relations (Pool -> Predictions -> Match, Pool -> PoolMembers, etc.) remain unchanged.

## State Transitions

### Competition

```
active ──> finished
```

A competition moves to "finished" when all its matches have status "finished". This is an informational status — pool closing is driven by per-pool match scope, not competition status.

### Pool Close Scope

A pool's "match scope" is defined as:
- All matches where `match.competitionId = pool.competitionId`
- AND (if matchdayFrom/matchdayTo are set): `match.matchday BETWEEN pool.matchdayFrom AND pool.matchdayTo`

The pool closes when ALL matches in its scope have `status = 'finished'`.

## Migration Plan

1. Create `competition` table
2. Insert seed competition: `{ externalId: "WC", name: "Copa do Mundo 2026", season: "2026", type: "cup", status: "active" }`
3. Add `competitionId` column to `match` (nullable)
4. Add `competitionId`, `matchdayFrom`, `matchdayTo` columns to `pool` (nullable)
5. Update all existing matches: `SET competitionId = <wc_competition_id>`
6. Update all existing pools: `SET competitionId = <wc_competition_id>`
7. Alter `match.competitionId` to NOT NULL
8. Alter `pool.competitionId` to NOT NULL
9. Add indexes on `match.competitionId` and `pool.competitionId`
