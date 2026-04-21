# Quickstart: Real-Database Integration Tests

**Feature**: 016-integration-tests-real-db
**Audience**: developers about to run or add an integration test

## One-time setup

```bash
# From repo root, with Docker running
docker compose up -d postgres-test        # Starts Postgres on :5433
pnpm install
```

The `postgres-test` service is already declared in `docker-compose.yml` — no new containers.

## Running the suite

```bash
# Full suite (parallel workers, ~<3 min wall-clock)
pnpm --filter @m5nita/api test:integration

# Single scenario file
pnpm --filter @m5nita/api test:integration scenarios/pool-lifecycle.test.ts

# Single scenario by test name
pnpm --filter @m5nita/api test:integration -t 'paid join via InfinitePay'

# Watch mode for a single file (fastest dev loop)
pnpm --filter @m5nita/api test:integration --watch scenarios/predictions-and-scoring.test.ts
```

Environment variable: `DATABASE_URL` defaults to `postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test` for local runs. CI overrides it to point at the GitHub Actions Postgres service. The suite's global setup reads this URL, creates (or reuses) a template database `m5nita_test_template`, and applies migrations into it exactly once per suite run.

## First-run behavior

1. Global setup connects to Postgres, creates `m5nita_test_template` if absent, applies all migrations.
2. Each worker creates `m5nita_test_w<worker-id>` as a fresh clone of the template.
3. Before each test, the worker drops + reclones its database in ~50–150 ms.

If Postgres is unreachable or credentials are wrong, the suite fails loudly with a single clear message — it never falls back to a mock (FR-008).

## Writing a new scenario

```ts
// apps/api/tests/integration/scenarios/my-feature.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { buildTestApp } from '../support/app'
import { signInViaPhoneOtp } from '../support/auth-helper'
import { makePool } from '../support/fixtures/makePool'
import { infinitePayStub } from '../support/stubs/infinitepay-stub'

describe('my feature', () => {
  let ctx: Awaited<ReturnType<typeof buildTestApp>>

  beforeEach(async ({ task }) => {
    ctx = await buildTestApp()
    ctx.recorder.watch('pool', 'pool_member', 'payment')
  })

  it('does the thing', async () => {
    const admin = await signInViaPhoneOtp(ctx.app, { phoneNumber: '+5511911111111' })
    const pool  = await makePool(ctx, { admin, entryFeeCentavos: 10_000 })

    const player = await signInViaPhoneOtp(ctx.app, { phoneNumber: '+5511922222222' })
    const joinResp = await player.fetch(`/api/pools/${pool.id}/join`, { method: 'POST' })
    expect(joinResp.status).toBe(200)

    const webhook = infinitePayStub.makeWebhook({ payment: /* ... */, status: 'paid' })
    const webhookResp = await infinitePayStub.deliverWebhook(ctx.app, webhook)
    expect(webhookResp.status).toBe(200)

    const state = await player.fetch(`/api/pools/${pool.id}`)
    expect(await state.json()).toMatchObject({ status: 'open', memberCount: 2 })
  })
})
```

Rules of thumb:

1. Always build state through the HTTP routes (`app.fetch` + `player.fetch`) — only use direct DB reads in assertions, never in setup (FR-004).
2. Every money assertion is in centavos (FR-011). A literal `10_000` means R$ 100,00. A literal `100` means R$ 1,00. If you find yourself writing `100.00` in a test — stop.
3. Time-sensitive? Use `ctx.clock.setNow('2026-06-11T17:59:00Z')` and `ctx.clock.advance(2 * 60 * 1000)`. Never `vi.setSystemTime`.
4. Stubs are reset between tests automatically. If you see cross-test contamination, first assume the watched table set is wrong.

## Debugging a failing test

1. Locally: `pnpm --filter @m5nita/api test:integration -t '<test name>' --reporter verbose`.
2. The `.artifacts/` folder contains a JSON bundle for each failure — open it in your editor.
3. Key fields in the bundle:
   - `watchedRows`: the actual rows at failure time.
   - `stubCalls`: what the app sent to InfinitePay / Telegram / Resend / etc. (in order).
   - `lastHttp`: the last `app.fetch` request/response pair the test made.
   - `clock.now`: what the system thought "now" was.
4. In CI: download the `integration-test-failures` artifact from the failed job.

## Adding a new stubbed provider

Checklist:

1. Create `apps/api/tests/integration/support/stubs/<provider>-stub.ts` implementing the shape in `contracts/stub-registry.md`.
2. If HTTP-based: export `handlers` (MSW). If library-object-based: export an object that satisfies the production library's surface and wire it via a container override.
3. Add a line to `setup/per-worker-setup.ts` importing the stub's handlers and resetting it in `afterEach`.
4. Add the provider name to the `StubCallLog.provider` union in `data-model.md`.

## Adding a `Clock` seam to a new call site

If you find yourself reaching for `new Date()` in code that gates a business rule covered by an integration scenario:

1. Add `clock: Clock` to the constructor of the class that needs it (domain or application layer).
2. Wire `container.ts` to pass `clock` in.
3. Replace `new Date()` with `this.clock.now()`.
4. Existing unit tests that passed `now` as an argument keep working unchanged.

Audit-column writes (`createdAt`, `updatedAt`) don't need the Clock — drift of microseconds is invisible to test assertions.

## Constraints you will hit

- **`onUnhandledRequest: 'error'`**: any outbound HTTP call to an unstubbed host fails the test. If you see this, the app is trying to reach a real service — add an MSW handler.
- **3-min wall-clock budget**: the job fails if the suite runs longer. Profile with `pnpm --filter @m5nita/api test:integration --reporter verbose --logHeapUsage` before optimizing.
- **`onUnhandledRequest` inside Better Auth**: some OAuth flows make background calls. If one is missing, add it to `google-oauth-stub.ts`.
