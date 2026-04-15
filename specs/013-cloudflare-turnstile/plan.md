# Implementation Plan: Cloudflare Turnstile on Login Screen

**Branch**: `013-cloudflare-turnstile` | **Date**: 2026-04-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-cloudflare-turnstile/spec.md`

## Summary

Require a Cloudflare Turnstile challenge on the web app's login screen. The browser renders the Turnstile widget, holds the resulting token, and forwards it on every call to the Better Auth endpoints used by the login screen (phone OTP send/verify, magic-link send, social sign-in). A Hono middleware intercepts those requests, validates the token against Cloudflare's `siteverify` endpoint, and rejects the request on failure before Better Auth sees it.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js ≥ 20
**Primary Dependencies**: Hono (API), Better Auth, React 19, TanStack Router, Tailwind v4, Cloudflare Turnstile (loaded via CDN script + `siteverify` HTTPS call)
**Storage**: N/A — Turnstile tokens are single-use and never persisted
**Testing**: Vitest (unit/integration)
**Target Platform**: Web (PWA) + Node.js API
**Project Type**: Web application (apps/api + apps/web)
**Performance Goals**: Added p95 verification latency < 500ms on the auth path
**Constraints**: No secrets in the browser; feature must degrade to an explicit error when Cloudflare is unreachable
**Scale/Scope**: One screen (login), four login flows (phone OTP send, phone OTP verify, magic link send, Google social)

## Constitution Check

| Gate | Status | Notes |
| --- | --- | --- |
| Code Quality (SRP, value objects, ≤10-line methods) | PASS | Single middleware + single verifier adapter; token wrapped in a small value object `TurnstileToken`. |
| Testing Standards (domain 100%, adapter + integration tests) | PASS | Unit test for verifier adapter (mock `fetch`), integration test for middleware on an auth route, UI smoke test for the widget gate. |
| Hexagonal Architecture & SOLID | PASS | Port: `CaptchaVerifier`. Adapter: `CloudflareTurnstileVerifier` under `infrastructure/external`. Consumed by a Hono middleware under `infrastructure/http/middleware`. |
| No dead code / no unneeded dependencies | PASS | Zero new runtime deps on the API (uses `fetch`); web loads Turnstile's script tag lazily on the login route only. |

No violations — Complexity Tracking section omitted.

## Project Structure

### Documentation (this feature)

```text
specs/013-cloudflare-turnstile/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── turnstile-verify.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
apps/api/
├── src/
│   ├── domain/shared/
│   │   └── TurnstileToken.ts                      # value object (token format guard)
│   ├── application/ports/
│   │   └── CaptchaVerifier.ts                     # port
│   ├── infrastructure/
│   │   ├── external/
│   │   │   ├── CloudflareTurnstileVerifier.ts     # adapter (siteverify)
│   │   │   └── __tests__/CloudflareTurnstileVerifier.test.ts
│   │   └── http/middleware/
│   │       ├── turnstileGuard.ts                  # Hono middleware
│   │       └── __tests__/turnstileGuard.test.ts
│   └── container.ts                               # wire adapter + middleware
└── .env.example                                   # TURNSTILE_SECRET_KEY

apps/web/
└── src/
    ├── lib/
    │   └── turnstile.ts                           # widget loader + hook
    └── routes/
        └── login.tsx                              # integrate widget + attach header
```

**Structure Decision**: Extend the existing hexagonal API layout (domain → application → infrastructure) and the existing `apps/web` React app. No new top-level packages.

## Phase 0 — Outline & Research

See [research.md](./research.md). All NEEDS CLARIFICATION items resolved.

## Phase 1 — Design & Contracts

See [data-model.md](./data-model.md), [contracts/turnstile-verify.md](./contracts/turnstile-verify.md), [quickstart.md](./quickstart.md).
