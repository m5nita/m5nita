# Integration tests

Vitest project that drives the real Hono app against a real Postgres, with
every third-party provider stubbed at the network boundary. Each worker gets
a dedicated DB cloned from a pre-migrated template, reset before every test.

## Running

```bash
# One-time (or whenever the test container isn't up)
docker compose up -d postgres-test

# Full suite — parallel workers, ~2-3s wall-clock today
pnpm --filter @m5nita/api test:integration

# One file
pnpm --filter @m5nita/api test:integration scenarios/pool-lifecycle.test.ts

# One scenario by name
pnpm --filter @m5nita/api test:integration -t 'paid join'

# Watch mode on a single file
pnpm --filter @m5nita/api test:integration --watch scenarios/auth.test.ts
```

`DATABASE_URL` defaults to `postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test`
for local runs; CI supplies it as an env on the `test` job.

## How isolation works

- `setup/global-setup.ts` runs once per suite run: (re)creates the template DB
  (`m5nita_test_template`), applies the full Drizzle migration set against it,
  marks it as a template (`datistemplate=true`).
- `setup/per-worker-setup.ts` runs once per Vitest worker: creates
  `m5nita_test_w<VITEST_POOL_ID>` as a fresh clone of the template and
  overrides `process.env.DATABASE_URL` to point at the clone BEFORE any
  application module loads (important for Better-Auth's `drizzleAdapter`,
  which captures the DB handle at module-load time).
- `beforeEach` drops + reclones the worker's database in ~50-150 ms so every
  test starts pristine. Transaction-wrapped rollbacks are NOT used — real
  commits happen the same way they do in production.

## Writing a scenario

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import postgres from 'postgres'
import { buildTestApp } from '../support/app'
import { signInViaPhoneOtp } from '../support/auth-helper'
import { workerConnectionString } from '../support/db-utils'
import { makeCompetition } from '../support/fixtures/makeCompetition'
import { makePool } from '../support/fixtures/makePool'

describe('my feature', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })
  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  it('does the thing', async () => {
    const { app } = buildTestApp({ initialNow: '2026-06-11T12:00:00.000Z' })
    const comp = await makeCompetition(sql)
    const admin = await signInViaPhoneOtp(app, { phoneNumber: '+5511911111111' })
    const pool = await makePool({ admin, competitionId: comp.id, entryFeeCentavos: 10_000 })

    const resp = await admin.fetch(`/api/pools/${pool.id}`)
    expect(resp.status).toBe(200)
  })
})
```

### Ground rules

1. **Drive state through the HTTP routes** (`app.fetch` via the auth helper's
   `fetch`). Only reach into `sql` directly for assertions or for fixtures
   that don't have a public endpoint (competitions, matches, coupons,
   telegram chat linking).
2. **Money in centavos** (`10_000` = R$ 100,00). Floats fail code review.
3. **Time via TestClock.** Never `vi.useFakeTimers` or `new Date()` in tests
   that depend on "now". The `Clock` port is resolved via the container the
   test app builder constructs.
4. **Stubs reset between tests** automatically. If you see cross-test
   contamination, assume the fixture or setup order is the bug, not the DB
   reset.

## Available fixtures + helpers

| Module | Use for |
|---|---|
| `support/auth-helper.ts` | Sign in via the real Better-Auth routes (phone OTP, magic link, Google OAuth). Returns a `TestUser` with a session-authed `fetch`. |
| `support/app.ts` | `buildTestApp({ initialNow?, overrides? })` returns `{ app, clock, otpInbox, container }`. |
| `support/TestClock.ts` | `new TestClock(iso)` + `setNow(...)` / `advance(ms)`. |
| `support/fixtures/makeCompetition.ts` | Insert a competition row. |
| `support/fixtures/makeMatch.ts` + `finishMatch` | Insert matches at a given kickoff; mark them finished with scores. |
| `support/fixtures/makePool.ts` | Drive `POST /api/pools` via an admin — returns `{ id, inviteCode, paymentId, ... }`. |
| `support/fixtures/makeCoupon.ts` | Insert an active coupon. |
| `support/fixtures/linkTelegramChat.ts` | Seed the `telegram_chat` row so `findChatIdByPhone` resolves. |
| `support/payments.ts` | `deliverInfinitePayPaidWebhook(app, paymentId)` and `deliverInfinitePayFailedWebhook(...)`. |
| `support/stubs/*` | One per outbound provider (InfinitePay, Google OAuth, Resend, Turnstile, Telegram bot, football-data). Each exposes `.reset()`, `.callLog()`, and assertion/trigger helpers. |

## Failure artifacts

CI uploads `apps/api/tests/integration/.artifacts/**` on failure
(`actions/upload-artifact@v4`, 7-day retention). Locally, `--reporter verbose`
shows the detailed assertion output inline.

## Wall-clock budget

`scripts/run-with-budget.sh` wraps `vitest run` and fails the CI step if the
suite takes longer than `INTEGRATION_BUDGET_SECONDS` (default 180). Adjust
in `.github/workflows/ci.yml` if the suite grows.

## Constraints you will hit

- **`onUnhandledRequest: 'error'`** — any outbound HTTP to an un-stubbed host
  fails the test immediately. If you see this, add an MSW handler to the
  relevant `support/stubs/<provider>-stub.ts` file.
- **Better-Auth captures `db` at module-load**. Don't override `DATABASE_URL`
  after the first import — `per-worker-setup.ts` already rewrites it at the
  top of the file, before anything else is imported.
- **`$defaultFn` doesn't run in raw SQL inserts**. Fixtures must generate
  their own UUIDs (`crypto.randomUUID()`) before the INSERT.
