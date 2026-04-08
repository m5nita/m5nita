# Tasks: Social Sign-On & Email Magic Link Authentication

**Input**: Design documents from `/specs/008-social-email-auth/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included per project constitution (Principle II — Testing Standards).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and configure environment variables

- [x] T001 Install new dependencies: `pnpm add resend jose --filter @m5nita/api`
- [x] T002 [P] Add new environment variables to `apps/api/.env.example` (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, RESEND_API_KEY)
- [x] T003 [P] Add magic link constants (expiry, rate limit) to `packages/shared/src/constants/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend auth config for ALL providers. MUST complete before any user story work.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Replace `getTempEmail` in phoneNumber plugin config in `apps/api/src/lib/auth.ts` — change from `@m5nita.app` to inert sentinel domain `@phone.noemail.internal` (e.g., `${phone.replace('+', '')}@phone.noemail.internal`), remove `getTempName`. This prevents accidental account linking since domain is non-routable and `emailVerified` stays false. No data migration needed — old `@m5nita.app` emails are equally inert.
- [x] T005 Create Resend email client utility in `apps/api/src/lib/resend.ts` — initialize Resend SDK with RESEND_API_KEY, export a `sendMagicLinkEmail` function that sends branded email with the magic link URL
- [x] T006 [P] Add Google and Apple social providers to Better Auth config in `apps/api/src/lib/auth.ts` — configure `socialProviders.google` (clientId, clientSecret) and `socialProviders.apple` (clientId, clientSecret via JWT)
- [x] T007 [P] Create Apple client secret JWT generator utility in `apps/api/src/lib/apple-auth.ts` — use `jose` to sign ES256 JWT with APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY
- [x] T008 Add magic link plugin to Better Auth config in `apps/api/src/lib/auth.ts` — import `magicLink` from `better-auth/plugins`, configure with `sendMagicLink` callback that includes per-email rate limiting (in-memory Map tracking count + resetAt per email, max 3 per 5 min, throws error if exceeded) before calling Resend utility from T005, set expiresIn and allowedAttempts
- [x] T009 Add account linking config to Better Auth in `apps/api/src/lib/auth.ts` — set `account.accountLinking.enabled: true` with `trustedProviders: ["google", "apple", "magic-link"]`
- [x] T010 Add `https://appleid.apple.com` to `trustedOrigins` array in `apps/api/src/lib/auth.ts` for Apple form_post callback
- [x] T011 Add `magicLinkClient` plugin to web auth client in `apps/web/src/lib/auth.ts` — import from `better-auth/client/plugins`

**Checkpoint**: All backend auth providers configured. Frontend implementation can begin.

---

## Phase 3: User Story 1 — Google Sign-On (Priority: P1) 🎯 MVP

**Goal**: Users can sign in with their Google account via a "Continue with Google" button on the login page.

**Independent Test**: Tap "Continue with Google" on login page → Google consent screen → redirect back with active session → land on home or complete-profile page.

### Implementation for User Story 1

- [x] T012 [US1] Add "Continue with Google" button to login page in `apps/web/src/routes/login.tsx` — call `authClient.signIn.social({ provider: "google", callbackURL: "/", errorCallbackURL: "/login" })` on click
- [x] T013 [US1] Handle Google OAuth error callback on login page in `apps/web/src/routes/login.tsx` — read error from URL query params after redirect and display informational message when user cancels or auth fails
- [x] T014 [US1] Update post-login redirect logic in `apps/web/src/routes/login.tsx` — ensure users without a display name are redirected to `/complete-profile` after Google sign-in (same as existing Telegram flow)

**Checkpoint**: Google Sign-On works end-to-end. Users can sign in via Google and land on correct page.

---

## Phase 4: User Story 2 — Apple Sign-On (Priority: P1)

**Goal**: Users can sign in with their Apple ID via a "Continue with Apple" button on the login page.

**Independent Test**: Tap "Continue with Apple" on login page → Apple sign-in flow → redirect back with active session. (Requires HTTPS staging environment for testing.)

### Implementation for User Story 2

- [x] T015 [US2] Add "Continue with Apple" button to login page in `apps/web/src/routes/login.tsx` — call `authClient.signIn.social({ provider: "apple", callbackURL: "/", errorCallbackURL: "/login" })` on click
- [x] T016 [US2] Handle Apple Sign-In cancellation/error on login page in `apps/web/src/routes/login.tsx` — display informational message when user cancels or Apple auth fails

**Checkpoint**: Apple Sign-On works end-to-end on staging (HTTPS). Apple private relay emails handled correctly.

---

## Phase 5: User Story 4 — Unified Login Page (Priority: P1)

**Goal**: Redesign login page with correct visual hierarchy: social buttons (top) → email magic link (middle) → Telegram/phone (bottom).

**Independent Test**: Visit login page and verify all four sign-in options are visible with correct layout on mobile and desktop.

### Implementation for User Story 4

- [x] T017 [US4] Restructure login page layout in `apps/web/src/routes/login.tsx` — reorder sections: (1) Google + Apple buttons at top, (2) visual separator "ou", (3) email magic link input (placeholder until US3), (4) visual separator "ou", (5) Telegram phone OTP at bottom as secondary option
- [x] T018 [US4] Style social sign-in buttons with provider branding in `apps/web/src/routes/login.tsx` — Google button with Google logo/colors, Apple button with Apple logo/dark style, following each provider's brand guidelines
- [x] T019 [US4] Ensure mobile-responsive layout for all sign-in options in `apps/web/src/routes/login.tsx` — all buttons and forms accessible on small screens, correct touch targets
- [x] T020 [US4] Verify authenticated user redirect in `apps/web/src/routes/login.tsx` — if user already has active session, redirect to home page

**Checkpoint**: Login page displays all sign-in methods with correct visual hierarchy. Mobile and desktop layouts work.

---

## Phase 6: User Story 3 — Email Magic Link (Priority: P2)

**Goal**: Users can sign in by entering their email and clicking a magic link sent to their inbox.

**Independent Test**: Enter email on login page → receive magic link email via Resend → click link → session created and redirected to home or complete-profile page.

### Implementation for User Story 3

- [x] T021 [US3] Replace placeholder email section in login page with functional magic link form in `apps/web/src/routes/login.tsx` — email input field + "Enviar link mágico" button, call `authClient.signIn.magicLink({ email, callbackURL: "/" })`
- [x] T022 [US3] Add "magic link sent" confirmation state in `apps/web/src/routes/login.tsx` — after successful send, show message "Enviamos um link para {email}. Verifique sua caixa de entrada." with option to resend after 30s cooldown
- [x] T023 [US3] Handle magic link verification errors in `apps/web/src/routes/login.tsx` — detect expired/invalid token from URL params and show "Link expirado. Solicite um novo." with button to request new link
- [x] T024 [US3] Create branded magic link email HTML template in `apps/api/src/lib/resend.ts` — style email with M5nita branding, clear CTA button, expiry notice, Portuguese language

**Checkpoint**: Full magic link flow works: send → receive email → click → session active. Expired links handled gracefully.

---

## Phase 7: User Story 5 — Account Linking (Priority: P2)

**Goal**: Users who sign in via different email-based providers (Google, Apple, Magic Link) with the same email access the same unified account.

**Independent Test**: Create account via Google with `user@example.com`, then sign in via Magic Link with same email — verify same account, same data.

### Implementation for User Story 5

- [x] T025 [US5] Add error handling for account linking conflicts in `apps/web/src/routes/login.tsx` — when a provider email is already linked to a different user, show clear error message "Este email já está vinculado a outra conta"
- [x] T026 [US5] Verify account linking config works for Google ↔ Magic Link ↔ Apple in `apps/api/src/lib/auth.ts` — confirm `trustedProviders` array correctly enables auto-linking for email-based providers while excluding phone-number

**Checkpoint**: Cross-provider account linking verified. Same email = same account across Google, Apple, and Magic Link. Telegram stays separate.

---

## Phase 8: Tests & Polish

**Purpose**: Automated tests (constitution requirement), regression testing, error states, and final validation

### Tests (Constitution II — mandatory)

- [x] T027 [P] Unit test for Apple JWT generator in `apps/api/src/lib/__tests__/apple-auth.test.ts` — verify JWT structure, claims (iss, sub, aud, exp), and ES256 signature
- [x] T028 [P] Unit test for Resend magic link email sending in `apps/api/src/lib/__tests__/resend.test.ts` — mock Resend SDK, verify email params (from, to, subject, html with URL)
- [x] T029 [P] Unit test for per-email rate limiting logic in `apps/api/src/lib/__tests__/auth.test.ts` — verify max 3 requests per email per 5 minutes, reset after window
- [x] T030 [P] Integration test for account linking (Google email = Magic Link email → same user) in `apps/api/src/__tests__/account-linking.integration.test.ts` — verify same account accessed via different email-based providers, and Telegram stays separate

### Polish & Cross-Cutting

- [x] T031 [P] Verify existing Telegram phone OTP flow still works unchanged — test full flow: enter phone → receive OTP via Telegram → verify → session active
- [x] T032 [P] Add loading states during OAuth redirects in `apps/web/src/routes/login.tsx` — show spinner/disabled state when user clicks social buttons to prevent double-clicks
- [x] T033 [P] Verify complete-profile redirect works for all new auth methods in `apps/web/src/routes/login.tsx` — new users from Google, Apple, and Magic Link without display name land on `/complete-profile`
- [x] T034 Run `pnpm biome check --write .` to ensure code style compliance
- [x] T035 Run quickstart.md validation — verify all setup steps and flows documented in `specs/008-social-email-auth/quickstart.md` work correctly

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **US1 Google (Phase 3)**: Depends on Phase 2 — can start immediately after
- **US2 Apple (Phase 4)**: Depends on Phase 2 — can run in PARALLEL with Phase 3
- **US4 Login Page (Phase 5)**: Depends on Phase 3 and Phase 4 (needs social buttons to exist)
- **US3 Magic Link (Phase 6)**: Depends on Phase 5 (needs login page layout to add email section)
- **US5 Account Linking (Phase 7)**: Depends on Phase 3, Phase 4, and Phase 6 (needs multiple providers working)
- **Polish (Phase 8)**: Depends on all user story phases

### User Story Dependencies

- **US1 Google (P1)**: Depends only on Foundational — first story to implement
- **US2 Apple (P1)**: Depends only on Foundational — can run parallel with US1
- **US4 Login Page (P1)**: Depends on US1 + US2 (needs social buttons) — layout reorganization
- **US3 Magic Link (P2)**: Depends on US4 (needs login page layout) — adds email section
- **US5 Account Linking (P2)**: Depends on US1 + US3 minimum — cross-provider verification

### Within Each User Story

- Backend config (Phase 2) before frontend implementation
- UI components before error handling
- Core flow before edge cases

### Parallel Opportunities

- T002 and T003 can run in parallel (different files)
- T006, T007, T008 can run in parallel (different files)
- US1 (Phase 3) and US2 (Phase 4) can run in parallel after Foundational
- T027, T028, T029 in Polish phase can run in parallel

---

## Parallel Example: Foundational Phase

```bash
# After T004 (sentinel email config), launch in parallel:
Task T005: "Create Resend email client in apps/api/src/lib/resend.ts"
Task T006: "Add Google and Apple social providers in apps/api/src/lib/auth.ts"
Task T007: "Create Apple JWT generator in apps/api/src/lib/apple-auth.ts"
```

## Parallel Example: User Stories 1 & 2

```bash
# After Foundational phase, launch both stories in parallel:
# Developer A:
Task T012: "Add Google button to login page"
Task T013: "Handle Google OAuth error callback"
Task T014: "Update post-login redirect for Google"

# Developer B:
Task T015: "Add Apple button to login page"
Task T016: "Handle Apple cancellation/error"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (backend config)
3. Complete Phase 3: US1 Google Sign-On
4. **STOP and VALIDATE**: Test Google Sign-On independently
5. Deploy/demo if ready — users can now sign in via Google

### Incremental Delivery

1. Setup + Foundational → Backend ready for all providers
2. US1 Google → First social sign-in option available (MVP!)
3. US2 Apple → Second social sign-in option
4. US4 Login Page → Proper visual hierarchy
5. US3 Magic Link → Universal email fallback
6. US5 Account Linking → Cross-provider unity verified
7. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Apple Sign-In requires HTTPS staging — cannot fully test on localhost
- FR-004 (auto-create), FR-008 (populate profile), FR-010 (invalidate old links), FR-011 (Apple private relay), FR-015 (session behavior) are handled by Better Auth's default behavior — no explicit tasks needed
