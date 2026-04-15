# Quickstart — Cloudflare Turnstile

## 1. Get keys

Cloudflare dashboard → Turnstile → add a site. Copy the **site key** (public) and **secret key** (server).

For local dev and CI, use Cloudflare's published test keys:

| Key | Value | Behavior |
| --- | --- | --- |
| Site key | `1x00000000000000000000AA` | Always passes (visible challenge) |
| Secret key | `1x0000000000000000000000000000000AA` | Always validates |

## 2. Configure environments

**`apps/api/.env`**
```
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

**`apps/web/.env`**
```
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA
```

`.env.example` in both apps must be updated to include the new variables.

## 3. Verify locally

```bash
pnpm dev
# open http://localhost:5173/login
# confirm the widget renders and the submit button is disabled until the challenge succeeds
# submit magic-link and phone-OTP flows; both should work with test keys
```

## 4. Verify blocking path

With the dev server running, remove the `X-Turnstile-Token` header via curl:

```bash
curl -i -X POST http://localhost:3000/api/auth/sign-in/magic-link \
  -H 'Content-Type: application/json' \
  -d '{"email":"someone@example.com"}'
# expect: HTTP/1.1 400 {"error":"captcha_required"}
```

## 5. Run tests

```bash
pnpm -r test            # includes verifier adapter + middleware tests
pnpm biome check .      # lint
pnpm -r typecheck
```
