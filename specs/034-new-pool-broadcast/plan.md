# Implementation Plan: "Novo bolão" broadcast + per-type notification preferences

**Branch**: `034-new-pool-broadcast` | **Date**: 2026-07-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/034-new-pool-broadcast/spec.md`

## Summary

A pool creator may tick *"avisar todo mundo do m5nita sobre este bolão"*. The
intent is stored on the pool (`pool.notify_on_create`). When the entry payment is
confirmed and the pool is activated, `CompleteCheckoutUseCase` — after its unit of
work commits — calls a new `AnnounceNewPoolUseCase`, which loads the pool detail,
builds the scope wording from `PoolScope`, resolves every user except the creator,
and hands the batch to `NotificationService.notifyNewPool`. The existing
`CompositeNotificationService` stays the single channel router: push across all of
the user's devices, Telegram only when push did not deliver, never email for this
type.

That router also becomes the single place a **notification preference** is
checked. Preferences are modelled as a catalog table (`notification_type`) plus one
override row per `(user, type)` (`notification_preference`), so a future toggle is
one `INSERT` — no DDL, no front-end change. A new `/settings` section renders
whatever the catalog holds; the non-opt-outable "prêmio disponível" type renders as
a locked row.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node.js ≥ 22
**Primary Dependencies**: Hono, Drizzle ORM, Better Auth, grammY, `web-push`
(API); React 19, TanStack Router + Query, Tailwind CSS v4 (web). **No new runtime
dependencies.**
**Storage**: PostgreSQL 16 — migration `0016`: two additive tables
(`notification_type`, `notification_preference`) plus one additive column
(`pool.notify_on_create`). Catalog seeded by the same migration.
**Testing**: Vitest. Domain and use-case unit tests with fake ports; adapter and
route tests against the real `postgres-test` instance on port 5433
(`test:integration`).
**Target Platform**: Node 22 server (single container) + browser PWA.
**Project Type**: pnpm monorepo — `apps/api` (hexagonal), `apps/web` (React PWA),
`packages/shared` (types, zod schemas, pure helpers).
**Performance Goals**: every eligible recipient notified within 30 s of payment
confirmation (SC-001); preference read/write endpoints under the project's 200 ms
p95 budget; catalog read cost amortised to zero by an in-process cache.
**Constraints**: production is a 3 vCPU / 4 GB box — **no new cron job, no queue,
no extra polling**. The announcement runs inline after the payment transaction
commits and must never be able to fail the payment. Overrides for N recipients
must be one query, not N.
**Scale/Scope**: 58 registered users (~16 reachable today), 4 notification types,
~29 pools to date. Roughly 12 new API files, 3 touched API files, 2 new web
components, 2 touched web files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Code Quality — PASS

- Every new function has one responsibility; the announcement is split into
  "decide who and what" (`AnnounceNewPoolUseCase`) and "deliver to a channel"
  (`CompositeNotificationService.notifyNewPool`).
- Domain primitives are value objects: `NotificationType` wraps a catalog entry
  and owns the enable/disable invariant; `NotificationPreferences` wraps the
  resolved set for one user. No raw `string` flows as a "notification type" past
  the HTTP boundary — the route validates into `NotificationTypeCode`.
- No new deprecated helpers, no dead code, no inline TODOs.

### II. Testing Standards — PASS

- `NotificationType` and `NotificationPreferences` are pure and get 100 % unit
  coverage, including the "not opt-outable wins over a stored `false`" invariant.
- `PoolScope.label()` gets a unit test per scope kind plus the fixture-missing
  fallback.
- `AnnounceNewPoolUseCase`, `CompleteCheckoutUseCase` and the two preference use
  cases are tested with fake ports (no database).
- `DrizzleNotificationPreferencesRepository` gets adapter tests against the real
  Postgres, including "absence of row resolves to the catalog default".
- Route contract tests cover auth, validation, unknown code and the rejected
  attempt to disable a locked type.
- A catalog-consistency test asserts the seeded codes equal
  `NOTIFICATION_TYPE_CODES`, so a forgotten seed fails CI (spec edge case).

### III. UX Consistency — PASS

- The new settings block reuses the existing section-heading + bordered-row
  pattern already used by `PushSettingsSection`; no ad-hoc styling.
- Each row states in plain pt-BR what it controls. The locked row is visibly
  locked (`sempre ativo`) rather than a switch that silently refuses.
- Optimistic toggle with rollback on failure and an inline error message — never a
  technical error string.
- Switches use `role="switch"` + `aria-checked` and a programmatic label, meeting
  the WCAG 2.1 AA bar the constitution sets.

### IV. Performance Requirements — PASS

- The catalog is read on every notification, so the adapter caches it in process
  (the same `Map`-cache approach already used for ranking/stats). Overrides for a
  whole broadcast are fetched in **one** `WHERE user_id = ANY(...)` query.
- New tables are keyed exactly as they are read: `notification_type` by primary
  key `code`, `notification_preference` by composite primary key
  `(user_id, type_code)`. No sequential scan, no N+1.
- No new dependency, so no bundle-size delta on the API. The web change is two
  small components (well under the 10 KB threshold).
- No new scheduled work: the announcement piggybacks on a request that already
  exists.

### V. Hexagonal Architecture & SOLID — PASS

- `domain/notification/`: `NotificationType` (VO), `NotificationPreferences` (VO),
  `NotificationTypeCode`, and `NotificationPreferencesRepository.port.ts`. Pure
  TypeScript, zero imports from outer layers.
- `application/`: `AnnounceNewPoolUseCase`, `GetNotificationPreferencesUseCase`,
  `UpdateNotificationPreferencesUseCase`, and a new
  `application/ports/UserDirectory.port.ts` (an external-read port, so it belongs
  with the other application ports). `NotificationService.port.ts` gains
  `notifyNewPool`.
- `infrastructure/`: `DrizzleNotificationPreferencesRepository`,
  `DrizzleUserDirectory`, the `notifyNewPool` branch of
  `CompositeNotificationService`, and the new Hono router. Only this layer touches
  Drizzle, grammY or `web-push`.
- Dependency direction holds: `CompleteCheckoutUseCase` gains a narrow
  `onPoolActivated?: (poolId: string) => Promise<void>` hook wired in
  `container.ts`, so the application layer never learns about the notification
  adapters and the composition root stays the only wiring point (DIP + ISP).
- Extending behaviour happens by adding a catalog entry and, at most, a new
  payload builder — existing domain code is not modified (OCP).

**Result**: no violations. Complexity Tracking stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/034-new-pool-broadcast/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── notification-preferences.md
│   └── create-pool.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/api/
├── drizzle/
│   ├── 0016_notification_preferences.sql          # NEW (bump `when` in meta/_journal.json)
│   └── meta/_journal.json                         # TOUCHED
├── src/
│   ├── db/schema/
│   │   ├── notificationType.ts                    # NEW (catalog)
│   │   ├── notificationPreference.ts              # NEW (overrides)
│   │   ├── pool.ts                                # TOUCHED (+ notify_on_create)
│   │   └── index.ts                               # TOUCHED (exports)
│   ├── domain/
│   │   ├── notification/
│   │   │   ├── NotificationType.ts                # NEW (VO + code union)
│   │   │   ├── NotificationPreferences.ts         # NEW (VO)
│   │   │   └── NotificationPreferencesRepository.port.ts   # NEW
│   │   ├── pool/Pool.ts                           # TOUCHED (notifyOnCreate state)
│   │   └── shared/PoolScope.ts                    # TOUCHED (+ label())
│   ├── application/
│   │   ├── notification/
│   │   │   ├── GetNotificationPreferencesUseCase.ts        # NEW
│   │   │   └── UpdateNotificationPreferencesUseCase.ts     # NEW
│   │   ├── pool/AnnounceNewPoolUseCase.ts         # NEW
│   │   ├── pool/CreatePoolUseCase.ts              # TOUCHED (persist the flag)
│   │   ├── payment/CompleteCheckoutUseCase.ts     # TOUCHED (post-commit hook)
│   │   └── ports/
│   │       ├── NotificationService.port.ts        # TOUCHED (+ notifyNewPool)
│   │       └── UserDirectory.port.ts              # NEW
│   ├── infrastructure/
│   │   ├── external/
│   │   │   ├── CompositeNotificationService.ts    # TOUCHED (preference gate + notifyNewPool)
│   │   │   └── TelegramNotificationService.ts     # TOUCHED (+ sendNewPoolMessage)
│   │   ├── persistence/
│   │   │   ├── DrizzleNotificationPreferencesRepository.ts # NEW
│   │   │   ├── DrizzleUserDirectory.ts            # NEW
│   │   │   └── DrizzlePoolRepository.ts           # TOUCHED (map the flag)
│   │   └── http/routes/notificationPreferences.ts # NEW
│   ├── app.ts                                     # TOUCHED (mount router)
│   └── container.ts                               # TOUCHED (wiring)
│
packages/shared/src/
├── schemas/index.ts                                # TOUCHED (createPoolSchema + patch schema)
└── types/index.ts                                  # TOUCHED (NotificationPreference types)

apps/web/src/
├── components/notifications/
│   └── NotificationPreferencesSection.tsx          # NEW
├── components/pool/create/NotifyEveryoneField.tsx  # NEW
└── routes/
    ├── settings.tsx                                # TOUCHED (mount section)
    └── pools/create.tsx                            # TOUCHED (checkbox + request field)
```

**Structure Decision**: the existing monorepo layout is kept as-is. The API
follows the mandated three-layer split (`domain/` → `application/` →
`infrastructure/`), with the new notification concern getting its own
`domain/notification/` and `application/notification/` folders rather than being
folded into `push/` — push is a *channel*, preferences are *what to send*, and
mixing them would give one folder two reasons to change. Web components live under
a new `components/notifications/` folder for the same reason.

## Complexity Tracking

> No constitutional violations. Section intentionally empty.
