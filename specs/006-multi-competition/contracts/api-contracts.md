# API Contracts: Multi-Competition Support

## New Endpoints

### GET /api/competitions

List active competitions with future matches. Used by pool creation UI.

**Auth**: Required
**Response 200**:
```json
{
  "competitions": [
    {
      "id": "uuid",
      "externalId": "PD",
      "name": "La Liga",
      "season": "2025",
      "seasonDisplay": "2025/2026",
      "type": "league",
      "status": "active",
      "featured": true,
      "matchCount": 380,
      "upcomingMatchCount": 120,
      "matchdays": { "min": 1, "max": 38, "nextMatchday": 30 }
    }
  ]
}
```

**Notes**:
- `matchdays` is only present for league-type competitions. `nextMatchday` is the first matchday with scheduled matches.
- `seasonDisplay` is derived from match dates: "YYYY/YYYY" for leagues spanning two calendar years, "YYYY" for single-year competitions.
- `featured` indicates whether the competition appears on public pages (home, matches listing).

## Modified Endpoints

### POST /api/pools (Create Pool)

**New fields in request body**:
```json
{
  "name": "Bolao La Liga",
  "entryFee": 100,
  "competitionId": "uuid",
  "matchdayFrom": 30,
  "matchdayTo": 30,
  "couponCode": "SAVE50"
}
```

- `competitionId`: Required. UUID of the selected competition.
- `matchdayFrom`: Optional. Start of matchday range (league only).
- `matchdayTo`: Optional. End of matchday range (league only).

**Response 201**: Same as current, with added competition info:
```json
{
  "pool": {
    "id": "uuid",
    "name": "Bolao La Liga",
    "competitionId": "uuid",
    "competitionName": "La Liga",
    "matchdayFrom": 30,
    "matchdayTo": 30,
    "...": "existing fields"
  },
  "payment": { "...": "existing fields" }
}
```

### GET /api/pools

**Response**: Pool list items now include `competitionName`.

### GET /api/pools/:poolId

**Response**: Pool detail now includes `competitionId`, `competitionName`, `matchdayFrom`, `matchdayTo`.

### GET /api/matches

**New query parameters**:
- `competitionId` (optional UUID). Filters matches by competition.
- `featured` (optional, "true"). When set and no competitionId provided, filters matches to only featured competitions.

**Existing filters**: `stage`, `group`, `status` continue to work, combined with `competitionId`/`featured` via AND.

### GET /api/pools/:poolId/predictions

**Behavior change**: Returns predictions only for matches within the pool's scope (competition + matchday range). Currently returns all predictions for the pool; the service layer now filters matches by pool scope.

### GET /api/pools/invite/:inviteCode

**Response**: Now includes `competitionName`, `matchdayFrom`, `matchdayTo`.

## Telegram Bot Commands

### /competicao_criar CODE "Name" SEASON TYPE

Create a new competition. Admin only.

**Args**:
- `CODE`: football-data.org competition code (e.g., PD, WC, CL)
- `Name`: Display name (quoted if contains spaces)
- `SEASON`: Season year (e.g., 2025, 2026)
- `TYPE`: "cup" or "league"

**Success response**: "Competicao criada!\n\nCodigo: PD\nNome: La Liga\nTemporada: 2025\nTipo: league"

**Error responses**: "Competicao ja existe", "Tipo invalido (use 'cup' ou 'league')"

### /competicao_listar

List all competitions. Admin only.

**Response**: Table with code, name, season, type, status, match count.

### /competicao_desativar CODE SEASON

Deactivate a competition. Admin only. Existing pools keep working.

**Success response**: "Competicao PD 2025 desativada."

### /competicao_destacar CODE SEASON

Toggle featured status of a competition. Admin only.

**Args**:
- `CODE`: Competition code (e.g., PD, WC)
- `SEASON`: Season year (e.g., 2025, 2026)

**Success response**: "Competicao PD 2025 destacada." or "Competicao PD 2025 removida dos destaques."

### /competicao_listar (updated)

Now shows `[Destaque]` label next to featured competitions in the list.
