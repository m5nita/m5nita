# Data Model — Cloudflare Turnstile

No database changes. Two in-memory domain types only.

## Value Object: `TurnstileToken`

- **Purpose**: Guard the invariant that a Turnstile token is a non-empty string within Cloudflare's documented size limits (≤ 2048 chars).
- **Fields**: `value: string` (opaque).
- **Factories**:
  - `TurnstileToken.fromHeader(raw: string | undefined): TurnstileToken` — throws `MissingCaptchaTokenError` when absent/empty, `InvalidCaptchaTokenError` when > 2048 chars.
- **State**: Immutable, single-use at the domain level (adapter forwards to Cloudflare, which enforces single-use globally).

## Port: `CaptchaVerifier`

```ts
export interface CaptchaVerifier {
  verify(token: TurnstileToken, remoteIp: string | null): Promise<CaptchaResult>
}

export type CaptchaResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'expired' | 'duplicate' | 'unavailable' }
```

- `invalid` — Cloudflare returned `success:false` without a retry-worthy error code.
- `expired` — Cloudflare returned `timeout-or-duplicate` on first use (token aged out).
- `duplicate` — same error code on a second use.
- `unavailable` — network/timeout/5xx from Cloudflare; maps to HTTP 503 upstream.

## Adapter State (`CloudflareTurnstileVerifier`)

- `secretKey: string` (from env).
- `endpoint: string` = `https://challenges.cloudflare.com/turnstile/v0/siteverify` (overridable for tests).
- `timeoutMs: number` = `3000`.

No persistence, no caching — tokens are single-use.
