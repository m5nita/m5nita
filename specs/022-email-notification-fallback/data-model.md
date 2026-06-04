# Phase 1 Data Model: Email fallback for Telegram notifications

**No database entities or migrations.** This feature reads existing `user` columns and
only reshapes in-memory DTOs that cross the `NotificationService` port and the
`PoolRepository` port. The "model" here is those data carriers.

## Existing data read (no changes)

`user` table (Better Auth): `phone_number` (nullable, unique), `email` (nullable),
`email_verified` (boolean). Telegram link is derived at runtime via `findChatIdByPhone`.

## Application-port DTOs

### `ReminderData` (was Telegram-coupled → channel-agnostic)

| Field | Type | Notes |
|-------|------|-------|
| `userName` | `string \| null` | for email greeting |
| `phoneNumber` | `string \| null` | used to resolve a Telegram chat |
| `email` | `string \| null` | **verified email only**, else null |
| `poolName` | `string` | |
| `poolId` | `string` | used to build the predictions link |
| `matches` | `Array<{ homeTeam: string; awayTeam: string; minutesUntil: number }>` | unchanged shape |

Removed: `chatId: number` (Telegram detail no longer leaks onto the DTO).

### `WinnerInfo` (gains email)

| Field | Type | Notes |
|-------|------|-------|
| `name` | `string \| null` | existing |
| `phoneNumber` | `string \| null` | existing |
| `email` | `string \| null` | **NEW** — verified email only, else null |

`notifyWinners(poolName, winners, prizeShare)` signature is unchanged; only `WinnerInfo`
grows a field.

## Repository-port DTO

### `PoolMemberWithPhone` → `PoolMemberWithContact`

| Field | Type | Notes |
|-------|------|-------|
| `userId` | `string` | existing |
| `name` | `string \| null` | existing (`PoolMemberInfo`) |
| `phoneNumber` | `string \| null` | existing |
| `email` | `string \| null` | **NEW** |
| `emailVerified` | `boolean` | **NEW** |

Method rename: `PoolRepository.getMembersWithPhone(poolId)` →
`getMembersWithContact(poolId)`. Only production caller is `closePoolsJob`; test mocks
updated accordingly.

## Eligibility derivation (data edges)

- **Reminder candidates** (`reminderJob` query): pool members missing a prediction whose
  user has `phone_number IS NOT NULL` **OR** (`email_verified = true` AND `email IS NOT
  NULL`). The job sets `email` on `ReminderData` to the address **only when verified**, else
  `null`.
- **Winner contacts** (`closePoolsJob`): maps each winner to
  `email = (emailVerified && email) ? email : null`.

## Routing rule (consumed by CompositeNotificationService)

For each `ReminderData` / `WinnerInfo`:

```
chatId = phoneNumber ? await findChatIdByPhone(phoneNumber) : null
if (chatId)      → Telegram transport
else if (email)  → email send
else             → skip (debug log)
```
