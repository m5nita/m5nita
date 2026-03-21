# Data Model: Critical Fixes + Telegram Prediction Reminders

## Existing Entities (no changes)

### match
| Field | Type | Notes |
|-------|------|-------|
| id | uuid PK | |
| homeTeam | text | null for TBD knockout matches |
| awayTeam | text | null for TBD knockout matches |
| matchDate | timestamp | kickoff time |
| status | text | scheduled, live, finished, postponed, cancelled |

### pool_member
| Field | Type | Notes |
|-------|------|-------|
| id | uuid PK | |
| poolId | uuid FK -> pool | |
| userId | uuid FK -> user | |
| Unique | (poolId, userId) | |

### prediction
| Field | Type | Notes |
|-------|------|-------|
| id | uuid PK | |
| userId | uuid FK -> user | |
| poolId | uuid FK -> pool | |
| matchId | uuid FK -> match | |
| Unique | (userId, poolId, matchId) | |

### user
| Field | Type | Notes |
|-------|------|-------|
| id | text PK | |
| phoneNumber | text (unique) | E.164 format |

### telegram_chat
| Field | Type | Notes |
|-------|------|-------|
| phoneNumber | text PK | E.164 format, maps to user.phoneNumber |
| chatId | bigint | Telegram chat ID for messaging |

## New In-Memory Structure

### sentReminders (Set)
| Key Format | Example | Purpose |
|------------|---------|---------|
| `${userId}:${matchId}` | `abc123:def456` | Prevents duplicate reminders per user per match |

- Max size: ~64K entries (64 matches x 1000 users)
- Memory: ~2MB
- Lifecycle: grows monotonically, never cleared (entries become irrelevant after match starts)
- Persistence: none (resets on process restart)

## Query Pattern: Users Without Predictions

```
pool_member
  INNER JOIN user ON user.id = pool_member.userId
  LEFT JOIN prediction ON (
    prediction.userId = pool_member.userId
    AND prediction.poolId = pool_member.poolId
    AND prediction.matchId = <target_match_id>
  )
WHERE prediction.id IS NULL
  AND user.phoneNumber IS NOT NULL
DISTINCT ON (pool_member.userId)
```

Returns: userId + phoneNumber for users in any pool who have not predicted the target match.
