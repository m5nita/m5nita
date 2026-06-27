# Tasks: Web Push Notifications (PWA)

**Input**: Design documents from `/specs/030-web-push/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/web-push-api.md](./contracts/web-push-api.md)

**Tests**: INCLUDED. The project constitution mandates TDD (Principle II: 100% domain
coverage, ≥80% new-code coverage, adapter/contract tests, benchmark tests on
performance-sensitive paths). Test tasks precede their implementation and MUST be written
to fail first (Red → Green → Refactor).

**Remediations applied** (from `/speckit.analyze`): C1 perf benchmark → T036 + plan
threshold; C2 accessibility → T030/T047/T055; C3 composite size → T016 channel-resolver
helper; I1 dual `onMatchFinished` sites → T041; V1 observability → T013/T014/T055; V2
eligibility test → T027; V3 `lib/push` tests → T020; V4 MVP opt-out → Implementation
Strategy.

**Organization**: Tasks are grouped by user story (from spec.md) so each story is
independently implementable, testable, and shippable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 / US4 (Setup, Foundational, Polish carry no story label)
- All paths are repo-relative.

## Path Conventions

Monorepo: API `apps/api/src/`, Web `apps/web/`, shared `packages/shared/src/`.
Migrations `apps/api/drizzle/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependency, env, and config scaffolding for Web Push.

- [x] T001 Add `web-push` runtime dependency and `@types/web-push` dev dependency to `apps/api` via `pnpm --filter @m5nita/api add web-push` and `pnpm --filter @m5nita/api add -D @types/web-push`
- [x] T002 [P] Add VAPID env to `apps/api/.env.example` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) and `VITE_VAPID_PUBLIC_KEY` to `apps/web/.env.example`, each documented as optional with graceful degradation
- [x] T003 [P] Create `apps/api/src/lib/webpush.ts` — read VAPID env, call `webpush.setVapidDetails(...)`, export the configured client plus an `isPushConfigured` flag; if keys are missing, log one warning and leave push disabled (never throw, so dev/test boot)

**Checkpoint**: Library installed and env/config plumbing ready.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared persistence, delivery transport, channel routing, and SW receipt that
EVERY push story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 Create `push_subscription` Drizzle schema in `apps/api/src/db/schema/pushSubscription.ts` (columns + unique `endpoint` index + `user_id` index per data-model.md)
- [x] T005 [P] Create `match_points_notified` Drizzle schema in `apps/api/src/db/schema/matchPointsNotified.ts` (unique composite index on `user_id,pool_id,match_id` per data-model.md)
- [x] T006 Export both new tables from `apps/api/src/db/schema/index.ts`
- [x] T007 Generate migration `0015` via `pnpm --filter @m5nita/api db:generate` (captures both tables), then VERIFY the new entry's `when` in `apps/api/drizzle/meta/_journal.json` is greater than `0014`'s `1781656602574` (bump if not), and apply with `pnpm --filter @m5nita/api db:migrate`
- [x] T008 [P] Add `subscribePushSchema` (+ inferred `SubscribePushPayload`) to `packages/shared/src/schemas/index.ts` and confirm it is re-exported from the package root
- [x] T009 [P] Create `apps/api/src/domain/push/PushSubscription.ts` plain readonly type (per data-model.md)
- [x] T010 Create `apps/api/src/domain/push/PushSubscriptionRepository.port.ts` interface (`upsert`, `findByUserId`, `deleteByEndpoint`, `deleteByEndpoints`)
- [x] T011 Write integration tests for the push-subscription repository in `apps/api/src/infrastructure/persistence/DrizzlePushSubscriptionRepository.integration.test.ts` (upsert idempotent by endpoint; `findByUserId` returns multiple devices; `deleteByEndpoint` scoped to the user; `deleteByEndpoints` bulk) — must fail first
- [x] T012 Implement `apps/api/src/infrastructure/persistence/DrizzlePushSubscriptionRepository.ts` to satisfy T011 (`onConflictDoUpdate` on `endpoint`)
- [x] T013 Write unit tests for `apps/api/src/infrastructure/external/WebPushNotificationService.test.ts` (sends JSON payload to each subscription; collects `404`/`410` endpoints and calls `deleteByEndpoints`; swallows other per-device errors; **emits a structured send-outcome log/counter and a dead-sub-prune counter** — V1) — must fail first
- [x] T014 Implement `apps/api/src/infrastructure/external/WebPushNotificationService.ts` (uses `lib/webpush` + `PushSubscriptionRepository`; `send(subscriptions, payload)`; prune dead subs; no-op when push not configured; **emit send-outcome + prune-rate counters/logs so SC-004/SC-007 are measurable** — V1)
- [x] T015 Inject `PushSubscriptionRepository` + `WebPushNotificationService` into the `CompositeNotificationService` constructor and wire `new DrizzlePushSubscriptionRepository(db)` + the web-push service in `apps/api/src/container.ts` (existing routing untouched; class still compiles and existing tests pass)
- [x] T016 [C3] Write a unit test then add a single private push-first **channel-resolution helper** on `apps/api/src/infrastructure/external/CompositeNotificationService.ts` (e.g. `tryPushFirst(userId, payload): Promise<boolean>` → `findByUserId` then `webPushService.send` to all devices, returns whether push handled it). Reused by reminders/winners/match-points so each routing method stays ≤10 lines and the class respects the 50-line limit (Constitution I, Rule of Three)
- [x] T017 [P] Create `apps/web/public/push-sw.js` with a `push` listener (`showNotification(title, { body, icon: '/icon-192.png', data: { url }, tag })`) and a `notificationclick` listener (focus an existing client at `url` or `clients.openWindow(url)`), per contracts/web-push-api.md
- [x] T018 [P] Add `workbox.importScripts: ['/push-sw.js']` to the VitePWA `workbox` config in `apps/web/vite.config.ts` (keep `generateSW`, `registerType: 'autoUpdate'`, existing `runtimeCaching`)
- [x] T019 [P] Create `apps/web/src/lib/push.ts` client helpers (`isPushSupported()`, `isInstalledPwa()`, `isIos()`, `urlBase64ToUint8Array()`, `subscribe()` → `requestPermission` + `pushManager.subscribe(VITE_VAPID_PUBLIC_KEY)` + POST `/api/push/subscribe`, `unsubscribe()` → DELETE `/api/push/subscribe` + local `pushManager` unsubscribe, `getPushStatus()`)
- [x] T020 [P] [V3] Write unit tests in `apps/web/src/lib/push.test.ts` for the pure helpers in `lib/push.ts` (`urlBase64ToUint8Array` correctness; `isPushSupported`/`isIos`/`isInstalledPwa` predicates under mocked `navigator`/`window`/`matchMedia`)

**Checkpoint**: A push can be encrypted+sent server-side (with delivery telemetry) and received+rendered client-side; subscription storage and the shared push-first helper exist. Story work can begin.

---

## Phase 3: User Story 1 - Opt in and be reminded to palpitar (Priority: P1) 🎯 MVP

**Goal**: A signed-in user sees a one-time soft explainer on app open, enables push, and
later receives pre-kickoff reminders via Web Push (not Telegram/email), deep-linking to
the palpite screen.

**Independent Test**: On a supported browser, sign in → soft explainer appears → enable →
subscription stored. With an upcoming match and a missing palpite, trigger
`sendPredictionReminders` and confirm a push is delivered and taps through to
`/pools/{poolId}/predictions`. Reload → explainer does not reappear.

- [x] T021 [US1] Write unit test for `apps/api/src/application/push/SubscribeToPushUseCase.test.ts` (upserts subscription for the given user) — must fail first
- [x] T022 [US1] Implement `apps/api/src/application/push/SubscribeToPushUseCase.ts` (single `execute({ userId, endpoint, p256dh, auth, userAgent })` → `repo.upsert`)
- [x] T023 [US1] Write integration test `apps/api/src/infrastructure/http/routes/push.subscribe.integration.test.ts` for `POST /api/push/subscribe` (401 without session; 201 + stored on valid body; idempotent re-POST; 400 on invalid body) — must fail first
- [x] T024 [US1] Create `apps/api/src/infrastructure/http/routes/push.ts` with `POST /push/subscribe` (`requireAuth`, validate `subscribePushSchema`, read `User-Agent`, call `SubscribeToPushUseCase`); register `pushRoutes` in `apps/api/src/app.ts`; wire `subscribeToPushUseCase` in `apps/api/src/container.ts`
- [x] T025 [US1] Add `userId: string` to `ReminderData` in `apps/api/src/application/ports/NotificationService.port.ts` and populate it in `buildRemindersToSend` in `apps/api/src/jobs/reminderJob.ts`
- [x] T026 [US1] Add a third eligibility branch (`exists(...)` on `push_subscription.user_id`) to the `where(...)` filter in `collectRemindersForPool` in `apps/api/src/jobs/reminderJob.ts` so push-only users (no phone, no verified email) become reminder-eligible
- [x] T027 [US1] [V2] Write a test (`apps/api/src/jobs/reminderJob.*test.ts` against real PG) asserting a push-only member (no phone, no verified email, has a `push_subscription`) is now returned by the eligibility query — must fail before T026, pass after
- [x] T028 [US1] Extend `apps/api/src/infrastructure/external/CompositeNotificationService.test.ts` for `sendPredictionReminders` push-first routing (push when subscriptions exist → all devices; no Telegram/email when push fires; falls through to Telegram → email when no subscription) — must fail first
- [x] T029 [US1] Add the push-first branch to `sendPredictionReminders` in `apps/api/src/infrastructure/external/CompositeNotificationService.ts` using the T016 helper (`if (await tryPushFirst(userId, { title, body, url: '/pools/{poolId}/predictions', tag })) return;` else existing Telegram → email)
- [x] T030 [US1] [P] Create `apps/web/src/components/push/PushOptInPrompt.tsx` (reuses `Modal`): shows once when signed-in + `isPushSupported()` + `Notification.permission === 'default'` + no `m5nita.push.promptSeen` in `localStorage`; "enable" → `push.subscribe()`; sets the `localStorage` flag on any outcome; iOS Safari tab → "Adicionar à Tela de Início" guidance instead of subscribing. **A11y (C2)**: focus trap + return-focus, keyboard operable, `aria` labels on actions; emoji-free pt-BR copy
- [x] T031 [US1] Mount `PushOptInPrompt` for authenticated users at the app root (`apps/web/src/main.tsx` or the root route component)

**Checkpoint**: US1 enables push and delivers kickoff reminders. (For full in-app opt-out, pair with US4 — see Implementation Strategy / V4.)

---

## Phase 4: User Story 2 - Pontos conquistados ao final de cada jogo (Priority: P2)

**Goal**: When a match finishes, each participant who predicted it gets one push per pool
with the points earned and resulting position, deep-linking to the pool ranking.
Push-only; at-most-once per (user, pool, match).

**Independent Test**: With a predicted match in two pools, mark it finished via the live
sync path; confirm one push per pool (points + position correct) and that a re-sync sends
no duplicate; a user without a subscription receives nothing.

- [x] T032 [US2] Add `MatchPointsData` and `notifyMatchPoints(items)` to `apps/api/src/application/ports/NotificationService.port.ts`
- [x] T033 [US2] Write integration test for the dedupe store in `apps/api/src/infrastructure/persistence/DrizzleMatchPointsNotifiedStore.integration.test.ts` (`recordOnce` returns `true` first time, `false` thereafter for the same triple) — must fail first
- [x] T034 [US2] Implement `apps/api/src/infrastructure/persistence/DrizzleMatchPointsNotifiedStore.ts` (`recordOnce(userId, poolId, matchId)` via `onConflictDoNothing(...).returning()` → `length > 0`)
- [x] T035 [US2] Add `findActivePoolsForMatch(match)` to `apps/api/src/domain/pool/PoolRepository.port.ts` and implement in `apps/api/src/infrastructure/persistence/DrizzlePoolRepository.ts` (single-match by `match_id`; range by `competition_id` + matchday window), with a test — must fail first
- [x] T036 [US2] [C1] Write a unit test for `apps/api/src/application/match/NotifyMatchPointsUseCase.test.ts` (loads match, fans out per pool, builds one `userId→position` map per pool, maps predictions→`MatchPointsData`, skips pools with no predictions) **including the benchmark assertion that ranking is fetched exactly once per pool and there are zero per-user ranking queries (≤2 queries/pool — the defined perf threshold for this path)** — must fail first
- [x] T037 [US2] Implement `apps/api/src/application/match/NotifyMatchPointsUseCase.ts` (deps: `matchRepo`, `poolRepo`, `predictionRepo`, `rankingRepo`, `notificationService`; uses `predictionRepo.findByPoolMatch` + one `rankingRepo.getPoolRanking` per pool — satisfies the T036 query bound)
- [x] T038 [US2] Extend `apps/api/src/infrastructure/external/CompositeNotificationService.test.ts` for `notifyMatchPoints` (records dedupe; sends only when newly recorded AND user has a subscription; push-only — never Telegram/email; prunes dead subs) — must fail first
- [x] T039 [US2] Implement `notifyMatchPoints` in `apps/api/src/infrastructure/external/CompositeNotificationService.ts` (per item: `store.recordOnce` → if new and the user has subscriptions, send via the T016 helper with `url: '/pools/{poolId}'`; never falls back to Telegram/email)
- [x] T040 [US2] Wire `DrizzleMatchPointsNotifiedStore` into the composite and construct `NotifyMatchPointsUseCase` in `apps/api/src/container.ts`
- [x] T041 [US2] [I1] Update **every** `onMatchFinished` registration site in `apps/api/src/index.ts` (both wiring points, ~lines 38 and 54) to run `calcPointsForMatch(matchId)` then `getContainer().notifyMatchPointsUseCase.execute(matchId)`; grep `onMatchFinished` to confirm no site is missed
- [x] T042 [US2] Write integration test `apps/api/src/application/match/NotifyMatchPoints.integration.test.ts` (finished match in two pools → one push per pool with correct points/position; second run → no duplicate; subscription-less user → nothing) — must fail first, then pass

**Checkpoint**: US2 deliverable independently on top of Foundational + (optionally) US1.

---

## Phase 5: User Story 4 - Control notifications across devices (Priority: P2)

**Goal**: A `/settings` toggle reflects status and enables/disables push; multiple devices
work independently; disabling removes only the current device.

**Independent Test**: Enable on two devices → both receive a test event. Disable on one
via `/settings` → only the other keeps receiving; the disabled device's subscription is
removed.

- [x] T043 [US4] Write unit test for `apps/api/src/application/push/UnsubscribeFromPushUseCase.test.ts` (deletes by `userId` + `endpoint`) — must fail first
- [x] T044 [US4] Implement `apps/api/src/application/push/UnsubscribeFromPushUseCase.ts` (single `execute({ userId, endpoint })` → `repo.deleteByEndpoint`)
- [x] T045 [US4] Write integration test for `DELETE /api/push/subscribe` in `apps/api/src/infrastructure/http/routes/push.unsubscribe.integration.test.ts` (401 without session; removes only that endpoint, other devices retained; idempotent 200) — must fail first
- [x] T046 [US4] Add `DELETE /push/subscribe` to `apps/api/src/infrastructure/http/routes/push.ts` (`requireAuth`, validate `{ endpoint }`, call `UnsubscribeFromPushUseCase`) and wire `unsubscribeFromPushUseCase` in `apps/api/src/container.ts`
- [x] T047 [US4] Add a push-notifications section to `apps/web/src/routes/settings.tsx` (status via `getPushStatus()`; enable → `push.subscribe()`; disable → `push.unsubscribe()`; hidden/disabled when `!isPushSupported()`; iOS-tab hint; explicit loading/disabled states). **A11y (C2)**: the toggle has an accessible name/`role`, `aria-checked`/`aria-disabled` state, keyboard operability, and a programmatic status label; emoji-free pt-BR copy

**Checkpoint**: Full consent control and multi-device behavior available.

---

## Phase 6: User Story 3 - Know immediately when you win (Priority: P3)

**Goal**: Winner alerts route via Web Push (push → Telegram → email), deep-linking to the
pool results.

**Independent Test**: Close a pool with a push-subscribed winner → winner alert arrives as
a push (not Telegram/email) and taps through to `/pools/{poolId}`.

- [x] T048 [US3] Add `userId: string` to `WinnerInfo` in `apps/api/src/application/ports/NotificationService.port.ts` and populate it in the `winners.map(...)` in `apps/api/src/jobs/closePoolsJob.ts`
- [x] T049 [US3] Extend `apps/api/src/infrastructure/external/CompositeNotificationService.test.ts` for `notifyWinners` push-first routing (push to all devices when subscribed → no Telegram/email; else Telegram → email) — must fail first
- [x] T050 [US3] Add the push-first branch to `notifyWinners` in `apps/api/src/infrastructure/external/CompositeNotificationService.ts` using the T016 helper (`url: '/pools/{poolId}'`, then existing chain)

**Checkpoint**: All three v1 triggers deliver via Web Push.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates, consistency, and final verification across all stories.

- [x] T051 [P] Emoji-free pt-BR copy audit of every push title/body in `apps/api/src/infrastructure/external/CompositeNotificationService.ts` (reminder/pontos/winner payloads) and the user-facing strings in `apps/web/src/components/push/PushOptInPrompt.tsx` and `apps/web/src/routes/settings.tsx`
- [x] T052 [P] Run `pnpm biome check --write apps/api/src apps/web/src packages/shared/src` over the changed dirs and resolve any lint findings (no semicolons, single quotes)
- [x] T053 [P] Confirm coverage gates via `pnpm test` coverage: 100% on new domain code under `apps/api/src/domain/push/` and ≥80% on new code overall; add missing unit tests. Also verify the method (≤10 lines) / class (≤50 lines) size limits hold in `apps/api/src/infrastructure/external/CompositeNotificationService.ts` after the helper extraction (C3)
- [x] T054 Verify `apps/api/src/_architecture.test.ts` passes with no new layer-boundary violations (do not extend `BASELINE_*`); run `pnpm check:leaks` and `pnpm check:arch`
- [x] T055 Execute the manual end-to-end pass in [quickstart.md](./quickstart.md) (opt-in once, reminder push, pontos once/no-dup, winner push, dead-sub prune, iOS degrade), an **a11y spot-check** of the opt-in prompt + settings toggle (keyboard + screen-reader — C2), and confirm **send-outcome/prune telemetry** is emitted (V1); then run the full guardrail suite `pnpm test && pnpm biome check . && pnpm check:leaks && pnpm check:arch`

---

## Dependencies & Execution Order

- **Setup (T001–T003)** → blocks everything. T002, T003 parallel after T001.
- **Foundational (T004–T020)** → blocks all stories. Order: schemas (T004,T005 ∥) → export (T006) → migration (T007) → [shared schema T008 ∥, domain type T009 ∥] → port (T010) → repo test+impl (T011→T012) → web-push service test+impl (T013→T014, needs T003+T012) → composite injection (T015, needs T012+T014) → channel-resolver helper (T016, needs T015). Web sub-track (T017,T018,T019 ∥, then T020 after T019) is independent of the API chain.
- **User Story 1 (T021–T031)** — depends on Foundational. Subscribe path T021→T022→T023→T024; reminder path T025→T026→T027, T028→T029 (uses T016 helper); web T030→T031. MVP target.
- **User Story 2 (T032–T042)** — depends on Foundational (US1 not required). T032 → T033→T034 → T035 → T036→T037 → T038→T039 (uses T016) → T040 → T041 → T042.
- **User Story 4 (T043–T047)** — depends on Foundational + `routes/push.ts` from US1 (T024 creates it; T046 extends it). Otherwise independent.
- **User Story 3 (T048–T050)** — depends on Foundational + T016 helper. Independent of US1/US2/US4.
- **Polish (T051–T055)** — after all targeted stories.

**Story independence**: US2, US3, and US4 do not depend on each other. US4 shares
`routes/push.ts` with US1 (sequence those two edits). US1 is the only story required to
demonstrate end-to-end push (it builds the opt-in entry point). All three routing stories
(US1/US2/US3) consume the shared T016 helper — implement T016 before their routing tasks.

## Parallel Execution Examples

- **Foundational kickoff**: T004 ∥ T005 ∥ T008 ∥ T009; and the entire web sub-track
  (T017 ∥ T018 ∥ T019, then T020) in parallel with the API persistence sub-track.
- **After Foundational, run stories concurrently** (different files): US2 (T032–T042) and
  US3 (T048–T050) can proceed in parallel; US1 first if shipping the MVP.
- **Within US1**: T030 (web component) ∥ the API reminder-routing tasks (T025–T029).
- **Polish**: T051 ∥ T052 ∥ T053.

## Implementation Strategy

1. **MVP first**: Setup → Foundational → **US1** + **US4's opt-out slice**. US1 alone
   enables push and delivers kickoff reminders, but **FR-005 (in-app opt-out) lives in
   US4** — shipping US1 by itself leaves users with only browser-level revocation. For a
   respectful launch, pull US4's `UnsubscribeFromPushUseCase` + DELETE route + `/settings`
   toggle (T043–T047) into the MVP, **or** explicitly accept browser-level revocation as
   the interim opt-out and document it (V4 decision).
2. **Increment 2**: **US2** (pontos conquistados) — the net-new engagement driver.
3. **Increment 3**: remainder of **US4** (if not bundled) and **US3** (winner alerts via
   push) — both small, parallelizable.
4. **Polish**: copy audit, lint, coverage + size limits, architecture guardrails, manual
   E2E with a11y + telemetry checks.

---

**Totals**: 55 tasks — Setup 3, Foundational 17, US1 11, US2 11, US4 5, US3 3, Polish 5.
**Test tasks (TDD)**: T011, T013, T020, T021, T023, T027, T028, T033, T035, T036, T038, T042, T043, T045, T049 (T036 includes the mandated perf-benchmark assertion).
