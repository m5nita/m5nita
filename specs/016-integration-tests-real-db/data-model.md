# Data Model: Integration-Test Support Entities

**Feature**: 016-integration-tests-real-db
**Phase**: 1 — Design
**Note**: This feature does NOT introduce any new database tables or migrations. It reuses the existing schema. What follows is the in-test support model — the types that tests use to build scenario state and control the system under test. Production data-model changes are limited to the `Clock` port (an interface, not a table).

---

## 1. `Clock` port (production-owned)

Lives at `apps/api/src/domain/shared/Clock.ts`.

```ts
export interface Clock {
  now(): Date
}
```

**Relationships**: Resolved by `container.ts` and injected into:

- `Prediction` domain service (lock check)
- `reminderJob`, `closePoolsJob`, `calcPoints`
- Any application use case whose acceptance criteria depend on "now"

**Adapters**:

| Adapter | Location | Behavior |
|---|---|---|
| `SystemClock` | `apps/api/src/infrastructure/clock/SystemClock.ts` | `now() => new Date()` |
| `TestClock` | `apps/api/tests/integration/support/TestClock.ts` | Holds a mutable internal `Date`; `setNow(d)` replaces, `advance(ms)` adds |

**Validation rules**:
- `TestClock.setNow(d)` must reject `NaN` dates (fail fast if a test passes garbage).
- `TestClock.advance(ms)` accepts negative values (scenarios may rewind).

**State transitions**: `TestClock` has only one state dimension (`currentInstant`). Each test instantiates its own clock; state does not survive across tests.

---

## 2. `TestUser`

Built by `support/fixtures/makeUser.ts`.

```ts
type TestUser = {
  id: string                 // db-generated
  phoneNumber: string        // '+5511900000001' etc., per-test unique
  email: string              // `u-${scenarioTag}-${n}@test.local`
  displayName: string        // 'Alice Test'
  sessionCookie: string      // set-cookie value returned by Better Auth after OTP/magic-link/Google flow
  fetch: (path: string, init?: RequestInit) => Promise<Response>  // pre-configured with the session cookie
}
```

**Identity & uniqueness**:
- Phone numbers are generated deterministically per scenario (`+55119${VITEST_POOL_ID.padStart(2,'0')}${seq}`), so two parallel workers never collide inside the same test DB (they have separate DBs anyway) and two tests in the same worker get fresh DBs (so numbers are reset).
- Emails are namespaced per scenario to aid failure-bundle readability.

**Lifecycle**:
1. Helper requests OTP / magic-link / OAuth code.
2. Stub captures outbound message, exposes it.
3. Helper completes the flow, receives the session cookie.
4. `TestUser` is returned to the scenario; garbage-collected when the test ends.

**No persistence beyond the test DB**: the DB is dropped + recloned at the start of the next test, so `TestUser` rows do not leak.

---

## 3. `TestPool`

Built by `support/fixtures/makePool.ts`. Thin wrapper around the real `Pool` entity plus the admin's session.

```ts
type TestPool = {
  id: string
  admin: TestUser
  inviteCode: string
  entryFeeCentavos: number
  competitionId: string
  matchdayFrom: number | null
  matchdayTo: number | null
}
```

**Invariants** (enforced by the real `Pool` domain entity, not by the test):
- `entryFeeCentavos` integer, non-negative, bounded by the existing `EntryFee` value object rules.
- `inviteCode` non-empty, unique per DB (enforced by the DB schema).

**State transitions**: `status: 'open' → 'closed' → 'completed'`, driven by the real `Pool` entity + `closePoolsJob`.

---

## 4. `TestCompetition` + `TestMatches`

Built by `support/fixtures/makeCompetition.ts` + `makeMatches.ts`.

```ts
type TestCompetition = { id: string; name: string; season: string }
type TestMatch = {
  id: string
  competitionId: string
  matchday: number
  stage: 'group' | 'round_of_16' | 'quarter' | 'semi' | 'final'
  homeTeam: string
  awayTeam: string
  matchDate: Date        // set relative to TestClock.now()
  status: 'scheduled' | 'in_play' | 'finished'
  homeScore: number | null
  awayScore: number | null
}
```

**Validation** (inherited from production schema + the `MatchdayRange` value object):
- `matchday ≥ 1`.
- If `status = 'finished'`, `homeScore` and `awayScore` must be set.

**Typical fixture shape** used by scoring scenarios:
- 3 group-stage matches at `matchday 1` (two finished, one scheduled 30 min in the future).
- 1 round-of-16 match at `matchday 9` (scheduled 2 h in the future).

Fixture builders accept `{ kickoffOffsetMs: number }` relative to `TestClock.now()` so tests express "30 minutes from now" declaratively.

---

## 5. `TestPayment` + `TestWebhook`

```ts
type TestPayment = {
  id: string
  poolId: string
  userId: string
  amountCentavos: number
  gateway: 'infinitepay'
  providerReference: string
  status: 'pending' | 'paid' | 'failed'
}

type TestWebhook = {
  headers: Record<string, string>  // including gateway signature
  body: string                     // raw JSON, signed
}
```

`TestWebhook` instances are produced by the InfinitePay stub — `infinitePayStub.makeWebhook({ status: 'paid', payment })` — signed with the same secret the server verifies against. Scenarios POST them to `/api/webhooks/infinitepay` via `app.fetch`.

**Negative-case support**: the stub also exposes `makeMalformedWebhook()` and `makeWronglySignedWebhook()` for FR-012 coverage.

---

## 6. `StubCallLog`

A ring buffer maintained by each stub:

```ts
type StubCallLog = {
  provider: 'infinitepay' | 'telegram' | 'resend' | 'google-oauth' | 'turnstile' | 'football-data'
  timestamp: string       // ISO
  direction: 'outbound' | 'inbound'
  summary: string         // 'POST /checkout', 'sendMessage(chat=123, text="…")'
  payload: unknown        // redacted when sensitive
}
```

**Reset**: `afterEach` clears every stub's call log, so scenarios start with an empty log.

**Used by**: `FailureRecorder` (Section 7), assertion APIs on each stub (`expect(infinitePayStub.callLog()).toMatchObject(...)`).

---

## 7. `FailureBundle` (CI artifact schema)

Shape of the JSON written to `apps/api/tests/integration/.artifacts/<scenario>.json` on failure:

```json
{
  "scenario": "pool-lifecycle.test.ts > paid join via InfinitePay",
  "failedAt": "2026-04-20T10:17:42.123Z",
  "worker": "3",
  "clock": { "now": "2026-06-11T18:00:00.000Z" },
  "watchedRows": {
    "pool":        [ { "id": "...", "status": "open", ... } ],
    "pool_member": [ { "userId": "...", "status": "paid", ... } ],
    "payment":     [ { "status": "paid", "amount": 10000, ... } ]
  },
  "stubCalls": [
    { "provider": "infinitepay", "summary": "POST /checkout", "timestamp": "..." },
    { "provider": "infinitepay", "summary": "webhook delivered(status=paid)", "timestamp": "..." }
  ],
  "lastHttp": {
    "request":  { "method": "POST", "path": "/api/pools", "body": "..." },
    "response": { "status": 200, "body": "..." }
  }
}
```

**Size budget**: ≤ 50 KB per scenario. Redaction rules:
- PIX keys never appear in `watchedRows` (the encrypted column is included; the decrypted form is not).
- Better-Auth session tokens are truncated to first 8 characters.
- OAuth `id_token` / `access_token` are redacted to `"<redacted>"`.

---

## 8. Existing entities this feature touches indirectly

These production entities are not modified but appear in test fixtures:

- `User`, `Account`, `Session` (Better Auth) — populated by running the real auth routes via stubs.
- `Pool`, `PoolMember`, `Payment`, `Coupon` — populated by real use cases invoked by tests.
- `Prediction`, `Match`, `Competition` — populated by fixture builders + real route POSTs.
- `PrizeWithdrawal` — populated by real `RequestWithdrawalUseCase` invocations via `app.fetch`.
- `TelegramChat` — populated by the Telegram OTP scenario; cleared by DB reset.

No schema migrations are required for this feature.
