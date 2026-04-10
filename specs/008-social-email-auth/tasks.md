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

- [x] T001 Install new dependencies: `pnpm add resend --filter @m5nita/api`
- [x] T002 [P] Add new environment variables to `apps/api/.env.example` (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, RESEND_API_KEY)
- [x] T003 [P] Add magic link constants (expiry, rate limit) to `packages/shared/src/constants/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend auth config for ALL providers. MUST complete before any user story work.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Replace `getTempEmail` in phoneNumber plugin config in `apps/api/src/lib/auth.ts` — change from `@m5nita.app` to inert sentinel domain `@phone.noemail.internal` (e.g., `${phone.replace('+', '')}@phone.noemail.internal`), remove `getTempName`. This prevents accidental account linking since domain is non-routable and `emailVerified` stays false. No data migration needed — old `@m5nita.app` emails are equally inert.
- [x] T005 Create Resend email client utility in `apps/api/src/lib/resend.ts` — initialize Resend SDK with RESEND_API_KEY, export a `sendMagicLinkEmail` function that sends branded email with the magic link URL
- [x] T006 Add Google social provider to Better Auth config in `apps/api/src/lib/auth.ts` — configure `socialProviders.google` (clientId, clientSecret)
- [x] T007 Add magic link plugin to Better Auth config in `apps/api/src/lib/auth.ts` — import `magicLink` from `better-auth/plugins`, configure with `sendMagicLink` callback that includes per-email rate limiting (in-memory Map tracking count + resetAt per email, max 3 per 5 min, throws error if exceeded) before calling Resend utility from T005, set expiresIn and allowedAttempts
- [x] T008 Add account linking config to Better Auth in `apps/api/src/lib/auth.ts` — set `account.accountLinking.enabled: true` with `trustedProviders: ["google", "magic-link"]`
- [x] T009 Add `magicLinkClient` plugin to web auth client in `apps/web/src/lib/auth.ts` — import from `better-auth/client/plugins`

**Checkpoint**: All backend auth providers configured. Frontend implementation can begin.

---

## Phase 3: User Story 1 — Google Sign-On (Priority: P1) 🎯 MVP

**Goal**: Users can sign in with their Google account via a "Continue with Google" button on the login page.

**Independent Test**: Tap "Continue with Google" on login page → Google consent screen → redirect back with active session → land on home or complete-profile page.

### Implementation for User Story 1

- [x] T010 [US1] Add "Continue with Google" button to login page in `apps/web/src/routes/login.tsx` — call `authClient.signIn.social({ provider: "google", callbackURL: "/", errorCallbackURL: "/login" })` on click
- [x] T011 [US1] Handle Google OAuth error callback on login page in `apps/web/src/routes/login.tsx` — read error from URL query params after redirect and display informational message when user cancels or auth fails
- [x] T012 [US1] Update post-login redirect logic in `apps/web/src/routes/login.tsx` — ensure users without a display name are redirected to `/complete-profile` after Google sign-in (same as existing Telegram flow)

**Checkpoint**: Google Sign-On works end-to-end. Users can sign in via Google and land on correct page.

---

## Phase 4: User Story 3 — Unified Login Page (Priority: P1)

**Goal**: Redesign login page with correct visual hierarchy: Google button (top) → email magic link (middle) → Telegram/phone (bottom).

**Independent Test**: Visit login page and verify all three sign-in options are visible with correct layout on mobile and desktop.

### Implementation for User Story 3

- [x] T013 [US3] Restructure login page layout in `apps/web/src/routes/login.tsx` — reorder sections: (1) Google button at top, (2) visual separator "ou", (3) email magic link input (placeholder until US2), (4) visual separator "ou", (5) Telegram phone OTP at bottom as secondary option
- [x] T014 [US3] Style the Google button with provider branding in `apps/web/src/routes/login.tsx` — Google button with Google logo/colors following brand guidelines
- [x] T015 [US3] Ensure mobile-responsive layout for all sign-in options in `apps/web/src/routes/login.tsx` — all buttons and forms accessible on small screens, correct touch targets
- [x] T016 [US3] Verify authenticated user redirect in `apps/web/src/routes/login.tsx` — if user already has active session, redirect to home page

**Checkpoint**: Login page displays all sign-in methods with correct visual hierarchy. Mobile and desktop layouts work.

---

## Phase 5: User Story 2 — Email Magic Link (Priority: P2)

**Goal**: Users can sign in by entering their email and clicking a magic link sent to their inbox.

**Independent Test**: Enter email on login page → receive magic link email via Resend → click link → session created and redirected to home or complete-profile page.

### Implementation for User Story 2

- [x] T017 [US2] Replace placeholder email section in login page with functional magic link form in `apps/web/src/routes/login.tsx` — email input field + "Enviar link mágico" button, call `authClient.signIn.magicLink({ email, callbackURL: "/" })`
- [x] T018 [US2] Add "magic link sent" confirmation state in `apps/web/src/routes/login.tsx` — after successful send, show message "Enviamos um link para {email}. Verifique sua caixa de entrada." with option to reenviar após cooldown de 30s
- [x] T019 [US2] Handle magic link verification errors in `apps/web/src/routes/login.tsx` — detect expired/invalid token from URL params and show "Link expirado. Solicite um novo." with button to request new link
- [x] T020 [US2] Create branded magic link email HTML template in `apps/api/src/lib/resend.ts` — style email with M5nita branding, clear CTA button, expiry notice, Portuguese language

**Checkpoint**: Full magic link flow works: send → receive email → click → session active. Expired links handled gracefully.

---

## Phase 6: User Story 4 — Account Linking (Priority: P2)

**Goal**: Users who sign in via different email-based providers (Google, Magic Link) with the same email access the same unified account.

**Independent Test**: Create account via Google with `user@example.com`, then sign in via Magic Link with same email — verify same account, same data.

### Implementation for User Story 4

- [x] T021 [US4] Add error handling for account linking conflicts in `apps/web/src/routes/login.tsx` — when a provider email is already linked to a different user, show clear error message "Este email já está vinculado a outra conta"
- [x] T022 [US4] Verify account linking config works for Google ↔ Magic Link in `apps/api/src/lib/auth.ts` — confirm `trustedProviders` array correctly enables auto-linking for email-based providers while excluding phone-number

**Checkpoint**: Cross-provider account linking verified. Same email = same account across Google and Magic Link. Telegram stays separate.

---

## Phase 7: Tests & Polish

**Purpose**: Automated tests (constitution requirement), regression testing, error states, and final validation

### Tests (Constitution II — mandatory)

- [x] T023 [P] Unit test for Resend magic link email sending in `apps/api/src/lib/__tests__/resend.test.ts` — mock Resend SDK, verify email params (from, to, subject, html with URL)
- [x] T024 [P] Unit test for per-email rate limiting logic in `apps/api/src/lib/__tests__/auth.test.ts` — verify max 3 requests per email per 5 minutes, reset after window
- [x] T025 [P] Integration test for account linking (Google email = Magic Link email → same user) in `apps/api/src/__tests__/account-linking.integration.test.ts` — verify same account accessed via different email-based providers, and Telegram stays separate

### Polish & Cross-Cutting

- [x] T026 [P] Verify existing Telegram phone OTP flow still works unchanged — test full flow: enter phone → receive OTP via Telegram → verify → session active
- [x] T027 [P] Add loading state during OAuth redirect in `apps/web/src/routes/login.tsx` — show spinner/disabled state when user clicks the Google button to prevent double-clicks
- [x] T028 [P] Verify complete-profile redirect works for all new auth methods in `apps/web/src/routes/login.tsx` — new users from Google and Magic Link without display name land on `/complete-profile`
- [x] T029 Run `pnpm biome check --write .` to ensure code style compliance
- [x] T030 Run quickstart.md validation — verify all setup steps and flows documented in `specs/008-social-email-auth/quickstart.md` work correctly

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **US1 Google (Phase 3)**: Depends on Phase 2 — can start immediately after
- **US3 Login Page (Phase 4)**: Depends on Phase 3 (needs social button to exist)
- **US2 Magic Link (Phase 5)**: Depends on Phase 4 (needs login page layout to add email section)
- **US4 Account Linking (Phase 6)**: Depends on Phase 3 and Phase 5 (needs multiple providers working)
- **Polish (Phase 7)**: Depends on all user story phases

### User Story Dependencies

- **US1 Google (P1)**: Depends only on Foundational — first story to implement
- **US3 Login Page (P1)**: Depends on US1 (needs social button) — layout reorganization
- **US2 Magic Link (P2)**: Depends on US3 (needs login page layout) — adds email section
- **US4 Account Linking (P2)**: Depends on US1 + US2 minimum — cross-provider verification

### Within Each User Story

- Backend config (Phase 2) before frontend implementation
- UI components before error handling
- Core flow before edge cases

### Parallel Opportunities

- T002 and T003 can run in parallel (different files)
- T023, T024, T025 in Polish phase can run in parallel

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
2. US1 Google → Social sign-in option available (MVP!)
3. US3 Login Page → Proper visual hierarchy
4. US2 Magic Link → Universal email fallback
5. US4 Account Linking → Cross-provider unity verified
6. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- FR-003 (auto-create), FR-007 (populate profile), FR-010 (invalidate old links), FR-014 (session behavior) are handled by Better Auth's default behavior — no explicit tasks needed
