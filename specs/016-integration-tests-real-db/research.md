# Research: Real-Database Integration Tests

**Feature**: 016-integration-tests-real-db
**Phase**: 0 — Research
**Status**: All Technical-Context unknowns resolved

The five architectural unknowns were answered during `/speckit.clarify` (isolation, parallelism, time control, auth helper, failure artifacts). The items below are the remaining dependency/patterns questions that were tagged in Technical Context.

---

## 1. Per-worker Postgres isolation + fast reset via template clone

**Decision**: Use Postgres's native `CREATE DATABASE <clone> WITH TEMPLATE <template>` to produce a per-worker database, then drop+reclone it before each test.

**Rationale**:

- Postgres 16's `TEMPLATE` clone is implemented as a file-copy of the source database cluster files, not a logical replay of DDL. Empirically ~50–150 ms on a fresh schema of our size (≈30 tables, no data), well under the 3-minute budget for 25 scenarios × 4 workers.
- Works with real commits — does NOT force transaction-wrapping the app, so code paths that `COMMIT` (payment webhooks writing audit rows, coupon increments, job-written rows) are exercised the same way they run in production.
- The `postgres-test` container is already provisioned (`docker-compose.yml` :5433) and the CI `test` job already boots an identical Postgres 16 service with the same credentials — zero new infrastructure.
- `VITEST_POOL_ID` (stable per-worker string, e.g. `1`, `2`, `3`, `4`) gives a natural suffix for the clone name: `m5nita_test_w{VITEST_POOL_ID}`.

**Alternatives considered**:

- **Transaction-per-test rollback (SAVEPOINT or BEGIN/ROLLBACK wrapping each test)**: rejected. Commits are an observable behavior we need to test (webhook idempotency requires real commits). Also breaks connection-pooling semantics and forces single-connection mode, which breaks our `postgres.js` default setup.
- **Truncate tables between tests**: rejected. Becomes slower than template-clone once the schema has >20 tables with FKs and requires a hand-maintained truncation order. Also leaves sequences in an inconsistent state without extra work.
- **Drop + recreate DB per test**: rejected. Would reapply migrations every test (several seconds each) and blow the wall-clock budget.
- **Testcontainers**: rejected. Adds container-start latency per suite run and a new dev dependency; the existing docker-compose already gives us the same Postgres image with zero new code.

---

## 2. Vitest parallel workers + per-worker DB coordination

**Decision**: Use Vitest's `threads` pool with `singleThread: false`. Workers are identified by `process.env.VITEST_POOL_ID`. Each worker runs its own `globalSetup` phase (Vitest's `setupFiles` run in each worker) that:
1. Reads the template DB name from env (`TEST_DB_TEMPLATE`).
2. Computes its own clone name: `m5nita_test_w${VITEST_POOL_ID}`.
3. `DROP DATABASE IF EXISTS`, then `CREATE DATABASE … WITH TEMPLATE …`.
4. Exports `DATABASE_URL` for that worker (process-local).

A single process-level `globalSetup` (Vitest's `globalSetup` config option) runs **once before all workers**: it (re)creates the template DB and applies migrations against it. Tests never apply migrations at worker-start — they just clone.

**Rationale**:

- Vitest's `threads` pool spawns one Node worker per logical CPU by default, giving linear parallelism. On the GitHub Actions `ubuntu-latest` runner (2 vCPU currently) we expect 2 workers; on a dev laptop 8–12. Budget was sized for 2 workers as worst case.
- `CREATE DATABASE … TEMPLATE` requires exclusive access to the template at clone time. Postgres serializes concurrent clones of the same template cleanly (other clones wait), and our clone-per-worker-per-test cadence is rare enough that contention is sub-millisecond.
- Each worker holds its own `postgres.js` connection pool pointing at its own DB URL. No shared state between workers.

**Alternatives considered**:

- **Vitest `forks` pool**: rejected. Slower startup than threads (fresh Node process per test), no isolation benefit we need (we're already isolated at the DB layer).
- **Single-worker serial**: rejected. Can't hit the 3-min budget at 25+ scenarios.
- **Shared DB with row-level `tenant_id` namespacing**: rejected. Requires every query in the app to respect a tenant filter — massive production-code surgery.

---

## 3. Time control via `Clock` port

**Decision**: Introduce `Clock` as a domain-layer port in `apps/api/src/domain/shared/Clock.ts`:

```ts
export interface Clock {
  now(): Date
}
```

Adapters:
- `SystemClock` in `apps/api/src/infrastructure/clock/SystemClock.ts` (production; wraps `new Date()`).
- `TestClock` in `apps/api/tests/integration/support/TestClock.ts` (test; holds a mutable `Date`, supports `setNow(iso: string | Date)` and `advance(ms: number)`).

`container.ts` resolves a `Clock` once at container-build time and passes it into use cases and jobs that need "now". Tests call `buildContainer({ clock: testClock })`.

**Migration scope**: only call sites that participate in covered user journeys need to migrate on day one. The audit below lists them. `new Date()` used purely for audit columns (`createdAt`, `updatedAt`) stays as-is — drifting those by ~µs does not affect test outcomes and migrating them would balloon scope.

**Call sites requiring migration** (driven by grep of `new Date()` / `Date.now()` cross-referenced with the covered journeys):

| File | Reason |
|---|---|
| `apps/api/src/jobs/reminderJob.ts` | Decides which matches are inside the reminder window. Covered by US6 scenario 1. |
| `apps/api/src/domain/prediction/Prediction.ts` | Enforces prediction-lock at kickoff. Covered by US3 scenario 2. |
| `apps/api/src/application/match/SyncLiveScoresUseCase.ts` (indirect) | Any time-based filtering; verify during implementation. |
| `apps/api/src/services/match.ts` | Kick-off gating for UI/list queries; verify during implementation. |
| `apps/api/src/services/prediction.ts` | Prediction lock filter (mirror of domain rule). |
| `apps/api/src/infrastructure/http/routes/pools.ts` | Any "close pool if deadline passed" inline logic. |

**Rationale**:

- Constitutional alignment (Principle V): port lives in `domain/shared` next to other value objects; adapter in `infrastructure`. DIP upheld.
- Injectable via container — plays cleanly with per-worker test isolation (each test gets its own `TestClock` instance).
- Tests never mutate global timer state, so multiple Vitest workers can run time-sensitive scenarios concurrently without collision.

**Alternatives considered**:

- **`vi.useFakeTimers()` + `vi.setSystemTime()`**: rejected. Global state across the module graph; interacts poorly with `postgres.js` and Hono internals that schedule real timers. Also worker-scoped at best, and noisy when combined with async code.
- **Abstract Date provider on each class**: rejected — violates DIP by spreading a cross-cutting concern across every class that needs it. Central port is cleaner.
- **Don't migrate; use real wall-clock for everything**: rejected — impossible to test "match started 30 seconds ago" deterministically without a clock seam.

---

## 4. Auth helper via real HTTP routes

**Decision**: `auth-helper.ts` exports three functions, each of which returns a `{ userId, sessionCookie, fetch }` tuple. Each function drives the **real** Better Auth routes against the real auth transport stub:

```ts
await signInViaPhoneOtp(app, { phoneNumber: '+5511900000001' })
await signInViaMagicLink(app, { email: 'alice@test.local' })
await signInViaGoogle(app, { email: 'bob@test.local', googleSub: 'fixed-sub-1' })
```

Implementation pattern (phone OTP example):
1. Helper calls `POST /api/auth/phone-number/send-otp` with a valid Turnstile stub token.
2. The SMS/WhatsApp transport is replaced by `telegram-stub.ts` / SMS-stub, which records the outbound OTP. The helper reads the code from the stub's `lastCode()` API.
3. Helper calls `POST /api/auth/phone-number/verify-otp` with the code. The response sets a real Better-Auth session cookie, which the helper extracts and returns.
4. The returned `fetch` is a small wrapper around `app.fetch` (Hono's in-process `Fetch`), preconfigured with the session cookie and CSRF-exempt headers, so scenarios just call `fetch('/api/pools', { method: 'POST', … })`.

**Rationale**:

- Spec clarification Q4 is explicit: no DB inserts, no forged tokens, no test-only endpoints.
- Exercising the real auth routes means every non-auth test is *also* a smoke test of auth — if Better Auth breaks, every test fails fast and loudly. Aligns with the auth story's P1 criticality.
- `app.fetch` is Hono's own in-process dispatcher: zero HTTP overhead, zero port allocation, parallel-safe. Tests never touch `@hono/node-server` or open real sockets.

**Alternatives considered**:

- **Raw DB insert of user + session**: rejected (contradicts clarification).
- **Test-only `POST /test/login` endpoint**: rejected (contradicts clarification + constitutional concern: no production code path should exist only for tests).
- **Forge a Better-Auth JWT with the shared secret**: rejected (contradicts clarification; couples tests to Better-Auth's internal token format).

---

## 5. External provider stubbing: MSW for HTTP, in-process stubs for bots

**Decision**:

- **HTTP clients (InfinitePay, Google OAuth, Resend, Turnstile, football-data)**: use MSW 2.x (`setupServer` from `msw/node`). Each provider has a `*-stub.ts` module exporting `handlers` (an array of MSW handlers) and an assertion API (e.g. `infinitePayStub.lastCheckout()`, `infinitePayStub.deliverWebhook(app, { status: 'paid' })`). The Vitest setup file starts one MSW server per worker and resets handlers between tests.
- **grammY Telegram bot**: replace the grammY `Bot` instance with a stub that exposes `sends()` (captured outbound messages) and `deliverUpdate(update)` (feed a fake update into the bot's router). The container already wires `notificationService = new TelegramNotificationService(bot)`; tests build a stub `bot` and pass a container override.
- **Better Auth phone-number transport**: Better Auth's phone-number plugin accepts a `sendOTP` callback. Production uses WhatsApp / Telegram; tests inject a callback that stores the OTP in an in-process map keyed by phone number, read by the auth helper.
- **Payment gateway stub lives BELOW MSW when possible**: for InfinitePay we intercept the outbound HTTPS calls (the adapter uses `fetch`), so the same code path runs in tests as in production — we only flip the network wall.

**Rationale**:

- MSW intercepts at the `fetch`/`undici` layer in Node, so the application's real `InfinitePayPaymentGateway` adapter runs end-to-end including JSON body construction, header signing, and response parsing. This is the closest-to-production way to test an HTTP-integration adapter.
- MSW is the de-facto standard for request interception in JS testing (active maintenance, TS-first API, works with Node's native fetch).
- grammY's bot cannot be intercepted at the network layer because the bot is a library object, not an HTTP client we control. A small in-process stub that satisfies the same interface is the cleanest replacement.
- Better Auth exposes a transport hook for OTP delivery — using it is idiomatic and avoids monkey-patching.

**Alternatives considered**:

- **`nock`**: viable, but API is less ergonomic than MSW; MSW also supports the same handlers in browser + node, which is a future-proofing bonus for any Playwright work.
- **Stub at the adapter level (swap `InfinitePayPaymentGateway` for a `FakeInfinitePayPaymentGateway`)**: rejected for the gateway layer — we'd skip the JSON encoding + HTTP-layer code that is most likely to regress. Used instead for the Telegram bot because there is no HTTP boundary to intercept.
- **Live InfinitePay sandbox**: rejected (contradicts FR-003 and the "offline-deterministic" assumption). A separate smoke-test layer may exercise the sandbox; that's out of scope.

---

## 6. Failure-bundle implementation

**Decision**: A `FailureRecorder` singleton per test (`beforeEach` hooks instantiate one and attach it to `expect.getState()` via `afterEach`). It listens to:

- **DB writes**: a postgres.js "notice" hook isn't rich enough; instead the recorder runs `SELECT * FROM <tables_touched>` at failure time against the worker's DB. The "tables touched" set is declared per scenario via `recorder.watch('pool', 'pool_member', 'payment')` — explicit keeps the bundle small.
- **Stub calls**: each `*-stub.ts` exposes `callLog()`; the recorder concatenates them.
- **Last HTTP pair**: the `fetch` wrapper returned by `auth-helper.ts` maintains a ring buffer of size 1.

On test failure (`afterEach` observing `ctx.task.result?.state === 'fail'`), the recorder writes `./apps/api/tests/integration/.artifacts/<scenario>.json` with the bundle. CI's `actions/upload-artifact` step picks up `apps/api/tests/integration/.artifacts/**` when the test job fails.

**Rationale**:

- Per-scenario bundle (≤ a few KB each) is downloadable and human-readable — no postgres dump tooling in CI.
- Explicit `watch()` list matches the spec's FR-010 intent: "the rows from the tables touched by the scenario" — each scenario opts in to what matters.
- Graceful: if the recorder itself fails, it logs to stderr and does not mask the original test failure.

**Alternatives considered**:

- **Full `pg_dump` per failure**: rejected (large, slow, requires `pg_dump` on the CI runner).
- **OpenTelemetry traces**: rejected (heavy, not needed for this use case).
- **No bundle, rely on Vitest output only**: rejected (contradicts clarification Q5 — the whole point is to diagnose without re-running).

---

## 7. Coordinating with existing heavily-mocked route tests

**Decision**: Keep the existing `apps/api/src/infrastructure/http/routes/__tests__/*.test.ts` for now. When a PR adds an integration scenario that fully covers a mocked route test's journey, that PR deletes the superseded mocked test in the same diff. Guided by FR-015. No batch deletion in this feature's PR — removing them while introducing the new layer would spike change size and muddy bisects.

**Rationale**:

- Keeps the PR scope focused on *adding* the new layer.
- Mocked tests still catch regressions today; deleting before replacement is risky.
- FR-015 already encodes the policy long-term.

**Alternatives considered**:

- **Delete all mocked route tests in this PR**: rejected — scope creep, review-burden explosion.
- **Permanent parallel maintenance**: rejected long-term — doubles maintenance for zero benefit (FR-015 addresses).

---

## 8. CI workflow changes

**Decision**: Extend the existing `test` job in `.github/workflows/ci.yml` rather than adding a new job:

1. Keep the current unit-test `pnpm test` step.
2. Add a `pnpm --filter @m5nita/api test:integration` step after it, with the same Postgres service and `DATABASE_URL` env.
3. Add `timeout-minutes: 10` at the job level (current default is 360 — we want a fast fail).
4. Add `actions/upload-artifact` conditioned on `failure()` pointing at `apps/api/tests/integration/.artifacts/**`.
5. Enforce 3-min budget via a wrapper that wraps `vitest run` with `/usr/bin/time -f '%e'` and fails the step if wall-clock > 180 s.

**Rationale**: Single job keeps CI cheap (shared Postgres service, shared pnpm install). Adding a new job would duplicate install + Postgres boot each time.

**Alternatives considered**:

- **Separate job `integration`**: rejected — cost-ineffective at current scale, redundant Postgres service.
- **Use a matrix strategy across node versions**: rejected — we target Node 20 only today; matrix adds cost without signal.
