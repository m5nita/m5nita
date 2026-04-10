# Implementation Plan: Social Sign-On & Email Magic Link Authentication

**Branch**: `008-social-email-auth` | **Date**: 2026-04-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-social-email-auth/spec.md`

## Summary

Add Google social sign-in, email magic link authentication, and automatic account linking to the existing Telegram phone-based auth system. Uses Better Auth's built-in social providers, magic link plugin, and account linking config. Email delivery via Resend.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js >= 20)  
**Primary Dependencies**: Hono (API), Better Auth 1.2.x (auth), Drizzle ORM, React 19, TanStack Router/Query, resend (new)  
**Storage**: PostgreSQL 16  
**Testing**: Vitest  
**Target Platform**: Web (PWA), mobile-responsive  
**Project Type**: Web application (monorepo: API + Web + Shared)  
**Performance Goals**: Login page < 2s load, OAuth redirect < 30s total, magic link email < 60s delivery  
**Constraints**: Must not break existing Telegram auth flow.  
**Scale/Scope**: Existing user base on Telegram, expanding to social/email users

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | PASS | Single responsibility maintained — auth config, email delivery, and UI are separate concerns. |
| II. Testing Standards | PASS | Integration tests needed for OAuth callbacks, magic link flow, and account linking. Unit tests for email template and rate limiting. |
| III. UX Consistency | PASS | Login page follows design system. Error states defined for all OAuth failures. Loading states required during OAuth redirects. |
| IV. Performance | PASS | No new heavy dependencies. `resend` (~15KB). Login page load target < 2s maintained. |

No violations. No complexity tracking needed.

## Project Structure

### Documentation (this feature)

```text
specs/008-social-email-auth/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research output
├── data-model.md        # Phase 1 data model
├── quickstart.md        # Phase 1 quickstart guide
├── contracts/
│   └── auth-endpoints.md # Phase 1 API contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
apps/api/
├── src/
│   ├── lib/
│   │   ├── auth.ts          # Modified: add social providers, magic link, account linking
│   │   ├── telegram.ts      # Unchanged
│   │   └── resend.ts        # New: Resend email client
│   └── db/
│       └── schema/
│           └── auth.ts      # Unchanged (schema already supports this)

apps/web/
├── src/
│   ├── lib/
│   │   └── auth.ts          # Modified: add magicLinkClient plugin
│   ├── routes/
│   │   └── login.tsx        # Modified: redesign with social button + magic link + Telegram
│   └── components/
│       └── ui/
│           └── (existing)   # May add social button component

packages/shared/
└── src/
    └── constants/
        └── index.ts         # Modified: add magic link constants
```

**Structure Decision**: Existing monorepo structure (`apps/api`, `apps/web`, `packages/shared`) — no new projects needed. Changes are additive to existing files plus one new utility file (`resend.ts`).

## Implementation Phases

### Phase 1: Backend Config (Foundation)

**Goal**: Configure all auth providers server-side.

1. **Sentinel email for Telegram**: Update `phoneNumber` plugin config — replace fake email generation with inert sentinel domain.
2. **Add Google provider**: Configure `socialProviders.google` in Better Auth config.
3. **Add magic link plugin**: Configure `magicLink` plugin with Resend integration.
4. **Add account linking**: Configure `account.accountLinking` with `trustedProviders: ["google", "magic-link"]`.
5. **Environment variables**: Add all new env vars to `.env.example`.

### Phase 2: Frontend — Login Page Redesign

**Goal**: Redesign login page with all auth methods in correct hierarchy.

1. **Update auth client**: Add `magicLinkClient` plugin to web auth client.
2. **Social sign-in button**: Add "Continue with Google" button at top of login page.
3. **Magic link form**: Add email input + "Send magic link" button below the social button.
4. **Telegram section**: Move existing phone/OTP flow to bottom as secondary option.
5. **Visual hierarchy**: Google button (primary) → separator → magic link → separator → Telegram.
6. **Error/loading states**: Handle OAuth cancellation, magic link sent confirmation, expired link messaging.
7. **Post-login redirect**: Ensure complete-profile redirect works for all new auth methods.

### Phase 3: Testing & Polish

**Goal**: Verify all flows work end-to-end, meet constitution standards.

1. **Integration tests**: OAuth callback handling, magic link send/verify, account linking by email.
2. **Unit tests**: Resend email sending, auth config validation, rate limiting.
3. **E2E manual testing**: Full flow for each provider on mobile and desktop.
4. **Edge case verification**: Expired magic links, cancelled OAuth, rate limiting.
5. **Telegram regression**: Verify existing phone OTP flow is completely unchanged.

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Email scanner bots consume magic link | User can't sign in | Set `allowedAttempts: 3` in magic link config |
| Resend domain verification delay | Can't send emails until verified | Set up DNS early in Phase 1; use Resend sandbox for development |
| Sentinel email introduction affects existing sessions | Users logged out unexpectedly | Only new Telegram signups get sentinel domain; existing rows are left untouched and remain inert |
