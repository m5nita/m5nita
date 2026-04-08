# Implementation Plan: Social Sign-On & Email Magic Link Authentication

**Branch**: `008-social-email-auth` | **Date**: 2026-04-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-social-email-auth/spec.md`

## Summary

Add Google and Apple social sign-in, email magic link authentication, and automatic account linking to the existing Telegram phone-based auth system. Uses Better Auth's built-in social providers, magic link plugin, and account linking config. Email delivery via Resend. Includes data migration to clean up fake Telegram emails.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js >= 20)  
**Primary Dependencies**: Hono (API), Better Auth 1.2.x (auth), Drizzle ORM, React 19, TanStack Router/Query, resend (new), jose (new)  
**Storage**: PostgreSQL 16  
**Testing**: Vitest  
**Target Platform**: Web (PWA), mobile-responsive  
**Project Type**: Web application (monorepo: API + Web + Shared)  
**Performance Goals**: Login page < 2s load, OAuth redirect < 30s total, magic link email < 60s delivery  
**Constraints**: Must not break existing Telegram auth flow. Apple Sign-In requires HTTPS in production.  
**Scale/Scope**: Existing user base on Telegram, expanding to social/email users

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | PASS | Single responsibility maintained — auth config, email delivery, and UI are separate concerns. No dead code (fake email generation removed). |
| II. Testing Standards | PASS | Integration tests needed for OAuth callbacks, magic link flow, and account linking. Unit tests for Apple JWT generation and email template. |
| III. UX Consistency | PASS | Login page follows design system. Error states defined for all OAuth failures. Loading states required during OAuth redirects. |
| IV. Performance | PASS | No new heavy dependencies. `resend` (~15KB) and `jose` (~45KB, may be transitive dep). Login page load target < 2s maintained. |

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
│   ├── db/
│   │   └── schema/
│   │       └── auth.ts      # Unchanged (schema already supports this)
│   └── migrations/
│       └── XXXX_clean_fake_emails.sql  # New: data migration

apps/web/
├── src/
│   ├── lib/
│   │   └── auth.ts          # Modified: add magicLinkClient plugin
│   ├── routes/
│   │   └── login.tsx        # Modified: redesign with social buttons + magic link + Telegram
│   └── components/
│       └── ui/
│           └── (existing)   # May add social button components

packages/shared/
└── src/
    └── constants/
        └── index.ts         # Modified: add magic link constants
```

**Structure Decision**: Existing monorepo structure (`apps/api`, `apps/web`, `packages/shared`) — no new projects needed. Changes are additive to existing files plus one new utility file (`resend.ts`) and one data migration.

## Implementation Phases

### Phase 1: Data Migration & Backend Config (Foundation)

**Goal**: Clean up fake emails, configure all auth providers server-side.

1. **Data migration**: Create Drizzle migration to null-ify `*@m5nita.app` emails.
2. **Remove fake email generation**: Update `phoneNumber` plugin config — remove `getTempEmail`.
3. **Add social providers**: Configure `socialProviders.google` and `socialProviders.apple` in Better Auth config.
4. **Add magic link plugin**: Configure `magicLink` plugin with Resend integration.
5. **Add account linking**: Configure `account.accountLinking` with `trustedProviders: ["google", "apple", "magic-link"]`.
6. **Apple JWT helper**: Create utility for generating Apple client secret JWT using `jose`.
7. **Environment variables**: Add all new env vars to `.env.example`.

### Phase 2: Frontend — Login Page Redesign

**Goal**: Redesign login page with all auth methods in correct hierarchy.

1. **Update auth client**: Add `magicLinkClient` plugin to web auth client.
2. **Social sign-in buttons**: Add "Continue with Google" and "Continue with Apple" buttons at top of login page.
3. **Magic link form**: Add email input + "Send magic link" button below social buttons.
4. **Telegram section**: Move existing phone/OTP flow to bottom as secondary option.
5. **Visual hierarchy**: Social buttons (primary) → separator → magic link → separator → Telegram.
6. **Error/loading states**: Handle OAuth cancellation, magic link sent confirmation, expired link messaging.
7. **Post-login redirect**: Ensure complete-profile redirect works for all new auth methods.

### Phase 3: Testing & Polish

**Goal**: Verify all flows work end-to-end, meet constitution standards.

1. **Integration tests**: OAuth callback handling, magic link send/verify, account linking by email.
2. **Unit tests**: Apple JWT generation, Resend email sending, auth config validation.
3. **E2E manual testing**: Full flow for each provider on mobile and desktop.
4. **Edge case verification**: Expired magic links, cancelled OAuth, rate limiting.
5. **Telegram regression**: Verify existing phone OTP flow is completely unchanged.

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Apple Sign-In requires HTTPS | Can't test locally | Use staging domain for Apple testing; other providers work on localhost |
| Email scanner bots consume magic link | User can't sign in | Set `allowedAttempts: 3` in magic link config |
| Apple private relay email complicates linking | Potential duplicate accounts | Better Auth uses Apple's stable `sub` claim as `accountId`, not just email |
| Resend domain verification delay | Can't send emails until verified | Set up DNS early in Phase 1; use Resend sandbox for development |
| Fake email cleanup affects existing sessions | Users logged out unexpectedly | Migration only changes `email` field, not session data — sessions are tied to `userId` |
