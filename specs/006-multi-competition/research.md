# Research: Multi-Competition Support

## R1: football-data.org Multi-Competition API

**Decision**: Use the same API pattern for all competitions, changing only the competition code and season.

**Rationale**: The football-data.org API uses a consistent URL pattern: `/competitions/{CODE}/matches?season={YEAR}`. La Liga uses code `PD`, World Cup uses `WC`. The response format (`matches[]` with `id`, `utcDate`, `status`, `stage`, `homeTeam`, `awayTeam`, `score`) is identical across competitions.

**Alternatives considered**:
- Using a different API provider: Rejected, football-data.org is already integrated and working.
- Fetching all competitions in one call: Not supported by the API.

## R2: Rate Limiting Strategy for Multiple Competitions

**Decision**: Space API calls with a 6-second delay between competitions during fixture sync. For live scores, fetch only competitions that have matches today.

**Rationale**: football-data.org free tier allows 10 requests per minute. With 5 concurrent competitions, fixture sync needs 5 calls (1 per competition) plus 10 calls for live scores (2 per competition: LIVE + FINISHED). Spacing by 6 seconds keeps us well within the 10 req/min limit. Live score sync only queries competitions with matches scheduled for today.

**Alternatives considered**:
- Paid API tier: Unnecessary for current scale.
- Single combined query: Not supported by the API.

## R3: Matchday Filter Storage (Pool-level)

**Decision**: Store `matchdayFrom` and `matchdayTo` as nullable integer columns on the `pool` table. When both are null, the pool covers all matches in the competition.

**Rationale**: Per the clarification session, each pool owner chooses which matchdays to cover. This enables creating multiple pools for the same competition covering different rounds. For cup competitions (World Cup), these fields remain null since all matches are included.

**Alternatives considered**:
- Store on competition entity: Rejected, limits flexibility (all pools would see the same matchday range).
- Many-to-many pool-match relation: Over-engineered for filtering by sequential matchday numbers.

## R4: Stage Mapping for League Competitions

**Decision**: Add `'league'` to the `MATCH.STAGES` constant. When syncing a league-type competition, all matches get `stage: 'league'` regardless of the API's stage field. The `matchday` field provides the round number.

**Rationale**: League competitions don't have knockout stages. The existing stage enum (`group`, `round-of-16`, etc.) is designed for cup tournaments. A dedicated `'league'` stage makes it clear that match grouping is by matchday, not by tournament phase. The `mapStage()` function will check the competition type before mapping.

**Alternatives considered**:
- Reuse `'group'` stage: Semantically incorrect and confusing in the UI.
- No stage field for leagues: Would require nullable stage, breaking existing code.

## R5: Data Migration Strategy

**Decision**: Create a Drizzle migration that: (1) creates the `competition` table, (2) inserts a "Copa do Mundo 2026" record with code "WC", season "2026", type "cup", (3) adds `competitionId` column to `match` and `pool` tables as nullable, (4) updates all existing records to point to the WC competition, (5) makes `competitionId` NOT NULL.

**Rationale**: This is a safe, atomic migration that preserves all existing data. The nullable-then-update-then-not-null pattern avoids constraint violations during migration.

**Alternatives considered**:
- Clean slate (drop and recreate): Rejected by user, wants to preserve existing data.
- Separate migration steps: Unnecessary complexity, single migration is safe.

## R6: Competition Admin via Telegram

**Decision**: Add Telegram bot commands following the existing coupon pattern:
- `/competicao_criar CODE "Name" SEASON TYPE` - Create competition
- `/competicao_listar` - List all competitions
- `/competicao_desativar CODE` - Deactivate a competition

**Rationale**: Consistent with the existing admin command pattern (`/cupom_criar`, `/cupom_listar`, `/cupom_desativar`). Admin-only, same `isAdmin()` check.

**Alternatives considered**:
- Web admin UI: Out of scope, adds significant frontend work for a rare admin action.
- Direct database manipulation: Not user-friendly, error-prone.

## R7: Pool Close Logic Refactoring

**Decision**: Replace the current "check if ANY match is unfinished" global check with a per-pool check: for each active pool, query if all matches within its scope (competition + matchday range) are finished. If so, close that pool.

**Rationale**: The current `closePoolsIfAllMatchesFinished()` checks ALL matches globally. With multiple competitions, La Liga matches finishing shouldn't close World Cup pools. The new logic queries matches filtered by `competitionId` and `matchday` range per pool.

**Alternatives considered**:
- Competition-level closing (close all pools of a competition at once): Doesn't work with per-pool matchday ranges.
- Event-driven closing (match finish event triggers pool check): Current approach already triggers from match sync, just needs scoping.
