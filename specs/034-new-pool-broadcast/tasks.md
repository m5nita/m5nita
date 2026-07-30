# Tasks: "Novo bolão" broadcast + per-type notification preferences

**Input**: Design documents from `/specs/034-new-pool-broadcast/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: included. Constitution II mandates TDD (Red-Green-Refactor), 100 % unit
coverage for the domain layer, adapter tests against a real database, and contract
tests for every endpoint. Test tasks therefore precede their implementation task.

**Organization**: tasks are grouped by user story. Phase 2 is shared by both
stories and must land first.

## Format

`- [ ] [TaskID] [P?] [Story?] Description with file path`

- `[P]` = safe to run in parallel (different files, no unfinished dependency)
- `[US1]` / `[US2]` = the user story the task serves

---

## Phase 1: Setup — schema, migration, shared contracts

- [ ] T001 [P] Add the catalog table in `apps/api/src/db/schema/notificationType.ts`: `code` (text, PK), `label`, `description` (text, not null), `optOutable`, `defaultEnabled` (boolean, not null, default true), `sortOrder` (integer, not null), per [data-model.md](./data-model.md) §1
- [ ] T002 [P] Add the override table in `apps/api/src/db/schema/notificationPreference.ts`: `userId` (text, FK → `user.id`, `onDelete: 'cascade'`), `typeCode` (text, FK → `notificationType.code`), `enabled` (boolean, not null), `updatedAt` (timestamp, not null, default now), composite primary key `(userId, typeCode)`
- [ ] T003 Export both new tables from `apps/api/src/db/schema/index.ts`
- [ ] T004 [P] Add `notifyOnCreate: boolean('notify_on_create').notNull().default(false)` to `apps/api/src/db/schema/pool.ts`
- [ ] T005 Generate the migration with `pnpm --filter @m5nita/api db:generate`, rename it to `apps/api/drizzle/0016_notification_preferences.sql`, append the four catalog seed `INSERT`s with `ON CONFLICT (code) DO NOTHING` (rows in [data-model.md](./data-model.md) §1), and **bump its `when` timestamp above the previous entry** in `apps/api/drizzle/meta/_journal.json`
- [ ] T006 [P] Add `notifyEveryone: z.boolean().optional().default(false)` to `createPoolSchema` and add `updateNotificationPreferenceSchema` (`{ code: string 1..64, enabled: boolean }`) in `packages/shared/src/schemas/index.ts`
- [ ] T007 [P] Add `NotificationTypeView` (`code`, `label`, `description`, `enabled`, `optOutable`) and `NotificationPreferencesResponse` (`{ types: NotificationTypeView[] }`) to `packages/shared/src/types/index.ts`

**Checkpoint**: `pnpm --filter @m5nita/api db:migrate` applies cleanly against a
fresh database and the catalog holds exactly four rows.

---

## Phase 2: Foundational — the preference rule and its single enforcement point

**⚠️ Blocking**: both user stories depend on this phase.

- [ ] T008 [P] Write failing unit tests in `apps/api/src/domain/notification/NotificationType.test.ts` covering `resolveEnabled(undefined)` → `defaultEnabled`, `resolveEnabled(false)` → `false` when opt-outable, `resolveEnabled(false)` → **`true`** when not opt-outable (the invariant), and `canBeDisabled()`
- [ ] T009 Implement the `NotificationType` value object and the `NotificationTypeCode` union plus `NOTIFICATION_TYPE_CODES` const in `apps/api/src/domain/notification/NotificationType.ts` (pure; no imports from outer layers)
- [ ] T010 [P] Write failing unit tests in `apps/api/src/domain/notification/NotificationPreferences.test.ts` covering `allows(code)` with no overrides (catalog default), with an override, for a locked type with a stored `false`, for an unknown code, and `list()` ordering by `sortOrder`
- [ ] T011 Implement the `NotificationPreferences` value object in `apps/api/src/domain/notification/NotificationPreferences.ts` (`of(types, overrides)`, `allows`, `list`, `canDisable`)
- [ ] T012 [P] Define the repository port in `apps/api/src/domain/notification/NotificationPreferencesRepository.port.ts`: `listTypes()`, `findOverrides(userId)`, `findOverridesForUsers(userIds)`, `upsert(userId, code, enabled)`
- [ ] T013 Implement `apps/api/src/infrastructure/persistence/DrizzleNotificationPreferencesRepository.ts` — catalog cached in a module-level `Map` (same pattern as `services/statsCache`), overrides for many users in **one** `inArray` query, upsert on the composite key ([data-model.md](./data-model.md) query inventory)
- [ ] T014 Write adapter tests in `apps/api/src/infrastructure/persistence/DrizzleNotificationPreferencesRepository.integration.test.ts` (real Postgres on 5433): absence of a row resolves to the catalog default, upsert twice keeps one row and refreshes `updatedAt`, batched read returns one entry per user with an override
- [ ] T015 Add a catalog-consistency test in `apps/api/src/domain/notification/catalogConsistency.integration.test.ts` asserting the seeded `notification_type` codes equal `NOTIFICATION_TYPE_CODES` — a forgotten seed must fail CI, not silence a notification in production
- [ ] T016 Extend the failing tests in `apps/api/src/infrastructure/external/CompositeNotificationService.test.ts`: a disabled `prediction_reminder` sends nothing on **any** channel including email, a disabled `match_points` sends no push, and `pool_result` (winner) is delivered even with a stored `enabled = false`
- [ ] T017 Add the preference gate to `apps/api/src/infrastructure/external/CompositeNotificationService.ts`: inject the repository, add a single private `allows(userId, code)` helper built on the `NotificationPreferences` VO, and consult it at the top of `sendPredictionReminders`, `notifyMatchPoints` and `notifyWinners` — the one enforcement point (FR-017)
- [ ] T018 Wire `DrizzleNotificationPreferencesRepository` into `apps/api/src/container.ts` and pass it to `CompositeNotificationService`

**Checkpoint**: `pnpm --filter @m5nita/api exec vitest run src/domain/notification src/infrastructure/external/CompositeNotificationService.test.ts` is green, and the jobs (`reminderJob`, `calcPoints`, `closePoolsJob`) were not modified.

---

## Phase 3: User Story 1 — Announce a new pool to the base (Priority: P1)

**Goal**: a creator who ticks the option has the whole base told, once, after the
payment is confirmed.

**Independent test**: create a pool with the option ticked, confirm the payment via
the mock gateway, and assert one notification per eligible recipient, none for the
creator, and none for an unpaid pool.

### Domain

- [ ] T019 [P] [US1] Write failing unit tests in `apps/api/src/domain/shared/PoolScope.test.ts` for `label()`: whole-competition → `Campeonato completo`, single matchday → `Rodada 5`, range → `Rodadas 5 a 8`, single-match with a fixture → `Flamengo x Palmeiras`, single-match without a fixture → `Jogo único`
- [ ] T020 [US1] Add `label(fixture?: { homeTeam: string; awayTeam: string } | null): string` to `apps/api/src/domain/shared/PoolScope.ts`
- [ ] T021 [P] [US1] Add the `notifyOnCreate` readonly state to `apps/api/src/domain/pool/Pool.ts` as a **trailing optional constructor argument defaulting to `false`**, so no existing construction site changes

### Persistence + creation

- [ ] T022 [US1] Map `notifyOnCreate` in both directions in `apps/api/src/infrastructure/persistence/DrizzlePoolRepository.ts` (`poolToPersistence` / `poolToDomain`) and add it to `PoolWithDetails` in `apps/api/src/domain/pool/PoolRepository.port.ts`
- [ ] T023 [US1] Extend `apps/api/src/application/pool/CreatePoolUseCase.test.ts` with a failing case asserting the flag is persisted when passed and defaults to `false` when omitted, then thread `notifyEveryone` through `apps/api/src/application/pool/CreatePoolUseCase.ts` into the `Pool` it builds
- [ ] T024 [US1] Pass the validated `notifyEveryone` from the create-pool handler in `apps/api/src/infrastructure/http/routes/pools.ts` into the use case

### Audience

- [ ] T025 [P] [US1] Define `apps/api/src/application/ports/UserDirectory.port.ts` — `listAllExcept(userId): Promise<Array<{ userId: string; phoneNumber: string | null }>>`
- [ ] T026 [US1] Implement `apps/api/src/infrastructure/persistence/DrizzleUserDirectory.ts` (single `select` on `user` with `ne(user.id, …)`, no join) plus an adapter test asserting the creator is excluded

### Channel delivery

- [ ] T027 [P] [US1] Add `NewPoolData` (`poolId`, `poolName`, `inviteCode`, `competitionName`, `scopeLabel`, `entryFee`, `creatorFirstName`, `recipients`) and `notifyNewPool(data)` to `apps/api/src/application/ports/NotificationService.port.ts`
- [ ] T028 [P] [US1] Add `sendNewPoolMessage(chatId, data)` to `apps/api/src/infrastructure/external/TelegramNotificationService.ts` following the existing message-builder style (pt-BR, emoji-free, absolute invite URL)
- [ ] T029 [US1] Write failing tests in `apps/api/src/infrastructure/external/CompositeNotificationService.test.ts` for `notifyNewPool`: push-only when push delivers, Telegram only when push does not, nothing when neither resolves, **never email**, recipient with `new_pool` disabled skipped, and one failing recipient not aborting the rest
- [ ] T030 [US1] Implement `notifyNewPool` in `apps/api/src/infrastructure/external/CompositeNotificationService.ts` — one batched override read, then per recipient: preference gate → `tryPush` → Telegram, with `tag: new-pool-<poolId>` and `url: /invite/<code>`

### Trigger

- [ ] T031 [P] [US1] Write failing unit tests in `apps/api/src/application/pool/AnnounceNewPoolUseCase.test.ts` (fake ports): returns early when the pool is missing or `notifyOnCreate` is false, resolves the fixture only for single-match scope, falls back to `Jogo único` when the fixture is missing, excludes the creator, and passes the creator's **first name only**
- [ ] T032 [US1] Implement `apps/api/src/application/pool/AnnounceNewPoolUseCase.ts` — load pool details, guard on the flag, build the scope label via `PoolScope.label`, resolve the audience, delegate to `notifyNewPool`
- [ ] T033 [US1] Extend `apps/api/src/application/payment/CompleteCheckoutUseCase.test.ts` with failing cases: the hook fires once with the activated pool id, does **not** fire when the payment did not activate a pool (already-completed / stats-unlock / non-entry), and a throwing hook leaves the payment completed, the pool active and the member row present
- [ ] T034 [US1] Add the optional `onPoolActivated?: (poolId: string) => Promise<void>` constructor hook to `apps/api/src/application/payment/CompleteCheckoutUseCase.ts`: have the unit of work return the activated pool id and call the hook **after the commit**, wrapped in `try/catch` that logs and swallows
- [ ] T035 [US1] Wire `AnnounceNewPoolUseCase` in `apps/api/src/container.ts` and pass its `execute` as `onPoolActivated` to `CompleteCheckoutUseCase`, keeping the existing gateway construction order intact

### Web

- [ ] T036 [P] [US1] Create `apps/web/src/components/pool/create/NotifyEveryoneField.tsx` — an unchecked-by-default checkbox labelled *"Avisar todo mundo do m5nita sobre este bolão"* with a one-line explanation, in the existing flat editorial style (bordered row, no filled surface)
- [ ] T037 [US1] Mount the field in the config step of `apps/web/src/routes/pools/create.tsx` and include `notifyEveryone` in the create request body

**Checkpoint**: User Story 1 is independently demonstrable end to end following
[quickstart.md](./quickstart.md) — two accounts, one push, one announcement.

---

## Phase 4: User Story 2 — Choose what I want to receive (Priority: P1)

**Goal**: the account owner controls which notification types reach them.

**Independent test**: toggle each type off and confirm the matching notification
stops while the others keep arriving; confirm the locked type cannot be turned off.

- [ ] T038 [P] [US2] Write failing unit tests in `apps/api/src/application/notification/GetNotificationPreferencesUseCase.test.ts`: a user with no overrides gets every catalog default, a user with one override gets it applied, a locked type always reports `enabled: true`, and the list is ordered by `sortOrder`
- [ ] T039 [US2] Implement `apps/api/src/application/notification/GetNotificationPreferencesUseCase.ts` (catalog + overrides → `NotificationPreferences.list()`)
- [ ] T040 [P] [US2] Write failing unit tests in `apps/api/src/application/notification/UpdateNotificationPreferencesUseCase.test.ts`: unknown code rejected, disabling a locked type rejected, enabling a locked type is a no-op, a valid toggle upserts and returns the refreshed list, and other types are untouched
- [ ] T041 [US2] Implement `apps/api/src/application/notification/UpdateNotificationPreferencesUseCase.ts` with a typed domain error for the unknown-code and locked-type cases
- [ ] T042 [US2] Create the router `apps/api/src/infrastructure/http/routes/notificationPreferences.ts` (`requireAuth` on `/*`, `GET` and `PATCH` per [contracts/notification-preferences.md](./contracts/notification-preferences.md), domain errors mapped to `400` / `404` / `409`)
- [ ] T043 [US2] Mount it with `app.route('/api', notificationPreferencesRoutes)` in `apps/api/src/app.ts` and register both use cases in `apps/api/src/container.ts`
- [ ] T044 [US2] Write contract tests in `apps/api/src/infrastructure/http/routes/notificationPreferences.integration.test.ts`: `401` unauthenticated, `200` shape and ordering, `400` malformed body, `404` unknown code, `409` disabling the locked type, and `200` with the refreshed list after a valid toggle
- [ ] T045 [P] [US2] Create `apps/web/src/components/notifications/NotificationPreferencesSection.tsx` — renders whatever the API returns, `role="switch"` + `aria-checked` per row with an associated label, locked types as a row badged *"sempre ativo"*, optimistic toggle with rollback and an inline pt-BR error, in the flat editorial style
- [ ] T046 [US2] Mount the section in `apps/web/src/routes/settings.tsx` below `PushSettingsSection`, with copy making clear that push is per device while these choices belong to the account

**Checkpoint**: both user stories work; `/settings` drives real delivery behaviour.

---

## Phase 5: Polish & cross-cutting

- [ ] T047 [P] Add an integration scenario in `apps/api/tests/integration/newPoolBroadcast.test.ts` (importing `src` via `../../../src` so the container singleton is not duplicated) covering: ticked + payment confirmed → recipients notified once; duplicate payment confirmation → still once; unticked → nobody notified
- [ ] T048 [P] Verify no announcement copy or scope wording was duplicated outside the domain, then run `pnpm check:leaks` and `pnpm check:arch` and fix any reported layer or leak violation
- [ ] T049 Run `pnpm biome check --write .`, `pnpm test`, and the integration suite with `DATABASE_URL` pointed at port 5433; confirm every acceptance scenario in [spec.md](./spec.md) has a covering test

---

## Dependencies & execution order

```text
Phase 1 (Setup)
   └─> Phase 2 (Foundational: VOs, port, adapter, preference gate)
         ├─> Phase 3 (US1: broadcast)      ─┐
         └─> Phase 4 (US2: settings screen) ─┴─> Phase 5 (Polish)
```

- **Phase 2 blocks both stories** — the preference gate and the VOs are shared.
- **US1 and US2 are independent once Phase 2 lands** and may be built in either
  order or in parallel; they touch disjoint files except `container.ts` (T035 and
  T043 both edit it, so they are not marked `[P]` against each other).
- Within Phase 3: T019→T020 (test then implement), T021→T022→T023→T024,
  T025→T026, T027→T029→T030, T031→T032, T033→T034→T035, T036→T037.
- Within Phase 4: T038→T039, T040→T041, both →T042→T043→T044, T045→T046.

## Parallel opportunities

- **Phase 1**: T001, T002, T004, T006, T007 in parallel (T003 after T001/T002;
  T005 after all schema edits).
- **Phase 2**: T008, T010, T012 in parallel.
- **Phase 3**: T019, T021, T025, T027, T028, T031, T036 in parallel.
- **Phase 4**: T038, T040, T045 in parallel.
- **Phase 5**: T047 and T048 in parallel; T049 last.

## Implementation strategy

**MVP** = Phase 1 + Phase 2 + Phase 3 (US1). That already delivers the feature the
requester asked for. Shipping it *without* Phase 4 is technically possible — the
catalog defaults keep everything on — but is deliberately not the plan: a broadcast
to the whole base with no way out is what US2 exists to prevent, which is why both
carry priority P1.

**Increment 2** = Phase 4, the settings screen.

**Increment 3** = Phase 5, guardrails and the end-to-end integration scenario.
