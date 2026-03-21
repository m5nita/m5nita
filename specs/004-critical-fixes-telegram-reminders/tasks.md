# Tasks: Critical Fixes + Telegram Prediction Reminders

**Input**: Design documents from `/specs/004-critical-fixes-telegram-reminders/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Required per constitution Principle II. Test tasks included for new public functions.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Type system preparation needed before any implementation

- [x] T001 Add `parsedBody` to AppEnv Variables type in `apps/api/src/types/hono.ts` — add `parsedBody?: { phoneNumber?: string }` to the Variables interface

---

## Phase 2: User Story 1 - OTP Brute-Force Protection (Priority: P1)

**Goal**: Activate per-phone OTP rate limiting (3 req/5min) on the send-otp endpoint

**Independent Test**: Send 4+ OTP requests for the same phone number within 5 minutes and verify the 4th returns 429

### Implementation for User Story 1

- [x] T002 [US1] Mount OTP body parser middleware in `apps/api/src/index.ts` — add `app.post('/api/auth/phone-number/send-otp', ...)` that clones request via `c.req.raw.clone().json()`, parses body, and sets `c.set('parsedBody', body)`. Insert BEFORE the existing `app.all('/api/auth/*', ...)` on line 31. Import `otpRateLimit` from `./middleware/rateLimit`.
- [x] T003 [US1] Mount OTP rate limit middleware in `apps/api/src/index.ts` — add `app.post('/api/auth/phone-number/send-otp', otpRateLimit)` immediately after the body parser middleware from T002, still before the auth catch-all.

### Tests for User Story 1

- [x] T019 [US1] Write integration test for OTP rate limit in `apps/api/src/middleware/__tests__/rateLimit.test.ts` — test that: (1) first 3 OTP requests for same phone return success, (2) 4th request returns 429 with `{ error: 'TOO_MANY_REQUESTS' }`, (3) different phone numbers have independent limits, (4) after window expires requests are allowed again. Use Hono test client to make requests to the mounted middleware chain.

**Checkpoint**: OTP rate limiting is active and tested. 4th request for same phone in 5min returns 429 with "Tente novamente em alguns minutos".

---

## Phase 3: User Story 2 - Prediction Reminder via Telegram (Priority: P1)

**Goal**: Send Telegram reminders to pool members without predictions ~1 hour before match kickoff

**Independent Test**: Create a match scheduled for +30min, have a pool member without prediction with linked Telegram, run `sendPredictionReminders()`, verify Telegram message received

### Implementation for User Story 2

- [x] T004 [US2] Create reminder job in `apps/api/src/jobs/reminderJob.ts` — implement `sendPredictionReminders()` function with: (1) query scheduled matches starting within 60 minutes using `and(eq(match.status, 'scheduled'), gt(match.matchDate, now), lte(match.matchDate, oneHourLater))`, (2) for each match, query pool members without predictions using `selectDistinctOn([poolMember.userId])` with LEFT JOIN prediction WHERE `isNull(prediction.id)` and `isNotNull(user.phoneNumber)`, (3) skip matches with null homeTeam/awayTeam (TBD knockout), (4) for each user, check in-memory `Set<string>` dedup (`${userId}:${matchId}`), (5) call `findChatIdByPhone(phoneNumber)` from `apps/api/src/lib/telegram.ts`, skip if null, (6) send message via `bot.api.sendMessage(chatId, message, { parse_mode: 'Markdown' })` with match teams and minutes until kickoff in pt-BR, (7) add to sentReminders Set, (8) wrap individual sends in try/catch to log errors and continue.
- [x] T005 [US2] Schedule reminder job in `apps/api/src/index.ts` — import `sendPredictionReminders` from `./jobs/reminderJob` and add `setInterval(() => { sendPredictionReminders().catch(...) }, 15 * 60 * 1000)` inside the `serve()` callback, after the existing live sync interval. Do NOT run on startup.

### Tests for User Story 2

- [x] T020 [US2] Write unit test for sendPredictionReminders in `apps/api/src/jobs/__tests__/reminderJob.test.ts` — test that: (1) finds scheduled matches within 60-minute window, (2) identifies pool members without predictions via LEFT JOIN, (3) sends only ONE reminder per user per match even if user is in multiple pools, (4) skips users without linked Telegram chat, (5) dedup Set prevents duplicate sends on repeated calls, (6) continues processing when Telegram API fails for one user (try/catch), (7) skips matches with null homeTeam/awayTeam (TBD knockout). Mock `bot.api.sendMessage` and `findChatIdByPhone`. Use real DB queries against test database.

**Checkpoint**: Reminder job runs every 15 minutes and is tested. Users without predictions get one Telegram message per match between 45-60 minutes before kickoff.

---

## Phase 4: User Story 3 - Authenticated Route Protection (Priority: P2)

**Goal**: Redirect unauthenticated users to login at the router level, eliminating content flash

**Independent Test**: Navigate to `/pools/create` while logged out — immediate redirect to `/login` with no content flash

### Implementation for User Story 3

- [x] T006 [P] [US3] Create pools layout route in `apps/web/src/routes/pools/route.tsx` — new file with `createFileRoute('/pools')({ beforeLoad: () => requireAuthGuard(), component: Outlet })`. Import `Outlet` from `@tanstack/react-router` and `requireAuthGuard` from `../../lib/authGuard`.
- [x] T007 [P] [US3] Add auth guard to settings route in `apps/web/src/routes/settings.tsx` — modify the existing `createFileRoute('/settings')` to add `beforeLoad: () => requireAuthGuard()`. Import `requireAuthGuard` from `../lib/authGuard`. Remove any imperative auth checks from the component body if present.
- [x] T008 [US3] Move auth check to beforeLoad in `apps/web/src/routes/invite/$inviteCode.tsx` — (1) modify `createFileRoute('/invite/$inviteCode')` to add `beforeLoad: async ({ location }) => { ... }` that calls `authClient.getSession()`, if no session calls `savePendingRedirect(location.pathname)` and throws `redirect({ to: '/login' })`, if no user.name throws `redirect({ to: '/complete-profile' })`. (2) Remove from component: `useSession` hook usage (line 16), the imperative auth check block (lines 39-43), and `sessionPending` from the loading condition. (3) Remove `enabled: !!session` from the useQuery options since beforeLoad guarantees auth. (4) Import `authClient` from `../../lib/auth` and `redirect` from `@tanstack/react-router` at file level.

**Checkpoint**: All pool routes, settings, and invite pages redirect to login before rendering if not authenticated. Invite URL is preserved for post-login redirect.

---

## Phase 5: User Story 4 + 5 - Dead Code Cleanup & Env Config (Priority: P3)

**Goal**: Remove unused files and no-op code, document missing env vars

**Independent Test**: Application builds, all tests pass, no missing env var documentation

### Implementation for User Stories 4 & 5

- [x] T009 [P] [US4] Delete unused auth route file `apps/api/src/routes/auth.ts` — this file defines `authRoutes` but is never imported anywhere (auth is mounted inline in index.ts)
- [x] T010 [P] [US4] Delete unused job wrapper `apps/api/src/jobs/syncFixtures.ts` — `runFixtureSync()` is never called (syncFixtures is called directly from index.ts)
- [x] T011 [P] [US4] Delete unused job wrapper `apps/api/src/jobs/syncLive.ts` — `runLiveSync()` is never called (syncLiveScores is called directly from index.ts)
- [x] T012 [P] [US4] Delete unused Card component `apps/web/src/components/ui/Card.tsx` — never imported in any route or component
- [x] T013 [P] [US4] Remove `requirePoolOwner` function from `apps/api/src/middleware/auth.ts` — it's a no-op (just calls `next()`) and is never imported. Keep `requireAuth` which is widely used.
- [x] T014 [P] [US5] Add `ALLOWED_ORIGIN=http://localhost:5173` to `apps/api/.env.example` — insert after the `PORT=3001` line and before `NODE_ENV=development`

**Checkpoint**: Build succeeds, tests pass, no type errors. All runtime env vars documented in .env.example.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation and cleanup across all changes

- [x] T015 Run `pnpm biome check --write .` to lint and format all modified/created files
- [x] T016 Run `pnpm typecheck` to verify no type errors from AppEnv change, removed files, or new imports
- [x] T017 Run `pnpm test` to verify all existing tests still pass (including new T019 and T020)
- [x] T018 Run `pnpm build` to verify production build succeeds after all changes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (US1 - OTP)**: Depends on Phase 1 (T001 for parsedBody type)
- **Phase 3 (US2 - Reminder)**: Depends on Phase 1 only. Can run in parallel with Phase 2 (different sections of index.ts)
- **Phase 4 (US3 - Auth Guard)**: No dependencies on other phases (frontend-only changes)
- **Phase 5 (US4+US5 - Cleanup)**: No dependencies on other phases (file deletions and edits)
- **Phase 6 (Polish)**: Depends on ALL previous phases completing

### User Story Dependencies

- **US1 (OTP Rate Limit)**: Depends on T001 (type change). No cross-story dependencies.
- **US2 (Prediction Reminder)**: Independent of other stories. Edits `index.ts` serve() callback (different section than US1).
- **US3 (Auth Guard)**: Fully independent — frontend-only changes.
- **US4+US5 (Cleanup + Env)**: Fully independent — deletes/edits unrelated files.

### Parallel Opportunities

- **T006 + T007** can run in parallel (different frontend files)
- **T009 + T010 + T011 + T012 + T013 + T014** can ALL run in parallel (independent file deletions/edits)
- **Phase 2 + Phase 4 + Phase 5** can all start in parallel after Phase 1
- **Phase 3** can start in parallel with Phase 4 + Phase 5 (no frontend/backend conflicts)

---

## Parallel Example: All Cleanup Tasks

```bash
# Launch all deletion/cleanup tasks together (Phase 5):
Task: "Delete apps/api/src/routes/auth.ts"
Task: "Delete apps/api/src/jobs/syncFixtures.ts"
Task: "Delete apps/api/src/jobs/syncLive.ts"
Task: "Delete apps/web/src/components/ui/Card.tsx"
Task: "Remove requirePoolOwner from apps/api/src/middleware/auth.ts"
Task: "Add ALLOWED_ORIGIN to apps/api/.env.example"
```

## Parallel Example: Auth Guard Tasks

```bash
# Launch independent frontend auth guard tasks together:
Task: "Create apps/web/src/routes/pools/route.tsx"
Task: "Add beforeLoad to apps/web/src/routes/settings.tsx"
# Then sequentially:
Task: "Refactor apps/web/src/routes/invite/$inviteCode.tsx" (more complex, do alone)
```

---

## Implementation Strategy

### MVP First (US1 + US2 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: US1 - OTP Rate Limit (T002-T003)
3. Complete Phase 3: US2 - Prediction Reminder (T004-T005)
4. **STOP and VALIDATE**: Test rate limiting and reminder job
5. Deploy security fix immediately

### Incremental Delivery

1. T001 → Foundation ready
2. T002-T003 → OTP rate limit active (security fix deployed)
3. T004-T005 → Prediction reminders active (engagement feature)
4. T006-T008 → Auth guards at router level (UX improvement)
5. T009-T014 → Dead code cleaned + env documented (DX improvement)
6. T015-T018 → Full validation pass

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each phase completion
- US1 edits `index.ts` lines ~29-31 (middleware section), US2 edits lines ~76-82 (serve callback) — no conflict
