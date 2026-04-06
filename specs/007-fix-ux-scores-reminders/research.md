# Research: 007-fix-ux-scores-reminders

## R-001: ScoreInput locked state display

**Decision**: When match is locked (live/finished), show user's prediction as primary element and real score as secondary element above.

**Rationale**: The `ScoreInput` component (lines 104, 114) replaces prediction with actual score via ternary: `isLocked && actualHomeScore != null ? actualHomeScore : home`. The fix requires removing this swap and adding a new real-score row above. The component already receives both `homeScore`/`awayScore` (prediction) and `actualHomeScore`/`actualAwayScore` (real) as separate props.

**Alternatives considered**: Tooltip showing prediction on hover (poor mobile UX), side-by-side cards (too wide for mobile layout).

## R-002: Pool status for finished pools

**Decision**: Use existing `PoolStatus = 'active' | 'closed' | 'cancelled'` type. Finished/closed pools (`status === 'closed'`) should be included in `getUserPools` response alongside active pools.

**Rationale**: The pool schema uses 'closed' (not 'finished') for completed competitions. The filter at `pool.ts:105` (`m.pool.status === 'active'`) just needs to be changed to `m.pool.status !== 'cancelled'` to include closed pools.

**Alternatives considered**: Adding a 'finished' status to PoolStatus (unnecessary complexity, 'closed' already serves this purpose).

## R-003: APP_URL for Telegram links

**Decision**: Add `APP_URL` environment variable to API config for generating direct links in Telegram messages.

**Rationale**: No centralized app URL config exists. Frontend uses `window.location.origin` (browser-only). The InviteTicket component demonstrates this pattern. For server-side Telegram messages, we need an env var.

**Alternatives considered**: Hardcoding URL (inflexible), deriving from BETTER_AUTH_URL (different service).

## R-004: Reminder message grouping

**Decision**: Restructure reminder loop to group matches per user per pool, sending one message per pool.

**Rationale**: Current loop is pool → match → users. Need to collect per-user-per-pool data first, then send grouped messages. The `activePool.name` field is available from the `db.query.pool.findMany` result since Drizzle returns full schema objects.

**Alternatives considered**: Keeping per-match messages with pool name added (more messages, worse UX per clarification decision).

## R-005: Scoring rule example correction

**Decision**: Change 5-point example from "Palpite 1×0, resultado 3×2" to "Palpite 1×0, resultado 3×0".

**Rationale**: The scoring logic at `scoring.ts:14-19` checks `predictedDiff === actualDiff` for 7 points. Prediction 1-0 (diff=1) vs result 3-2 (diff=1) → same diff → 7 points, not 5. New example: 1-0 (diff=1) vs 3-0 (diff=3) → different diff, same winner → 5 points.
