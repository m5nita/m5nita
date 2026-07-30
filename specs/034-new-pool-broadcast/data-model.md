# Phase 1 Data Model: notification catalog, preferences, and the pool flag

All changes are **additive**. One migration: `0016_notification_preferences`.

> ⚠️ Per `CLAUDE.md`, after generating the migration bump its `when` timestamp in
> `apps/api/drizzle/meta/_journal.json` above the previous entry — boot-time
> migrate applies journal order, and a lower timestamp is silently skipped in
> production.

## 1. `notification_type` (new — catalog)

The set of notifications the product can send, and how each behaves.

| Column | Type | Constraints | Meaning |
|---|---|---|---|
| `code` | `text` | **PK** | Stable identity used by code (`new_pool`, …). Never renamed. |
| `label` | `text` | `not null` | pt-BR title shown in settings. |
| `description` | `text` | `not null` | pt-BR one-liner explaining what it controls. |
| `opt_outable` | `boolean` | `not null default true` | `false` → always delivered, rendered locked. |
| `default_enabled` | `boolean` | `not null default true` | Resolved state when the user has no override row. |
| `sort_order` | `integer` | `not null` | Display order in settings. |

**Seed rows** (inserted by the migration, `ON CONFLICT (code) DO NOTHING` so a
re-run is safe):

| code | label | description | opt_outable | default_enabled | sort_order |
|---|---|---|---|---|---|
| `new_pool` | Novos bolões | Avisos quando alguém cria um bolão novo e libera a entrada. | `true` | `true` | 1 |
| `prediction_reminder` | Lembretes de palpite | Aviso quando um jogo do seu bolão está perto de começar e falta palpite. | `true` | `true` | 2 |
| `match_points` | Pontos por jogo | Quantos pontos você fez ao final de cada jogo e sua posição no bolão. | `true` | `true` | 3 |
| `pool_result` | Prêmio disponível | Aviso de vitória e prêmio disponível para saque. | `false` | `true` | 4 |

**Read pattern**: full table scan of 4 rows, cached in process. Primary key is the
only access path needed.

## 2. `notification_preference` (new — overrides only)

One row **only** where a user diverged from the catalog default.

| Column | Type | Constraints | Meaning |
|---|---|---|---|
| `user_id` | `text` | **PK part**, FK → `user.id` `on delete cascade` | Owner of the choice. |
| `type_code` | `text` | **PK part**, FK → `notification_type.code` | Which notification. |
| `enabled` | `boolean` | `not null` | The user's explicit choice. |
| `updated_at` | `timestamp` | `not null default now()` | When they last changed it. |

- **Composite primary key** `(user_id, type_code)` — also the upsert conflict
  target and the exact index the two read paths need:
  - single user: `where user_id = $1` (prefix scan on the PK)
  - broadcast: `where user_id = any($1)` (one query for all recipients)
- No separate index is added; a `user_id`-leading composite PK already covers both.
- `on delete cascade` from `user` keeps the table clean when an account is removed.
- Absence of a row is **not** an error state — it is the common case and means
  "catalog default".

### Why no `notification_channel` dimension

Preferences are per **type**, not per (type, channel). The requester asked for
"what do I want to receive", and the composite already picks exactly one channel
per person. A channel dimension would multiply rows and force the UI to explain a
routing rule users never see.

## 3. `pool.notify_on_create` (new column)

| Column | Type | Constraints | Meaning |
|---|---|---|---|
| `notify_on_create` | `boolean` | `not null default false` | The creator asked for the base to be told, at creation time. |

- Default `false` means every one of the 29 existing pools is correct without a
  backfill, and matches the unchecked-by-default checkbox (FR-001).
- It is **intent**, not status: it is never cleared after the announcement. The
  at-most-once guarantee comes from the payment CAS, not from this column
  (research Decision 1), so there is no `announced_at` to keep in sync.
- No index: it is only ever read by primary key together with the rest of the pool
  row.

## Domain mapping

| Table / column | Domain object |
|---|---|
| `notification_type` row | `NotificationType` VO — `code`, `label`, `description`, `optOutable`, `defaultEnabled`, `sortOrder`, plus the behaviour `resolveEnabled(override)` and `canBeDisabled()` |
| `notification_type.code` | `NotificationTypeCode` — closed union, validated at the HTTP boundary |
| catalog + a user's override rows | `NotificationPreferences` VO — `allows(code)`, `list()` |
| `pool.notify_on_create` | `Pool.notifyOnCreate` (readonly state, trailing optional constructor argument defaulting to `false` so existing construction sites are untouched) |

### The one invariant that must not live in the data

```text
resolveEnabled(override) = optOutable ? (override ?? defaultEnabled) : true
```

A stored `enabled = false` for a non-opt-outable type **cannot** suppress delivery.
This is enforced in `NotificationType`, not by a database constraint, so it holds
for rows written before a type's `opt_outable` flag changed.

## Query inventory (all new reads)

| Purpose | Shape | Cost |
|---|---|---|
| Catalog | `select * from notification_type order by sort_order` | 4 rows, cached in process |
| One user's overrides (settings screen, single notification) | `select type_code, enabled from notification_preference where user_id = $1` | PK prefix scan |
| Overrides for a whole broadcast | `select user_id, type_code, enabled from notification_preference where user_id = any($1)` | one query for all recipients |
| Toggle | `insert … on conflict (user_id, type_code) do update set enabled, updated_at` | single row upsert |
| Broadcast audience | `select id, phone_number from "user" where id <> $1` | 58 rows today, no join |

Total cost of one broadcast: **2 queries**, independent of recipient count.
