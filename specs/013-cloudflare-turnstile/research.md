# Phase 0 Research — Cloudflare Turnstile on Login

## R1: Token delivery from web client to API

- **Decision**: Send the token in an `X-Turnstile-Token` request header on every call to `/api/auth/**` originating from the login screen.
- **Rationale**: Better Auth controls the request bodies for phone OTP, magic link, and social providers. Using a header leaves those bodies untouched and lets a single Hono middleware guard all auth endpoints without per-route changes.
- **Alternatives considered**: Wrap Better Auth calls behind a custom proxy endpoint (adds latency, breaks Better Auth's generated client); inject token into body (would require forking every auth flow).

## R2: Server-side verification transport

- **Decision**: Call `https://challenges.cloudflare.com/turnstile/v0/siteverify` with `secret`, `response` (token), and `remoteip` (from `CF-Connecting-IP` → `X-Forwarded-For` → socket) via `fetch`, 3-second timeout.
- **Rationale**: Cloudflare's documented endpoint; no SDK required; Node ≥ 20 ships native `fetch` and `AbortSignal.timeout`. Zero new runtime dependencies.
- **Alternatives considered**: Any community `turnstile` package (unnecessary indirection, supply-chain surface); JWT-style local verification (Turnstile does not publish keys for this).

## R3: Which endpoints to guard

- **Decision**: Apply the middleware to a narrow allow-list: `POST /api/auth/phone-number/send-otp`, `POST /api/auth/phone-number/verify-otp`, `POST /api/auth/sign-in/magic-link`, `POST /api/auth/sign-in/social`.
- **Rationale**: These are the four user-initiated endpoints the login screen hits. Session checks, callbacks, and logout do not need challenges (and would break the Google OAuth callback).
- **Alternatives considered**: Guard everything under `/api/auth/**` (breaks OAuth callback and session endpoints). Guard only phone OTP (leaves magic link and social unprotected).

## R4: Client widget integration

- **Decision**: Use the Cloudflare-hosted script `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`, load it once per login mount, render in managed mode, hold the token in React state, reset the widget after a successful login or after any server-side verification error.
- **Rationale**: Matches Cloudflare's recommended integration for SPAs and gives us explicit control over when to reset the token (it is single-use).
- **Alternatives considered**: `@marsidev/react-turnstile` or similar wrappers (extra dep for trivial logic); invisible mode only (harder to recover when a user needs an interactive challenge).

## R5: Configuration & secrets

- **Decision**: Two new environment variables: `TURNSTILE_SECRET_KEY` (API-only) and `VITE_TURNSTILE_SITE_KEY` (web-only, public). Use Cloudflare's documented test keys in development/test (`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`).
- **Rationale**: Keeps the secret off the client. Test keys make CI deterministic without network calls (and a DI seam in tests swaps the verifier entirely).
- **Alternatives considered**: One combined key (impossible — Cloudflare issues them separately). Hardcoding test keys (done intentionally per Cloudflare docs).

## R6: Failure policy when `siteverify` is unreachable

- **Decision**: Fail closed — return HTTP 503 with a stable error code `captcha_unavailable` and no auth side effects. The web UI shows "Falha na verificação. Tente novamente." with a retry button that also resets the widget.
- **Rationale**: FR-008 and SC-002 require refusing unverified logins in all cases. Open-failing contradicts the spec's threat model (credential stuffing during Cloudflare outages).
- **Alternatives considered**: Fail open (rejected — violates spec). Queue-and-retry (adds complexity with no user benefit).
