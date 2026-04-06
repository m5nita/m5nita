# Data Model: 007-fix-ux-scores-reminders

No new entities or schema changes required. This feature modifies only:

1. **API responses**: `getUserPools` will return both active and closed pools (previously filtered to active only)
2. **Environment**: New `APP_URL` env var for Telegram link generation
3. **UI state**: ScoreInput component renders additional visual elements from existing data

## Existing Entities Used (no changes)

- **Pool**: `status` field already supports `'active' | 'closed' | 'cancelled'`
- **PoolListItem**: Already includes `status: PoolStatus` field
- **Prediction**: Already has `homeScore`, `awayScore`, `points`
- **Match**: Already has `homeScore`, `awayScore`, `status`
