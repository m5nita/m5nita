# Data Model: Telegram OTP

## New Table: `telegram_chat`

Maps phone numbers to Telegram chat IDs for OTP delivery.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `phone_number` | `text` | `PRIMARY KEY` | E.164 format (e.g., `+5511999998888`) |
| `chat_id` | `bigint` | `NOT NULL` | Telegram user's chat ID |
| `created_at` | `timestamp` | `NOT NULL DEFAULT now()` | When the mapping was created |
| `updated_at` | `timestamp` | `NOT NULL DEFAULT now()` | Last time the mapping was updated |

### Indexes
- Primary key on `phone_number` (implicit unique index)
- Index on `chat_id` for potential reverse lookups

### Relationships
- No foreign key to `user` table — the mapping exists independently so users can register with the bot before creating an account

### Operations
- **Upsert** on contact share: if phone already exists, update `chat_id` and `updated_at`
- **Lookup** on OTP send: find `chat_id` by `phone_number`
- **No deletes** in normal flow (could add `/stop` bot command later)

## Existing Tables (No Changes)

### `user` (Better Auth)
- `phone_number` field remains unchanged
- `phone_number_verified` field remains unchanged

### `verification` (Better Auth)
- OTP storage remains unchanged (managed by Better Auth phone-number plugin)

## Drizzle Schema

```typescript
import { bigint, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const telegramChat = pgTable('telegram_chat', {
  phoneNumber: text('phone_number').primaryKey(),
  chatId: bigint('chat_id', { mode: 'bigint' }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
```
