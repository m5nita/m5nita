# Tasks — 013 Cloudflare Turnstile

## Phase 1 — Domain & Port (API)
- [ ] T001 Create `apps/api/src/domain/shared/TurnstileToken.ts` (value object + errors).
- [ ] T002 Add unit tests in `apps/api/src/domain/shared/__tests__/TurnstileToken.test.ts` (empty, > 2048, happy path).
- [ ] T003 Create port `apps/api/src/application/ports/CaptchaVerifier.ts`.

## Phase 2 — Adapter (API)
- [ ] T004 Create `apps/api/src/infrastructure/external/CloudflareTurnstileVerifier.ts` (calls siteverify, 3s timeout, maps result codes).
- [ ] T005 Add unit tests in `apps/api/src/infrastructure/external/__tests__/CloudflareTurnstileVerifier.test.ts` (ok, invalid, timeout-or-duplicate, network error).

## Phase 3 — Middleware & Wiring (API)
- [ ] T006 Create Hono middleware `apps/api/src/infrastructure/http/middleware/turnstileGuard.ts`.
- [ ] T007 Add integration tests `apps/api/src/infrastructure/http/middleware/__tests__/turnstileGuard.test.ts` covering missing header, invalid token, expired, unavailable, pass-through.
- [ ] T008 Wire verifier + middleware into `apps/api/src/container.ts` and apply to the four guarded routes in the server entry (scoped mount, not global).
- [ ] T009 Update `apps/api/.env.example` with `TURNSTILE_SECRET_KEY`.

## Phase 4 — Web client
- [ ] T010 Create `apps/web/src/lib/turnstile.ts` (lazy script loader, `useTurnstile` hook returning `{ token, reset, render }`).
- [ ] T011 Integrate widget into `apps/web/src/routes/login.tsx`: render in main step, disable submit until token, attach `X-Turnstile-Token` header on all Better Auth calls, reset on any captcha error.
- [ ] T012 Update `apps/web/.env.example` with `VITE_TURNSTILE_SITE_KEY`.
- [ ] T013 Configure `authClient` fetch to inject the header from the login flow (either per-call or via a ref-based hook).

## Phase 5 — Verification
- [ ] T014 `pnpm biome check .` clean on new files.
- [ ] T015 `pnpm -r typecheck` passes.
- [ ] T016 `pnpm -r test` passes.
- [ ] T017 Manual smoke: login with test keys, confirm blocked request returns 400 without the header.
