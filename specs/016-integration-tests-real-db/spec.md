# Feature Specification: Real-Database Integration Tests

**Feature Branch**: `016-integration-tests-real-db`
**Created**: 2026-04-20
**Status**: Draft
**Input**: User description: "preciso criar testes de integração que use um banco de dados \"real\" e que teste todos os fluxos da aplicação de uma maneira mais próxima ao usuário"

## Clarifications

### Session 2026-04-20

- Q: How should each test start from a clean database state? → A: Template/snapshot database — run migrations once, snapshot the empty schema, reset the DB from the snapshot before each test (or per worker).
- Q: How should the suite execute — serial or parallel, and how is the database shared? → A: Parallel by worker, one dedicated test database per worker, snapshot-reset per test inside the worker.
- Q: How should the suite control "now" for prediction locks, reminder windows and pool close times? → A: Introduce an injectable `Clock` port in the application; production code reads `clock.now()`, tests inject a `TestClock` with `setNow(...)` / `advance(...)`.
- Q: How does the suite authenticate a test user for non-auth scenarios? → A: A test-only helper that drives the real auth endpoints (OTP request → stubbed provider captures the code → OTP verify) and returns a real session. No test-only endpoints in the API, no direct DB inserts, no forged tokens.
- Q: What must the suite capture when a scenario fails in CI, to make debugging fast? → A: Test log + a per-failure "failure bundle" containing (a) the rows from the tables touched by the scenario, as JSON, (b) the calls recorded by the stubbed external providers during the run, and (c) the last HTTP request/response pair. Attached as a CI artifact.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Confidence in authentication flows (Priority: P1)

As an engineer shipping the app, I need automated tests that exercise every sign-in path a real user can take (phone OTP via WhatsApp, phone OTP via Telegram, magic-link email, Google OAuth) from the first tap of "Entrar" through the moment a session is active, against a real database, so that a broken auth release never reaches production.

**Why this priority**: Auth is the gate to everything else. A regression here locks every user out, blocks payments, and destroys trust immediately. It also integrates Better Auth, Turnstile, rate-limiting, Telegram and Resend — the most cross-cutting surface in the codebase.

**Independent Test**: Run the integration suite with only the auth scenarios enabled against a freshly migrated test database. Each scenario should register/authenticate a user from scratch and assert that a valid session and user row now exist. No other feature needs to be wired up for this to be meaningful.

**Acceptance Scenarios**:

1. **Given** a fresh test database and a stubbed SMS/WhatsApp provider, **When** the suite simulates a user requesting a phone OTP and submitting the code, **Then** a `user` row and an active session exist and the response matches what a real client would see.
2. **Given** a fresh test database and a stubbed Telegram bot, **When** the suite simulates the Telegram OTP flow (chat linking + code delivery + verification), **Then** the user is signed in and the `telegram_chat` link is persisted.
3. **Given** a fresh test database and a stubbed Resend provider, **When** the suite requests a magic link and follows the signed URL, **Then** a verified user + session are persisted.
4. **Given** a fresh test database and a stubbed Google OAuth provider, **When** the suite completes the callback, **Then** the user + OAuth account rows are persisted and a session is active.
5. **Given** Turnstile verification is enabled, **When** the suite submits a login attempt without a valid Turnstile token, **Then** the request is rejected and no user/session is created.
6. **Given** rate limiting is enabled, **When** the suite submits more OTP requests than the configured ceiling in a short window, **Then** subsequent requests are rejected and the already-persisted records are unchanged.

---

### User Story 2 - Confidence in the core pool journey (Priority: P1)

As an engineer, I need a single integration test that walks the core revenue-generating journey end-to-end — an admin creates a pool, shares the invite, a second user joins, pays the entry fee via the configured gateway, the payment webhook confirms, and both members appear in the pool — all against a real database, so that I can trust a deploy the moment this test passes.

**Why this priority**: This is the business-critical path. If pool creation, join-by-invite or the payment-confirmed-by-webhook step breaks, the product stops making money. It also exercises the hexagonal seam (use cases + Drizzle repositories + payment gateway port) that individual unit tests cannot cover together.

**Independent Test**: Spin up the test database, run this single scenario with stubbed payment gateway responses (checkout created, webhook delivered). Assert that after the test, the `pool`, `pool_member`, `payment` and related rows all reflect a valid paid membership. No auth UI or scoring logic needed — auth is set up via a test helper that produces a real session.

**Acceptance Scenarios**:

1. **Given** an authenticated admin user, **When** the admin creates a pool with an entry fee and a competition, **Then** a `pool` row with a valid invite code exists and the admin is recorded as the first member.
2. **Given** a second authenticated user and a valid invite code, **When** the user joins the pool and the suite simulates the payment gateway delivering a "checkout completed" webhook with a valid signature, **Then** the `payment` row is marked `paid`, the `pool_member` row becomes active, and the pool prize pool (in centavos) reflects the 5% platform fee correctly.
3. **Given** the same pool with two paid members, **When** an admin triggers "close pool", **Then** no further joins are accepted and the pool status transitions correctly.
4. **Given** a payment webhook with an invalid signature, **When** it is delivered, **Then** the request is rejected and no pool/membership state changes.
5. **Given** a coupon-based join attempt, **When** the payment gateway fails after the coupon is applied, **Then** coupon and pool state remain unchanged (regression test for the fix in PR #41/#42).

---

### User Story 3 - Confidence in predictions and scoring (Priority: P1)

As an engineer, I need integration tests that cover a player submitting predictions before kickoff, having them locked at kickoff, match results being applied, and the ranking updating with the correct points and tie-breakers — all against real data — so that a broken scoring deploy never silently awards the wrong prize.

**Why this priority**: Scoring is what decides the prize. A silent off-by-one in points or tie-breakers is nearly invisible in unit tests (which use hand-built fixtures) but catastrophic in production. This story validates the cross-cutting behavior: prediction window enforcement, live score ingestion, point calculation job, and ranking aggregation.

**Independent Test**: Seed a competition with a handful of matches and paid pool members, run the scenario, and assert the ranking API returns the expected ordering and scores. Auth and pool setup are handled by test helpers.

**Acceptance Scenarios**:

1. **Given** a paid pool member and an upcoming match, **When** the member submits a prediction before kickoff, **Then** the prediction is persisted and visible to that member only (per feature 009 rules).
2. **Given** the same match has started, **When** any user attempts to create or edit a prediction for that match, **Then** the request is rejected and no prediction row is written or modified.
3. **Given** match results are posted and the point-calculation job runs, **When** the ranking endpoint is queried, **Then** points reflect the documented scoring rules (exact score, correct outcome, goal difference, etc.) and tie-breakers order users deterministically.
4. **Given** a pool with two matches at different stages (group + knockout), **When** results land, **Then** the ranking reflects stage-specific rules correctly.
5. **Given** the "view others' predictions" rule, **When** a member fetches another member's predictions, **Then** only predictions for matches that have already kicked off are returned.

---

### User Story 4 - Confidence in prize withdrawal (Priority: P2)

As an engineer, I need an integration test that covers the winner claiming their prize — submitting an encrypted PIX key, receiving a withdrawal request, and an admin marking it paid — against real data, so that the last-mile of the product (the payout) is never broken silently.

**Why this priority**: Payout breakage is less frequent than payment or scoring breakage, but when it hits it is a customer-trust disaster (the winner has earned real money and can't collect). Lower than P1 because the window between "pool closes" and "payout" is much longer than the window between "user logs in" and "pays entry", so a regression here is recoverable.

**Independent Test**: Seed a pool in "completed" state with a winner, run the scenario, and assert the withdrawal lifecycle rows are correct and that the PIX key is encrypted at rest.

**Acceptance Scenarios**:

1. **Given** a pool where the user is the ranked winner, **When** the user submits a PIX key, **Then** a `prize_withdrawal` row is created, the PIX key is stored encrypted (the raw value is never persisted), and a Telegram notification is enqueued to the admin (stubbed).
2. **Given** a pending withdrawal, **When** an admin marks it paid, **Then** the row transitions to `paid` and the winner is notified (stubbed).
3. **Given** a non-winner attempts to submit a withdrawal, **When** the request is made, **Then** it is rejected with no state change.

---

### User Story 5 - Confidence in the InfinitePay gateway (Priority: P2)

As an engineer, I need integration tests that run the pool-join-and-pay flow against the InfinitePay gateway (the active production gateway) with realistic webhook payloads and signatures, so that changes touching payments never uncover an untested code path in the gateway actually serving users.

**Why this priority**: InfinitePay is the default, production-active gateway — its webhook signature scheme, checkout-created response shape, and failure modes are what real users exercise every day. Priority P2 because User Story 2 already covers the full paid-join journey; this story deepens that coverage with gateway-specific edge cases (malformed bodies, invalid signatures, duplicate webhooks, recovery after the failure documented in PRs #41/#42).

**Independent Test**: Seed a pool, drive a join-and-pay flow with InfinitePay stubs shaped like real InfinitePay sandbox responses, and assert state transitions under both happy-path and hostile inputs.

**Acceptance Scenarios**:

1. **Given** `PAYMENT_GATEWAY=infinitepay` and a valid checkout request, **When** the flow runs end-to-end, **Then** state transitions match User Story 2 (payment `paid`, pool_member active, prize pool reflects the 5% platform fee).
2. **Given** an InfinitePay webhook with a malformed or wrongly-signed body, **When** it is delivered, **Then** it is rejected and no side effects occur.
3. **Given** a duplicated InfinitePay webhook (same event delivered twice), **When** the second delivery arrives, **Then** no duplicate `payment`, `pool_member` or coupon-application rows are created (idempotency).
4. **Given** the payment fails at the gateway *after* a coupon has been applied, **When** the failure webhook arrives, **Then** coupon usage and pool state remain unchanged (regression test for PR #41/#42).
5. **Given** MercadoPago and Stripe adapters exist in the codebase but are not active, **When** the suite runs, **Then** those adapters are NOT exercised — they are covered only by their existing unit tests, not by this integration suite.

---

### User Story 6 - Confidence in background jobs (Priority: P1)

As an engineer, I need integration tests that run the reminder, close-pool, and point-calculation jobs against a real database seeded with realistic state, so that cron-driven regressions (missed reminders, stuck pools, un-scored matches) are caught before they affect users.

**Why this priority**: Background jobs are load-bearing for the product's correctness. The point-calculation job is what turns match results into the ranking that decides the prize — a silent failure here corrupts the payout. The close-pool job gates the prediction window; if it mis-fires, either predictions are accepted after they should be locked or a pool never closes. Reminder cadence drives re-engagement. Jobs also have no UI surface — users cannot work around a broken job — which makes regressions invisible until the damage is done. Treated as P1 alongside auth, pool and scoring.

**Independent Test**: Seed database state that should trigger each job's action (users with un-submitted predictions, pools past their close date, matches with final scores), invoke the job directly, and assert the expected side effects occurred.

**Acceptance Scenarios**:

1. **Given** a member with no prediction for an upcoming match, **When** the reminder job runs within the reminder window, **Then** a Telegram reminder is enqueued (stubbed) exactly once.
2. **Given** a pool whose deadline has passed, **When** the close-pool job runs, **Then** the pool transitions out of "open" and no further joins succeed.
3. **Given** matches with final scores that have not been scored yet, **When** the point-calculation job runs, **Then** the corresponding ranking updates match the rules in User Story 3.

---

### User Story 7 - Suite runs fast enough to be part of CI (Priority: P3)

As an engineer, I need the full integration suite to execute quickly and reliably in CI — isolated per-test state, no leakage across tests, and a clear failure signal — so that the suite is actually run on every PR instead of being skipped.

**Why this priority**: A slow, flaky suite is worse than none — it gets disabled, and then regressions slip. This story treats operational quality as a first-class requirement. P3 because it is a property of the suite rather than a user journey.

**Independent Test**: Run the full suite on a clean machine; measure wall-clock time, count flakes across 10 consecutive runs, and verify no test leaves residual rows visible to another test.

**Acceptance Scenarios**:

1. **Given** a clean CI runner, **When** the full integration suite runs, **Then** it completes in under 3 minutes wall-clock.
2. **Given** the suite is run 10 times in a row, **When** the results are compared, **Then** there are zero flaky failures (same outcome every run).
3. **Given** two tests execute in parallel, **When** they write to the same tables, **Then** neither observes the other's rows.
4. **Given** a test fails in the middle of its scenario, **When** the next test starts, **Then** it sees the same clean starting state as if run in isolation.

---

### Edge Cases

- **First-run bootstrap**: what happens when a developer runs the suite for the first time without the test database container up? The suite must fail with a clear, actionable message rather than hang or pollute the dev database.
- **Migration drift**: what happens when the test database schema is out of date relative to the code? The suite must re-migrate automatically or fail loud.
- **Clock-dependent tests**: prediction locking, reminder windows and pool close times are time-driven. Tests must control time deterministically (no wall-clock reliance).
- **Redis-backed state**: rate limits and OTP attempts live in Redis. Tests must reset Redis state between tests, or scenarios will collide.
- **External service outages**: if a stubbed external provider "returns 500", the app's retry and user-facing error surfaces must be exercised at least once per critical provider.
- **Concurrent joins to the same pool**: when two users join simultaneously and only one payment succeeds, the pool must end with exactly one new paid member.
- **Money rounding**: 5% platform fee on odd centavos amounts must match the same rounding rules the domain enforces (no new bug introduced by the test seed).
- **Timezone-sensitive data**: matches with kickoffs stored in UTC but displayed in `America/Sao_Paulo` must be tested with at least one DST-adjacent match.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The suite MUST execute every primary user journey listed in User Stories 1–6 against a real relational database that applies the same migrations the production database runs.
- **FR-002**: The suite MUST isolate each test so that it starts from a known-clean state and does not observe or leak data to any other test, whether run serially or in parallel. Isolation is achieved via a **template/snapshot database**: migrations are applied once to produce an empty-schema snapshot. Tests run **in parallel with one dedicated test database per worker**; before each test inside a worker, that worker's database is reset from the shared snapshot. Workers never share a database; transaction-wrapped rollback and wholesale drop-and-recreate are explicitly NOT used.
- **FR-003**: The suite MUST NOT make outbound network calls to third-party providers (payment gateways, Telegram, SMS/WhatsApp, Resend, Google OAuth, Turnstile, live-score provider) during a test run. Each provider MUST be replaceable with a controllable stub at the network boundary.
- **FR-004**: The suite MUST exercise the same HTTP entry points the frontend uses (the real API routes). A test MUST NOT call domain use cases directly when an HTTP route exists for the same behavior.
- **FR-005**: The suite MUST be able to authenticate a test user without going through the real SMS/email/OAuth provider, using a documented helper that produces a real session valid for the rest of the run. The helper MUST drive the real authentication HTTP routes (e.g. request OTP → read the generated code from the stubbed SMS/WhatsApp/Telegram/Resend provider → submit OTP verify) and return a genuine session. It MUST NOT insert `user` / `session` rows directly into the database, MUST NOT mint or forge session tokens out-of-band, and MUST NOT require a test-only endpoint that exists in production builds.
- **FR-006**: The suite MUST control time deterministically so that prediction-lock, reminder-window and pool-close scenarios behave identically every run. Determinism is achieved by introducing an injectable **`Clock` port** in the application: production code reads "now" through `clock.now()` (no direct `new Date()` / `Date.now()` in time-sensitive logic), and tests inject a `TestClock` that supports `setNow(...)` and `advance(...)`. Introducing the port and migrating the call sites that need it is part of this feature's scope.
- **FR-007**: The suite MUST assert side effects both via the application's read APIs (the same ones the UI uses) AND via direct database queries where an API does not expose the signal (e.g. encrypted-at-rest checks, audit columns).
- **FR-008**: The suite MUST fail loud with a clear, actionable error when the test database is unreachable, the schema is drifted, or a required environment variable is missing — never silently skip tests or fall back to a mock.
- **FR-009**: The suite MUST be runnable locally with a single command (no out-of-band setup beyond the Docker compose already used for development) and in CI without additional infrastructure.
- **FR-010**: The suite MUST produce a human-readable failure report that identifies the scenario and the step that failed, AND a structured "failure bundle" per failing scenario containing: (a) the rows from the tables touched by the scenario as JSON, (b) the calls recorded by the stubbed external providers during the run, and (c) the last HTTP request/response pair observed by the test. In CI, the failure bundle MUST be attached as a job artifact so it can be downloaded without re-running the suite.
- **FR-011**: Tests for money-handling flows MUST assert amounts in centavos (never floats) and MUST verify that platform fees and prize splits match the rules the domain code enforces.
- **FR-012**: Tests that cover webhook handling MUST include at least one case with an invalid signature for the InfinitePay gateway (the only active gateway in scope) and assert the request is rejected with no side effects.
- **FR-013**: The suite MUST be organized so that a single user journey can be run on its own (e.g. `--filter "pool lifecycle"`) for focused debugging.
- **FR-014**: The suite MUST be wired into CI such that a failure blocks a pull request from merging; passing locally is not sufficient.
- **FR-015**: When an existing route test relies on heavy mocking of the database and container, the new integration test covering the same journey supersedes it for that journey's coverage (the unit-level test may remain if it covers branches that are cheaper to test in isolation, but the integration test is the authority on end-to-end correctness).

### Key Entities *(include if feature involves data)*

- **Test user**: a principal representing a signed-in person. Created fresh per scenario unless a scenario explicitly tests returning-user behavior. Carries phone, email, display name, and a real authenticated session.
- **Test pool**: a pool with a known admin, entry fee (centavos), invite code and competition. Used as the unit of "state I need to test pool journeys against".
- **Test competition + matches**: a minimal competition with a handful of matches at different stages (group, knockout) and known kickoff times relative to the controlled clock.
- **Test payment**: a payment with a known gateway, amount, and signed webhook payload. Each gateway has its own payload shape.
- **Test clock**: the scenario's source of truth for "now". Every timestamp the suite produces and every time-sensitive assertion uses this clock.
- **Stubbed external provider**: a replaceable adapter for each third-party service (payment gateway, Telegram bot, Resend, SMS/WhatsApp, Google OAuth, Turnstile, live-score provider). Records calls for later assertion; returns responses shaped like the real provider.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The suite covers 100% of the user journeys listed in User Stories 1–6, with at least one passing scenario per journey.
- **SC-002**: The suite runs green 10 times in a row on CI without a single flaky failure.
- **SC-003**: The full suite finishes in under 3 minutes wall-clock on the CI runner currently used for PRs.
- **SC-004**: A developer who pulls `main` can run the suite with a single command and see a green result within 15 minutes of cloning, assuming Docker is installed.
- **SC-005**: After the suite is merged and enforced in CI, the number of production regressions that reach users in any of the journeys it covers drops to zero over a rolling 90-day window.
- **SC-006**: The diff for a typical feature PR that touches a covered journey includes an updated or added integration scenario in 100% of cases (enforced by code review, measured by sampling 20 PRs).
- **SC-007**: The suite catches a deliberate regression (an engineer intentionally breaks a covered behavior) within the first integration-suite run on the PR, in at least 95% of a sample of 20 injected regressions.
- **SC-008**: Every money-handling assertion in the suite is expressed in centavos, verified by a lint / code-review rule; zero floats appear in the suite's money assertions.

## Assumptions

- **"Integration test" means API-level black-box**: the tests drive the real HTTP API (the same routes the PWA calls) against a real database, with third-party providers stubbed at the network boundary. Full browser-driven end-to-end tests (Playwright UI flows) are out of scope for this feature and can be added as a follow-up if needed.
- **"Real database" is the existing test Postgres**: the `postgres-test` service already present in `docker-compose.yml` (port 5433) is the database the suite runs against. No new database technology is introduced.
- **External providers are always stubbed**: even providers that expose "sandbox" environments (e.g. InfinitePay sandbox) are replaced with local stubs to keep the suite deterministic, offline-friendly and free. A separate smoke-test layer may exercise the real sandbox; that is out of scope for this feature.
- **Only the active gateway is covered**: InfinitePay is the only payment gateway exercised by this integration suite because it is the gateway running in production. MercadoPago and Stripe adapters remain covered by their existing unit tests only. If either is promoted to the active gateway in the future, the corresponding integration scenarios will be added as a follow-up.
- **Time is controllable via the `Clock` port**: production code reads the current time through an injectable `Clock` port (see FR-006). The port and the migration of time-sensitive call sites to use it are in scope for this feature. Any call site that still reads `new Date()` / `Date.now()` directly and that participates in a covered journey must be migrated.
- **Auth helper is trusted, and real**: the suite uses a documented helper that drives the real authentication HTTP routes (request OTP → read code from the stubbed provider → verify) to create authenticated sessions for non-auth scenarios. The helper never inserts users/sessions directly, never forges tokens, and never relies on a test-only endpoint in the API surface. Its correctness is exercised by every non-auth test and specifically validated by User Story 1.
- **Existing unit tests stay**: domain / use-case unit tests are kept where they are cheaper than integration tests. This feature adds a new layer; it does not replace the unit layer wholesale.
- **CI enforcement**: failure of the integration suite blocks PR merges — this is a product decision the repository owner endorses by adopting this spec.
- **Seed data is per-test, not shared**: each scenario builds the state it needs; there is no global seed to keep green. This is to avoid the "modify the seed to unbreak the test" anti-pattern.
