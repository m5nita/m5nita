# Contract — Turnstile-guarded auth endpoints

## Request shape (applies to all guarded endpoints)

Any request to one of the guarded routes MUST include:

| Header | Required | Notes |
| --- | --- | --- |
| `X-Turnstile-Token` | Yes | Opaque token returned by the Turnstile widget |
| `Content-Type` | Existing | Unchanged from Better Auth defaults |

Guarded routes:

- `POST /api/auth/phone-number/send-otp`
- `POST /api/auth/phone-number/verify-otp`
- `POST /api/auth/sign-in/magic-link`
- `POST /api/auth/sign-in/social`

## Responses

| Situation | HTTP | Body |
| --- | --- | --- |
| Header missing / empty | 400 | `{ "error": "captcha_required" }` |
| Header malformed (> 2048 chars) | 400 | `{ "error": "captcha_invalid" }` |
| Cloudflare rejects (`invalid`) | 403 | `{ "error": "captcha_failed" }` |
| Cloudflare rejects (`expired`/`duplicate`) | 403 | `{ "error": "captcha_expired" }` |
| Cloudflare unreachable/timeout | 503 | `{ "error": "captcha_unavailable" }` |
| Verification passes | — | Request is passed through to Better Auth unchanged |

The middleware never calls `next()` on failure; Better Auth must not observe the request.

## Upstream call (server → Cloudflare)

```
POST https://challenges.cloudflare.com/turnstile/v0/siteverify
Content-Type: application/x-www-form-urlencoded

secret={TURNSTILE_SECRET_KEY}&response={token}&remoteip={client_ip}
```

- Timeout: 3 seconds (`AbortSignal.timeout(3000)`).
- `client_ip`: first of `CF-Connecting-IP`, `X-Forwarded-For` (left-most), socket remote address. Omit the field if none is available rather than sending a bogus value.

## Client-side contract (web)

- The login screen MUST NOT enable the submit button until the Turnstile widget has produced a token.
- The login screen MUST attach `X-Turnstile-Token` on every Better Auth call from the login flow.
- On any `captcha_*` error response, the UI resets the widget and re-requests a token.
