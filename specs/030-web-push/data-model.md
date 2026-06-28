# Phase 1 Data Model: Web Push Notifications (PWA)

Two new additive Postgres tables (migration `0015`). No existing tables are altered. Plus
in-code DTO/port additions (no storage) for routing.

---

## Table: `push_subscription`

One row per browser/device that has enabled push for a user. A user may have many.

| Column        | Type        | Constraints                                   | Notes |
|---------------|-------------|-----------------------------------------------|-------|
| `id`          | `uuid`      | PK, `$defaultFn(() => crypto.randomUUID())`   | trace id |
| `user_id`     | `text`      | NOT NULL, FK → `user.id`                       | owner (Better Auth text id) |
| `endpoint`    | `text`      | NOT NULL, **UNIQUE**                            | push service URL; natural device key |
| `p256dh`      | `text`      | NOT NULL                                       | client public key (subscription `keys.p256dh`) |
| `auth`        | `text`      | NOT NULL                                       | client auth secret (subscription `keys.auth`) |
| `user_agent`  | `text`      | NULLABLE                                        | optional device label for `/settings` |
| `created_at`  | `timestamp` | NOT NULL, DEFAULT now()                         | |

**Indexes**: UNIQUE on `endpoint` (de-dupe / idempotent upsert target);
index on `user_id` (FK lookup hot path — `findByUserId` on every routed event).

**Lifecycle / rules**:
- **Upsert by `endpoint`** on subscribe (`onConflictDoUpdate` → refresh `user_id`,
  `p256dh`, `auth`, `user_agent`): idempotent re-enable (FR-008); also re-homes an endpoint
  if a device is reused by another account.
- **Delete by `endpoint`** on explicit opt-out (FR-005).
- **Delete by `endpoint`** when the push service returns `404`/`410 Gone` during send
  (FR-010 dead-subscription pruning).
- Belongs to an authenticated user; never created without a session (FR-009).

**Drizzle sketch** (`apps/api/src/db/schema/pushSubscription.ts`):

```ts
export const pushSubscription = pgTable(
  'push_subscription',
  {
    id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => user.id),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('push_subscription_endpoint_idx').on(t.endpoint),
    index('push_subscription_user_id_idx').on(t.userId),
  ],
)
```

---

## Table: `match_points_notified`

Durable at-most-once marker for the "pontos conquistados" push (FR-017). Mirrors
`stats_unlock`'s idempotent-marker pattern.

| Column        | Type        | Constraints                                  | Notes |
|---------------|-------------|----------------------------------------------|-------|
| `id`          | `uuid`      | PK, `$defaultFn(() => crypto.randomUUID())`  | trace id |
| `user_id`     | `text`      | NOT NULL, FK → `user.id`                      | recipient |
| `pool_id`     | `uuid`      | NOT NULL, FK → `pool.id`                      | scoring context |
| `match_id`    | `uuid`      | NOT NULL, FK → `match.id`                     | finished match |
| `notified_at` | `timestamp` | NOT NULL, DEFAULT now()                        | |

**Indexes**: UNIQUE composite on (`user_id`, `pool_id`, `match_id`) — the idempotency gate.

**Lifecycle / rules**:
- Insert with `onConflictDoNothing({ target: [user_id, pool_id, match_id] }).returning()`.
  A non-empty result ⇒ "newly recorded" ⇒ proceed to send; empty ⇒ already notified ⇒ skip.
- Written immediately before the push send attempt (within the per-recipient delivery).
- Append-only in v1 (no deletes); a score correction after first finalization does **not**
  re-notify (edge case in spec).

**Drizzle sketch** (`apps/api/src/db/schema/matchPointsNotified.ts`):

```ts
export const matchPointsNotified = pgTable(
  'match_points_notified',
  {
    id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull().references(() => user.id),
    poolId: uuid('pool_id').notNull().references(() => pool.id),
    matchId: uuid('match_id').notNull().references(() => match.id),
    notifiedAt: timestamp('notified_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('match_points_notified_user_pool_match_idx').on(t.userId, t.poolId, t.matchId),
  ],
)
```

Both tables are exported from `apps/api/src/db/schema/index.ts`.

---

## In-code types (no storage)

### Domain — `domain/push/PushSubscription.ts`

A plain delivery record (pragmatic-scope: no business behavior, so not a value object):

```ts
export type PushSubscription = {
  id: string
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  userAgent: string | null
  createdAt: Date
}
```

### Domain port — `domain/push/PushSubscriptionRepository.port.ts`

```ts
export interface PushSubscriptionRepository {
  upsert(input: {
    userId: string
    endpoint: string
    p256dh: string
    auth: string
    userAgent: string | null
  }): Promise<void>                                   // idempotent by endpoint (FR-008)
  findByUserId(userId: string): Promise<PushSubscription[]>   // routing (FR-012)
  deleteByEndpoint(userId: string, endpoint: string): Promise<void>  // opt-out (FR-005)
  deleteByEndpoints(endpoints: string[]): Promise<void>      // dead-sub pruning (FR-010)
}
```

(Reminder eligibility uses a direct `EXISTS` subquery in `reminderJob`, not a port method.)

### Application port additions — `application/ports/NotificationService.port.ts`

```ts
export interface WinnerInfo {
  userId: string            // ADDED (routing lookup)
  name: string | null
  phoneNumber: string | null
  email: string | null
}

export interface ReminderData {
  userId: string            // ADDED
  userName: string | null
  phoneNumber: string | null
  email: string | null
  poolName: string
  poolId: string
  matches: ReminderMatch[]
}

export interface MatchPointsData {   // NEW (push-only in v1)
  userId: string
  poolId: string
  poolName: string
  matchId: string
  homeTeam: string
  awayTeam: string
  points: number            // points earned for THIS match in THIS pool
  position: number          // resulting rank in the pool
}

export interface NotificationService {
  notifyWinners(poolName: string, winners: WinnerInfo[], prizeShare: number): Promise<void>
  notifyAdminWithdrawalRequest(params: AdminWithdrawalRequestNotification): Promise<void>
  sendPredictionReminders(reminders: ReminderData[]): Promise<void>
  notifyMatchPoints(items: MatchPointsData[]): Promise<void>   // NEW
}
```

### Shared DTO/schema — `packages/shared/src/schemas`

```ts
export const subscribePushSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
})
export type SubscribePushPayload = z.infer<typeof subscribePushSchema>
```

---

## Relationships

```
user (1) ──< push_subscription (N)            # many devices per user
user (1) ──< match_points_notified (N)        # one per (user, pool, match) pontos send
pool (1) ──< match_points_notified (N)
match (1) ──< match_points_notified (N)
```

No changes to `pool`, `match`, `prediction`, `poolMember`, `user`, `telegram_chat`.
"Points earned" and "position" are **read** from existing per-prediction `points`
(written by `calcPointsForMatch`) and the recomputed ranking — no new scoring storage.
