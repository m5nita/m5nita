# Contract: Test Auth Helper

**Location**: `apps/api/tests/integration/support/auth-helper.ts`
**Layer**: Test-support only
**Spec anchor**: FR-005, Clarification Q4 (Session 2026-04-20)

The helper creates authenticated `TestUser`s by driving the **real** Better-Auth HTTP routes against the stubbed external transports. It never inserts into `user` / `session` tables, never forges tokens, and never relies on a test-only endpoint.

## Exported functions

```ts
export async function signInViaPhoneOtp(
  app: Hono,
  opts: { phoneNumber: string; displayName?: string }
): Promise<TestUser>

export async function signInViaMagicLink(
  app: Hono,
  opts: { email: string; displayName?: string }
): Promise<TestUser>

export async function signInViaGoogle(
  app: Hono,
  opts: { email: string; googleSub: string; displayName?: string }
): Promise<TestUser>
```

## Returned shape

```ts
type TestUser = {
  id: string
  phoneNumber?: string
  email?: string
  displayName: string
  sessionCookie: string
  fetch: (path: string, init?: RequestInit) => Promise<Response>
}
```

The `fetch` method wraps `app.fetch`, attaches the session cookie, includes the CSRF-safe `Origin` / `Referer` matching `ALLOWED_ORIGIN`, and records each request/response pair in the per-test ring buffer consumed by `FailureRecorder`.

## Flow — phone OTP

1. Helper calls `POST /api/auth/phone-number/send-otp` with body `{ phoneNumber }` and headers `{ 'X-Turnstile-Token': 'valid-test-token' }`.
2. Better Auth's phone-number plugin invokes its configured `sendOTP` callback. In tests, the callback stores `{ phoneNumber → code }` in the `otpInbox` (a plain `Map` owned by the test-support module).
3. Helper reads the code: `const code = otpInbox.get(phoneNumber)`.
4. Helper calls `POST /api/auth/phone-number/verify-otp` with `{ phoneNumber, code }`.
5. Response sets a Better-Auth session cookie. Helper extracts it from `set-cookie`.
6. Helper fetches `GET /api/users/me` with the cookie to resolve the user id + displayName and returns the `TestUser`.

## Flow — magic link

1. `POST /api/auth/sign-in/magic-link` with `{ email }` + Turnstile header.
2. Better Auth calls Resend via the real `sendEmail` path; MSW intercepts; `resendStub.lastMagicLinkFor(email)` returns the URL.
3. Helper `fetch`es the magic-link URL (`GET /api/auth/magic-link/verify?token=…`).
4. Extract session cookie from the redirect response, return `TestUser`.

## Flow — Google OAuth

1. `googleOAuthStub.preAuthorize({ email, googleSub })` primes the stub with the code that will be honored.
2. Helper calls `POST /api/auth/sign-in/social` with `{ provider: 'google' }` + Turnstile header, capturing the authorize redirect URL.
3. Helper extracts the `state` parameter Better Auth generated, then calls the callback route: `GET /api/auth/callback/google?code=<stubbed>&state=<extracted>`.
4. Extract session cookie from the redirect response, return `TestUser`.

## Guarantees

- **No production code path is test-only**: all three flows call routes that exist in production. The only test-only thing is the transport stubs, which are infrastructure-layer swaps.
- **Deterministic**: the stub captures the exact OTP / magic-link / OAuth code the server issues; there is no polling.
- **Fast**: each flow is 2–3 in-process `app.fetch` calls. No real sockets.
- **Parallel-safe**: each worker has its own app instance, its own stubs, its own OTP inbox.

## Non-goals

- The helper does NOT cover every edge case (expired OTP, wrong code, locked account). Those are tested explicitly in `scenarios/auth.test.ts`. The helper's job is to produce a session for scenarios that are *not* testing auth itself.
- The helper does NOT support sign-up with arbitrary profile data; `displayName` is the only configurable profile field on day one. Adding more is a follow-up if a scenario needs it.

## Failure modes

| Failure | Diagnostic |
|---|---|
| OTP not present in inbox | Throws `AuthHelperError('sendOTP not invoked — is the phone-number plugin stubbed correctly?')` |
| verify-otp returns non-2xx | Throws with the full response body in the error message |
| magic link email not in inbox | Throws `AuthHelperError('No magic-link email for <email>')` |
| Google callback not redirected | Throws with the response headers for debugging |
