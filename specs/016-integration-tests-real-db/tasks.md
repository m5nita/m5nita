---

description: "Task list for feature 016 — Real-Database Integration Tests"
---

# Tasks: Real-Database Integration Tests

**Input**: Design documents from `/specs/016-integration-tests-real-db/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

**Tests**: This feature *is* tests. Scenario tasks in each user-story phase are the tests themselves — they are required, not optional.

**Organization**: Tasks are grouped by user story (priority-ordered) so each story can be implemented, validated and shipped independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1)
- Each task includes the exact file path

## Path Conventions

- Production code: `apps/api/src/`
- Integration tests: `apps/api/tests/integration/`
- CI config: `.github/workflows/ci.yml`
- Feature spec/plan/contracts: `specs/016-integration-tests-real-db/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies, create the new test project skeleton, and wire up package scripts so the suite can be invoked (even if it runs zero scenarios at this point).

- [ ] T001 Add `msw@^2` to `apps/api/package.json` `devDependencies` and run `pnpm install`
- [ ] T002 Add script `"test:integration": "vitest run --config tests/integration/vitest.config.ts"` to `apps/api/package.json`
- [ ] T003 Create directory skeleton `apps/api/tests/integration/{setup,support,support/stubs,support/fixtures,scenarios,.artifacts}`; add `.artifacts/.gitkeep` and a `.gitignore` in `tests/integration/.artifacts/` that ignores `*.json` except `.gitkeep`
- [ ] T004 [P] Create `apps/api/tests/integration/vitest.config.ts` (Vitest project using `pool: 'threads'`, `globals: true`, `setupFiles`: `setup/per-worker-setup.ts`, `globalSetup`: `setup/global-setup.ts`, `testTimeout: 30_000`, `hookTimeout: 30_000`)
- [ ] T005 [P] Create `apps/api/tests/integration/tsconfig.json` extending `apps/api/tsconfig.json` and including `src/**/*.ts` + `tests/integration/**/*.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Everything that MUST exist before any scenario file in Phase 3+ can run. No user story can start until this phase is green.

**⚠️ CRITICAL**: Scenarios depend on the Clock port migration, the test DB lifecycle, the test app builder, the auth helper, every stub, and the failure recorder.

### Production-code changes (Clock port)

- [ ] T006 Create `Clock` port interface at `apps/api/src/domain/shared/Clock.ts` per `contracts/clock-port.md`
- [ ] T007 Create `SystemClock` adapter at `apps/api/src/infrastructure/clock/SystemClock.ts` implementing `Clock` (wraps `new Date()`)
- [ ] T008 Add unit test `apps/api/src/domain/shared/__tests__/Clock.test.ts` proving `SystemClock.now()` returns current time within a sane window (sanity check only)
- [ ] T009 Migrate `apps/api/src/domain/prediction/Prediction.ts` to accept `now: Date` at call sites and remove any internal `new Date()` that gates the prediction-lock rule; update `apps/api/src/domain/prediction/__tests__/Prediction.test.ts` if needed
- [ ] T010 [P] Migrate `apps/api/src/jobs/reminderJob.ts` to read `now` from `container.clock` instead of `new Date()` (inside `sendPredictionReminders`)
- [ ] T011 [P] Migrate `apps/api/src/jobs/closePoolsJob.ts` to read `now` from `container.clock` for any `new Date()` used to gate pool-close
- [ ] T012 [P] Migrate `apps/api/src/services/match.ts` kickoff-gating queries to read `now` from `container.clock`
- [ ] T013 [P] Migrate `apps/api/src/services/prediction.ts` lock-filter to read `now` from `container.clock`
- [ ] T014 [P] Migrate `apps/api/src/infrastructure/http/routes/pools.ts` any deadline-gating logic to read `now` from `container.clock` (audit-column writes stay as `new Date()`)

### Container refactor

- [ ] T015 Refactor `apps/api/src/container.ts` so `buildContainer()` accepts an optional `overrides` argument of type `Partial<{ clock: Clock; paymentGateway: PaymentGateway; notificationService: NotificationService; bot: StubBot | Bot; db: typeof db }>` and resolves a `Clock` (defaulting to `SystemClock`) that is injected into use cases and jobs that need it; export `buildContainer` alongside the existing `getContainer`

### Test-DB lifecycle

- [ ] T016 Create `apps/api/tests/integration/setup/global-setup.ts` — connects once per run to Postgres, (re)creates template DB `m5nita_test_template`, runs Drizzle migrations into it, and exposes the template name via env so per-worker-setup can consume it
- [ ] T017 Create `apps/api/tests/integration/support/db-utils.ts` — exports `workerDbName()` derived from `process.env.VITEST_POOL_ID`, `dropAndClone(templateName, targetName)`, `workerConnectionString()` computed from `DATABASE_URL`
- [ ] T018 Create `apps/api/tests/integration/setup/per-worker-setup.ts` — runs once per Vitest worker: creates the worker's DB by cloning the template, exports a `resetDb()` helper used by per-test hooks, registers `beforeEach(resetDb)` and `afterAll(dropDb)`
- [ ] T019 Create `apps/api/tests/integration/setup/teardown.ts` — process-level teardown that drops all worker clones (idempotent; safe to run twice)
- [ ] T020 Wire `setup/teardown.ts` into `vitest.config.ts` via `globalTeardown`

### Test app builder + Clock

- [ ] T021 Create `apps/api/tests/integration/support/TestClock.ts` per `contracts/clock-port.md` (implements `Clock`, `setNow`, `advance`)
- [ ] T022 Create `apps/api/tests/integration/support/app.ts` — exports `buildTestApp(overrides?)` that: (a) instantiates a postgres-js client pointing at the worker DB, (b) builds a fresh Hono app importing the real `apps/api/src/index.ts` route modules, (c) builds a test container via the refactored `buildContainer`, (d) returns `{ app, container, clock, recorder, dbClient }`

### External-provider stubs

- [ ] T023 [P] Create `apps/api/tests/integration/support/stubs/infinitepay-stub.ts` per `contracts/stub-registry.md`: MSW handlers for `POST /checkout`, assertion API (`lastCheckout`, `allCheckouts`, `makeWebhook`, `deliverWebhook`), signed/malformed/wrongly-signed webhook generation, duplicate idempotency-key support
- [ ] T024 [P] Create `apps/api/tests/integration/support/stubs/telegram-stub.ts` per `contracts/stub-registry.md`: an in-process object matching the grammY `Bot` surface used by `TelegramNotificationService` + `sends()` / `lastSend()` / `deliverUpdate()` helpers
- [ ] T025 [P] Create `apps/api/tests/integration/support/stubs/resend-stub.ts` per `contracts/stub-registry.md`: MSW handler for `POST https://api.resend.com/emails`, `lastMagicLinkFor(email)` parser
- [ ] T026 [P] Create `apps/api/tests/integration/support/stubs/google-oauth-stub.ts` per `contracts/stub-registry.md`: handlers for Google's `/token`, `/userinfo`, and authorize redirect + `preAuthorize` helper
- [ ] T027 [P] Create `apps/api/tests/integration/support/stubs/turnstile-stub.ts` per `contracts/stub-registry.md`: handler for `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` + `setMode('always-valid' | 'always-invalid' | 'match-token')`, `addValidToken`
- [ ] T028 [P] Create `apps/api/tests/integration/support/stubs/football-data-stub.ts` per `contracts/stub-registry.md`: handlers for fixture list + live-score endpoints + `setFixtures`, `setLiveScores`
- [ ] T029 Wire MSW `setupServer` into `setup/per-worker-setup.ts` with `{ onUnhandledRequest: 'error' }`, register all stub handlers from T023–T028, and reset them in `afterEach` (FR-003 — offline guarantee)
- [ ] T030 Wire Better Auth's phone-number `sendOTP` override: create `apps/api/tests/integration/support/otp-inbox.ts` (a `Map<string, string>`) and a container override for the auth transport; update `app.ts` builder (T022) to install it

### Fixture builders

- [ ] T031 [P] Create `apps/api/tests/integration/support/fixtures/makeUser.ts` — deterministic phone/email generator scoped by worker id + scenario tag
- [ ] T032 [P] Create `apps/api/tests/integration/support/fixtures/makeCompetition.ts` — insert a minimal competition via Drizzle
- [ ] T033 [P] Create `apps/api/tests/integration/support/fixtures/makeMatches.ts` — insert matches at declared stages with `kickoffOffsetMs` relative to `TestClock.now()`
- [ ] T034 [P] Create `apps/api/tests/integration/support/fixtures/makePool.ts` — drives `POST /api/pools` via an admin's `fetch` so the real use case runs

### Auth helper

- [ ] T035 Create `apps/api/tests/integration/support/auth-helper.ts` per `contracts/auth-helper.md` — implement `signInViaPhoneOtp`, `signInViaMagicLink`, `signInViaGoogle`; each returns a `TestUser` with a `fetch` wrapper that keeps the session cookie and records last req/resp into the recorder ring buffer

### Failure bundle

- [ ] T036 Create `apps/api/tests/integration/support/failure-bundle.ts` per `contracts/failure-bundle.md` — `FailureRecorder` class with `watch(...tables)`, ring-buffer for last HTTP pair, redaction rules, `writeBundle(taskInfo, error)` writing to `apps/api/tests/integration/.artifacts/`
- [ ] T037 Wire `FailureRecorder` into `per-worker-setup.ts` via `beforeEach` (instantiate + attach to test context) and `afterEach` (write bundle if `task.result?.state === 'fail'`, then reset)

### Smoke test

- [ ] T038 Add `apps/api/tests/integration/scenarios/smoke.test.ts` — single scenario: `buildTestApp()` → `GET /api/health` → `expect(status).toBe(200)`. Proves Phase 2 is green end-to-end; no stubs/fixtures needed.

### CI wiring (minimal for Phase 2 validation)

- [ ] T039 Update `.github/workflows/ci.yml` `test` job to add a `- run: pnpm --filter @m5nita/api test:integration` step after the existing `pnpm test`, with `DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test` and `timeout-minutes: 10`
- [ ] T040 Add failure-artifact upload step to the `test` job in `.github/workflows/ci.yml` conditioned on `if: failure()` with `path: apps/api/tests/integration/.artifacts/**`, `retention-days: 7`

**Checkpoint**: Foundation ready — `pnpm --filter @m5nita/api test:integration` runs, the smoke test passes, and per-worker DBs are cloned and reset. User-story phases can begin in parallel.

---

## Phase 3: User Story 1 — Confidence in authentication flows (Priority: P1) 🎯 MVP

**Goal**: Every sign-in path a real user can take (phone OTP via WhatsApp, phone OTP via Telegram, magic-link email, Google OAuth) is exercised end-to-end against the real Hono app + Better Auth + real Postgres, with external transports stubbed. Turnstile and rate-limit rejections are asserted.

**Independent Test**: `pnpm --filter @m5nita/api test:integration scenarios/auth.test.ts` runs all six acceptance scenarios from spec US1 against a fresh per-test DB and reports pass.

- [ ] T041 [P] [US1] Create `apps/api/tests/integration/scenarios/auth.test.ts` with scenario 1: Phone OTP via WhatsApp (request OTP → stub captures code → verify → assert `user` row + active `session` exist + response shape matches client expectations)
- [ ] T042 [P] [US1] Add scenario 2 to `apps/api/tests/integration/scenarios/auth.test.ts`: Phone OTP via Telegram (chat linking + code delivery through `telegram-stub` + verification → assert `telegram_chat` link persisted)
- [ ] T043 [P] [US1] Add scenario 3 to `apps/api/tests/integration/scenarios/auth.test.ts`: Magic-link email (request → `resend-stub.lastMagicLinkFor` → follow the signed URL → assert verified user + session persisted)
- [ ] T044 [P] [US1] Add scenario 4 to `apps/api/tests/integration/scenarios/auth.test.ts`: Google OAuth (`google-oauth-stub.preAuthorize` → callback → assert user + OAuth account rows + active session)
- [ ] T045 [P] [US1] Add scenario 5 to `apps/api/tests/integration/scenarios/auth.test.ts`: Turnstile rejection (`turnstile-stub.setMode('always-invalid')` → send-otp request → assert 403 + no user/session rows)
- [ ] T046 [P] [US1] Add scenario 6 to `apps/api/tests/integration/scenarios/auth.test.ts`: OTP rate limiting (submit > ceiling OTP requests in the window → assert subsequent requests are rejected + already-persisted records unchanged); reset the rate limiter between scenarios (Redis or in-memory backed — must be deterministic)

**Checkpoint**: Auth scenarios pass; the `auth-helper` is transitively validated by every non-auth scenario later.

---

## Phase 4: User Story 2 — Confidence in the core pool journey (Priority: P1)

**Goal**: Admin creates pool → second user joins via invite → pays entry fee → payment webhook confirms → both members appear in pool, prize pool reflects 5% platform fee. Coupon-failure regression locked down.

**Independent Test**: `pnpm --filter @m5nita/api test:integration scenarios/pool-lifecycle.test.ts` passes. Requires only `auth-helper`, `makePool`, `makeCompetition`, `infinitepay-stub`.

- [ ] T047 [P] [US2] Create `apps/api/tests/integration/scenarios/pool-lifecycle.test.ts` with scenario 1: admin creates pool (authenticated admin → `POST /api/pools` → assert `pool` row with valid invite code + admin is first `pool_member`)
- [ ] T048 [P] [US2] Add scenario 2: second user joins + paid webhook (admin creates pool → second user signs in → `POST /api/pools/{id}/join` → `infinitePayStub.deliverWebhook(valid, status=paid)` → assert `payment.status='paid'`, `pool_member.status='paid'`, prize pool amount in centavos matches expected with 5% platform fee deduction)
- [ ] T049 [P] [US2] Add scenario 3: admin closes pool (pool with 2 paid members → `POST /api/pools/{id}/close` as admin → assert no further joins accepted + pool `status` transitions correctly)
- [ ] T050 [P] [US2] Add scenario 4: invalid-signature webhook rejected (`infinitePayStub.makeWebhook({ signature: 'wrongly-signed' })` → deliver → assert 400/401 response + zero state change in `pool`, `pool_member`, `payment`)
- [ ] T051 [P] [US2] Add scenario 5: coupon side-effect guard — regression for PRs #41/#42 (apply coupon → payment gateway failure webhook → assert coupon `usageCount` unchanged + `pool_member` does NOT become paid + no partial state)

**Checkpoint**: Pool lifecycle scenarios pass.

---

## Phase 5: User Story 3 — Confidence in predictions and scoring (Priority: P1)

**Goal**: Predictions before kickoff are accepted, locked at kickoff, point-calculation job produces the ranking the rules dictate, tie-breakers order users deterministically, and the "view others' predictions" rule is respected.

**Independent Test**: `pnpm --filter @m5nita/api test:integration scenarios/predictions-and-scoring.test.ts` passes.

- [ ] T052 [P] [US3] Create `apps/api/tests/integration/scenarios/predictions-and-scoring.test.ts` with scenario 1: prediction submitted before kickoff (paid member + upcoming match with kickoff = TestClock.now + 30 min → `POST /api/predictions` → assert prediction persisted + only visible to that member via `GET /api/predictions/me`)
- [ ] T053 [P] [US3] Add scenario 2: prediction locked at kickoff (set clock past kickoff → attempt create/edit → assert 4xx + `prediction` row unchanged)
- [ ] T054 [P] [US3] Add scenario 3: point calculation after results (seed results via fixture → run `calcPoints` job → assert ranking endpoint returns points matching scoring rules: exact score, correct outcome, goal diff, tie-breakers deterministic across two users with identical points)
- [ ] T055 [P] [US3] Add scenario 4: stage-specific rules (pool with one group-stage + one knockout match, results landed → assert ranking reflects stage-specific rules per domain entity)
- [ ] T056 [P] [US3] Add scenario 5: "view others' predictions" visibility (member A and B both have predictions; two matches where one has already kicked off → A fetches B's predictions → assert only the kicked-off match's prediction is returned)

**Checkpoint**: Prediction + scoring scenarios pass.

---

## Phase 6: User Story 6 — Confidence in background jobs (Priority: P1)

**Goal**: Reminder, close-pool, and point-calculation jobs execute correctly against real seeded state; cron regressions are caught before release.

**Independent Test**: `pnpm --filter @m5nita/api test:integration scenarios/background-jobs.test.ts` passes.

- [ ] T057 [P] [US6] Create `apps/api/tests/integration/scenarios/background-jobs.test.ts` with scenario 1: reminder job enqueues Telegram reminder exactly once (member has no prediction for upcoming match; TestClock placed inside the reminder window → invoke `sendPredictionReminders()` → assert `telegramStub.sends()` length === 1, run again with no clock advance → assert still 1 due to dedup)
- [ ] T058 [P] [US6] Add scenario 2: close-pool job transitions pool past deadline (pool whose deadline has passed → invoke `closePoolsJob` → assert pool `status` out of 'open' + subsequent join attempt rejected)
- [ ] T059 [P] [US6] Add scenario 3: point-calculation job (matches with final scores, not yet scored → invoke `calcPoints` → assert ranking updated identically to Phase 5 scenario 3)

**Checkpoint**: Background-job scenarios pass. All P1 stories done — this is a shippable milestone.

---

## Phase 7: User Story 4 — Confidence in prize withdrawal (Priority: P2)

**Goal**: Winner submits PIX key → encrypted at rest → admin marks paid → notifications fire. Non-winners rejected.

**Independent Test**: `pnpm --filter @m5nita/api test:integration scenarios/prize-withdrawal.test.ts` passes.

- [ ] T060 [P] [US4] Create `apps/api/tests/integration/scenarios/prize-withdrawal.test.ts` with scenario 1: winner submits PIX (seed a pool in 'completed' state with known winner → `POST /api/pools/{id}/withdrawal` with a PIX key → assert `prize_withdrawal` row created + `pixKeyEncrypted` column present + raw PIX value NOT in any table + `telegramStub.sends()` contains admin notification)
- [ ] T061 [P] [US4] Add scenario 2: admin marks paid (pending withdrawal → admin `POST /api/admin/withdrawals/{id}/mark-paid` → assert row transitions to `paid` + winner notification enqueued in `telegramStub`)
- [ ] T062 [P] [US4] Add scenario 3: non-winner rejected (non-winner attempts withdrawal → assert 403 + zero state change in `prize_withdrawal`)

**Checkpoint**: Prize-withdrawal scenarios pass.

---

## Phase 8: User Story 5 — Confidence in the InfinitePay gateway (Priority: P2)

**Goal**: Gateway-specific edge cases for InfinitePay: happy path, malformed/wrongly-signed webhook, duplicate delivery idempotency, post-coupon failure. MercadoPago/Stripe explicitly not exercised.

**Independent Test**: `pnpm --filter @m5nita/api test:integration scenarios/infinitepay-gateway.test.ts` passes.

- [ ] T063 [P] [US5] Create `apps/api/tests/integration/scenarios/infinitepay-gateway.test.ts` with scenario 1: happy path with `PAYMENT_GATEWAY=infinitepay` (valid checkout → valid paid webhook → assert state transitions match US2 scenario 2)
- [ ] T064 [P] [US5] Add scenario 2: malformed/wrongly-signed webhook rejected (both `malformed` and `wrongly-signed` modes from `infinitepay-stub.makeWebhook`) — assert 400/401 + zero state change
- [ ] T065 [P] [US5] Add scenario 3: duplicate-delivery idempotency (`deliverWebhook(..., duplicate: true)` → assert no duplicate `payment` / `pool_member` / coupon-application rows)
- [ ] T066 [P] [US5] Add scenario 4: post-coupon failure (apply coupon → deliver failure webhook → assert coupon `usageCount` unchanged + `pool_member` not paid)
- [ ] T067 [P] [US5] Add scenario 5: MercadoPago + Stripe adapters NOT exercised (explicit `expect(mercadoPagoStubCalls).toEqual([])` and equivalent for Stripe; proves the suite does not accidentally hit them)

**Checkpoint**: InfinitePay gateway scenarios pass.

---

## Phase 9: User Story 7 — Suite runs fast enough to be part of CI (Priority: P3)

**Goal**: The full suite finishes in ≤ 3 minutes, is green 10 runs in a row, isolates parallel workers, and recovers from a mid-test failure.

**Independent Test**: `pnpm --filter @m5nita/api test:integration scenarios/suite-performance.test.ts` plus the CI-level budget gate.

- [ ] T068 [US7] Create `apps/api/tests/integration/scenarios/suite-performance.test.ts` scenario 1: parallel-isolation self-check — a test writes a sentinel row in table `pool`, the peer worker must NOT observe it (uses `workerConnectionString()` directly to read the peer's DB → expects zero rows; skipped when only 1 worker is available)
- [ ] T069 [US7] Add scenario 2 to `scenarios/suite-performance.test.ts`: post-failure recovery — a test deliberately fails mid-scenario; the next test in the same worker must see a pristine DB (assert by counting rows in all tables touched in the failing scenario)
- [ ] T070 [US7] Add CI wall-clock enforcement: replace the `test:integration` step in `.github/workflows/ci.yml` with a wrapper script `apps/api/tests/integration/scripts/run-with-budget.sh` that wraps `vitest run` and fails the step if wall-clock > 180 s (portable via `/usr/bin/time`)
- [ ] T071 [US7] Add 10-run stability check: new CI job `integration-flake-check` (runs only on `main` branch pushes, not on every PR) that runs the full suite 10× and fails if any run fails

**Checkpoint**: All P1 + P2 + P3 stories done.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T072 Run `pnpm biome check --write apps/api/tests/integration` and fix any lint/format issues
- [ ] T073 Run `pnpm --filter @m5nita/api typecheck` and fix any type errors introduced by the Clock migration or container refactor
- [ ] T074 Update `apps/api/tests/integration/README.md` with the content of `quickstart.md` (copy, not link, so a developer reading the test folder doesn't have to jump to specs/)
- [ ] T075 Update `README.md` "Tech stack" line-item adding MSW as a dev dependency and mentioning the new `test:integration` command under `Scripts`
- [ ] T076 Update `CLAUDE.md` (if any manual additions needed post-context-refresh) — skip if already complete from `/speckit.plan`
- [ ] T077 [P] Remove superseded mocked route tests where an integration scenario now fully covers the journey (delete only if confident; conservative list: `apps/api/src/infrastructure/http/routes/__tests__/pools.test.ts` pool-creation and join portions; keep webhook-signature branch tests since they cover pure-function paths cheaper than the integration layer)
- [ ] T078 Run the full suite locally 5× consecutively (`for i in 1 2 3 4 5; do pnpm --filter @m5nita/api test:integration || exit 1; done`) — proves SC-002 (flake rate) locally before merging
- [ ] T079 Verify final wall-clock on CI runner is below 3 minutes (SC-003) — if over, profile with `--reporter verbose --logHeapUsage` and optimize the slowest 3 scenarios before merging

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — can start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1. BLOCKS all user stories. Within Phase 2, the Clock-migration tasks (T006–T014) are followed by the container refactor (T015), followed by the DB-lifecycle (T016–T020) and test-app builder (T021–T022). Stubs (T023–T028), fixtures (T031–T034), auth helper (T035), and failure recorder (T036–T037) then unlock scenarios.
- **Phases 3–8 (User Stories)**: All depend on Phase 2. Each story is independent and can be worked in parallel across engineers.
- **Phase 9 (US7)**: Needs at least one scenario from Phases 3–8 to be meaningful (the flake check and budget gate need real scenarios to measure).
- **Phase 10 (Polish)**: Depends on all user stories being in place.

### User Story Dependencies

- **US1 (Auth)**: Foundational only. Validates the auth helper that every later story depends on — recommended to land first.
- **US2 (Pool lifecycle)**: Foundational only (uses auth helper). No cross-story dependency.
- **US3 (Predictions + scoring)**: Foundational only. Uses fixture builders + TestClock.
- **US6 (Background jobs)**: Foundational only. Uses fixtures + TestClock + TelegramStub.
- **US4 (Prize withdrawal)**: Foundational only. Uses auth helper + fixtures.
- **US5 (InfinitePay gateway)**: Foundational only. Overlaps with US2 but targets gateway-specific edges.
- **US7 (Suite performance)**: Requires at least US1 + US2 to exist for meaningful measurement.

### Within Each User Story

- Each story's scenario-task file is a single test file. Each scenario inside the file is a single `it(...)` block; multiple scenarios can be implemented in parallel because they do not share state.

### Parallel Opportunities

- **Phase 2**: T010–T014 can all run in parallel (5 different files). T023–T028 (six stubs) can all run in parallel. T031–T034 (four fixture builders) can all run in parallel.
- **Phases 3–8**: All six story phases can be worked in parallel once Phase 2 completes, by different engineers. Scenarios within a phase are marked `[P]` because each scenario lives in its own test file (auth, pool-lifecycle, predictions-and-scoring, prize-withdrawal, infinitepay-gateway, background-jobs).

---

## Parallel Example: Phase 2 stub rollout

```bash
# After the test app builder (T022) is merged, six stubs can go to six engineers (or six concurrent agents):
Task: "Create apps/api/tests/integration/support/stubs/infinitepay-stub.ts per contracts/stub-registry.md"
Task: "Create apps/api/tests/integration/support/stubs/telegram-stub.ts per contracts/stub-registry.md"
Task: "Create apps/api/tests/integration/support/stubs/resend-stub.ts per contracts/stub-registry.md"
Task: "Create apps/api/tests/integration/support/stubs/google-oauth-stub.ts per contracts/stub-registry.md"
Task: "Create apps/api/tests/integration/support/stubs/turnstile-stub.ts per contracts/stub-registry.md"
Task: "Create apps/api/tests/integration/support/stubs/football-data-stub.ts per contracts/stub-registry.md"
```

## Parallel Example: Phase 3 (US1) scenarios

```bash
# All six auth scenarios in the same file — one engineer writes them sequentially; or six agents each write one `it(...)` block.
Task: "Add US1 scenario 1 (WhatsApp OTP) to apps/api/tests/integration/scenarios/auth.test.ts"
Task: "Add US1 scenario 2 (Telegram OTP) to apps/api/tests/integration/scenarios/auth.test.ts"
Task: "Add US1 scenario 3 (Magic link) to apps/api/tests/integration/scenarios/auth.test.ts"
Task: "Add US1 scenario 4 (Google OAuth) to apps/api/tests/integration/scenarios/auth.test.ts"
Task: "Add US1 scenario 5 (Turnstile rejection) to apps/api/tests/integration/scenarios/auth.test.ts"
Task: "Add US1 scenario 6 (Rate limit) to apps/api/tests/integration/scenarios/auth.test.ts"
```

---

## Implementation Strategy

### MVP-first (ship just US1)

1. Phase 1 → Phase 2 → Phase 3.
2. **Stop and validate**: auth scenarios green in CI; failure-bundle artifact uploaded on a deliberate broken scenario; 10-run local stability check on just the auth file.
3. Merge — CI is now enforcing auth-regression protection.

### Incremental delivery

Ship each user story as a separate PR once Phase 2 is merged:

1. Phase 1 + 2 + 3 (US1) → PR 1 → merge.
2. Phase 4 (US2) → PR 2 → merge.
3. Phase 5 (US3) → PR 3 → merge.
4. Phase 6 (US6) → PR 4 → merge.
5. Phase 7 (US4) → PR 5 → merge.
6. Phase 8 (US5) → PR 6 → merge.
7. Phase 9 (US7) + Phase 10 (Polish) → PR 7 → merge.

### Parallel team strategy

With multiple engineers after Phase 2 lands on main:

- Engineer A: US1 (auth)
- Engineer B: US2 (pool lifecycle)
- Engineer C: US3 (predictions + scoring)
- Engineer D: US6 (background jobs)
- Engineer E: US4 (prize withdrawal) + US5 (InfinitePay gateway)

US7 (suite performance) and Phase 10 (polish) are done last by whoever finishes first.

---

## Notes

- Every `[P]` task operates on a different file from other `[P]` tasks in the same batch.
- Every task ships behind a PR that runs the integration suite; no task is "done" until CI is green.
- Money literals in every scenario are centavos; floats in scenarios fail code review (SC-008).
- `TestClock` is the only seam for time — any scenario reaching for `new Date()` is a red flag.
- If a scenario needs an outbound provider we haven't stubbed, add the stub — MSW's `onUnhandledRequest: 'error'` makes the missing-stub failure loud and clear.
- Flakes are not tolerated. If a scenario flakes once in 10 local runs, debug before merging.
