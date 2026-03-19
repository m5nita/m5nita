# Implementation Plan: Replace Twilio with Telegram Bot for OTP Delivery

**Branch**: `002-telegram-otp` | **Date**: 2026-03-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-telegram-otp/spec.md`

## Summary

Replace Twilio WhatsApp SDK with a Telegram Bot (via grammY) for OTP code delivery. Users register their phone number with the bot once, then receive OTP codes via Telegram messages on login. This eliminates Twilio's per-message costs while maintaining the same phone+OTP authentication flow.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js >= 20)
**Primary Dependencies**: Hono, Better Auth (phone-number plugin), Drizzle ORM, grammY (new)
**Storage**: PostgreSQL 16 (new `telegram_chat` table)
**Testing**: Vitest
**Target Platform**: Web (React 19 PWA) + API server
**Project Type**: Web application (monorepo: apps/api + apps/web + packages/shared)
**Performance Goals**: OTP delivery < 2 seconds
**Constraints**: Bot must validate webhook secret; phone format must match existing `+55...` format
**Scale/Scope**: Same user base as existing app

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | PASS | Single-responsibility functions, typed interfaces via grammY |
| II. Testing Standards | PASS | Unit tests for bot handlers, integration tests for OTP flow |
| III. UX Consistency | PASS | Login flow remains phone+OTP; new Telegram setup step has clear instructions |
| IV. Performance | PASS | Telegram API latency < 1s; no bundle size increase on frontend |

**Post-Phase 1 Re-check:**

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | PASS | grammY is well-typed; new table schema follows existing patterns |
| II. Testing Standards | PASS | Mocking `bot.api.sendMessage` for unit tests; contract tests for webhook |
| III. UX Consistency | PASS | Error state for unconnected phones provides actionable guidance |
| IV. Performance | PASS | Single DB lookup + single HTTP call to Telegram; well within 200ms p95 budget |

## Project Structure

### Documentation (this feature)

```text
specs/002-telegram-otp/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── api.md           # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
apps/api/
├── src/
│   ├── db/
│   │   └── schema/
│   │       ├── auth.ts           # Existing (no changes)
│   │       └── telegram.ts       # NEW: telegram_chat table schema
│   ├── lib/
│   │   ├── auth.ts               # MODIFY: replace Twilio sendOTP with Telegram
│   │   └── telegram.ts           # NEW: grammY bot instance + handlers
│   ├── routes/
│   │   └── telegram.ts           # NEW: webhook route
│   └── middleware/
│       └── rateLimit.ts          # Existing (no changes needed)
├── package.json                  # MODIFY: remove twilio, add grammy

apps/web/
├── src/
│   ├── routes/
│   │   └── login.tsx             # MODIFY: add Telegram connection instructions
│   └── lib/
│       └── auth.ts               # Existing (no changes)

packages/shared/
└── src/
    └── constants/
        └── index.ts              # Existing (no changes needed)
```

**Structure Decision**: Follows existing monorepo layout. New Telegram-specific files are isolated in `lib/telegram.ts` (bot logic) and `routes/telegram.ts` (webhook endpoint). Schema follows existing pattern in `db/schema/`.

## Complexity Tracking

No constitution violations — no entries needed.
