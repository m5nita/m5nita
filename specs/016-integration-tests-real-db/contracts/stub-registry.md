# Contract: Stub Registry

**Location**: `apps/api/tests/integration/support/stubs/*`
**Layer**: Test-support only (never imported by production code)

Every external provider gets one stub module. Each stub exports:

1. A **setup function** the per-worker setup calls to install the stub.
2. A **reset function** called between tests.
3. An **assertion API** the scenarios call to inspect what the app sent or to drive the app from the provider side.

---

## 1. InfinitePay (`infinitepay-stub.ts`)

Intercepts at the HTTP layer via MSW — the real `InfinitePayPaymentGateway` adapter runs end-to-end.

```ts
export interface InfinitePayStub {
  handlers: RequestHandler[]                          // MSW handlers to install
  reset(): void
  lastCheckout(): { url: string; amount: number; metadata: unknown } | null
  allCheckouts(): Array<{ url: string; amount: number; metadata: unknown }>

  makeWebhook(opts: {
    payment: TestPayment
    status: 'paid' | 'failed'
    signature?: 'valid' | 'malformed' | 'wrongly-signed'
    duplicate?: boolean
  }): TestWebhook

  deliverWebhook(app: Hono, webhook: TestWebhook): Promise<Response>

  callLog(): StubCallLog[]
}
```

**Semantics**:
- `POST /checkout` → returns `{ checkoutUrl, reference }` shaped like InfinitePay's real sandbox.
- `makeWebhook({ signature: 'valid' })` signs the body with the configured `INFINITEPAY_WEBHOOK_SECRET`.
- `deliverWebhook` calls `app.fetch('/api/webhooks/infinitepay', { method: 'POST', headers, body })`.
- `duplicate: true` reuses the same idempotency key as the last delivery (for US5 scenario 3).

---

## 2. Telegram (`telegram-stub.ts`)

grammY `Bot` is replaced in the container with a stub implementing the same API surface the `TelegramNotificationService` depends on.

```ts
export interface TelegramStub {
  bot: StubBot                                        // satisfies grammy's Bot shape we use

  sends(): Array<{ chatId: number; text: string }>
  lastSend(chatId?: number): { text: string } | null

  deliverUpdate(update: Update): Promise<void>        // routes a fake update to the bot's handlers
  reset(): void

  callLog(): StubCallLog[]
}
```

**Semantics**:
- `bot.api.sendMessage(chatId, text)` appends to `sends()` and never hits the Telegram API.
- OTP scenarios read the OTP out of the most recent `sends()` entry.
- `deliverUpdate({ message: { text: '/start …', chat: { id: 123 }, … } })` exercises the webhook route `/api/telegram/webhook` (tests can choose to call the route directly or use this shortcut).

---

## 3. Resend (`resend-stub.ts`)

Intercepts outbound `fetch` calls to `https://api.resend.com/emails` via MSW.

```ts
export interface ResendStub {
  handlers: RequestHandler[]
  emails(): Array<{ to: string[]; subject: string; html: string; text: string }>
  lastMagicLinkFor(email: string): { token: string; url: string } | null
  reset(): void
  callLog(): StubCallLog[]
}
```

**Semantics**:
- `lastMagicLinkFor(email)` parses the most recent email's body to extract the Better-Auth magic-link URL, which the auth helper then follows.

---

## 4. Google OAuth (`google-oauth-stub.ts`)

Intercepts the three endpoints Better Auth's Google provider hits: `/token`, `/userinfo`, and the authorize redirect target.

```ts
export interface GoogleOAuthStub {
  handlers: RequestHandler[]
  preAuthorize(opts: { email: string; googleSub: string; emailVerified?: boolean }): string
  reset(): void
  callLog(): StubCallLog[]
}
```

**Semantics**:
- `preAuthorize` returns a fake `code` that, when the app exchanges it at `/token`, resolves to a user with the given email + sub. The auth helper drives the real Better-Auth callback with this code.

---

## 5. Turnstile (`turnstile-stub.ts`)

Intercepts `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` via MSW.

```ts
export interface TurnstileStub {
  handlers: RequestHandler[]
  setMode(mode: 'always-valid' | 'always-invalid' | 'match-token'): void
  addValidToken(token: string): void
  reset(): void
  callLog(): StubCallLog[]
}
```

**Semantics**:
- Default mode `always-valid`.
- Scenarios that test rejection switch to `always-invalid` before the call under test.

---

## 6. Football-data (`football-data-stub.ts`)

Intercepts outbound calls the `FootballDataApiAdapter` makes.

```ts
export interface FootballDataStub {
  handlers: RequestHandler[]
  setFixtures(fixtures: TestMatch[]): void
  setLiveScores(scores: Array<{ matchId: string; homeScore: number; awayScore: number; status: TestMatch['status'] }>): void
  reset(): void
  callLog(): StubCallLog[]
}
```

**Semantics**:
- Scenarios seed the DB with matches directly via fixture builders; the football-data stub is only used when a scenario exercises `syncFixtures()` or `syncLiveScores()` end-to-end.

---

## 7. Global setup / reset

```ts
// apps/api/tests/integration/setup/per-worker-setup.ts
import { setupServer } from 'msw/node'

const server = setupServer(
  ...infinitePayStub.handlers,
  ...resendStub.handlers,
  ...googleOAuthStub.handlers,
  ...turnstileStub.handlers,
  ...footballDataStub.handlers,
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers(...)
  infinitePayStub.reset()
  telegramStub.reset()
  resendStub.reset()
  googleOAuthStub.reset()
  turnstileStub.reset()
  footballDataStub.reset()
})
afterAll(() => server.close())
```

**`onUnhandledRequest: 'error'`** enforces FR-003: any outbound HTTP that doesn't match a handler fails the test immediately instead of silently reaching the internet.

---

## 8. Container wiring for stubs not backed by MSW

`telegram-stub.ts` is injected via container override since grammY is not HTTP-based:

```ts
const app = buildTestApp({
  clock: testClock,
  notificationService: new TelegramNotificationService(telegramStub.bot),
})
```

Every other stub is transparent to the app (MSW intercepts them below the application layer).
