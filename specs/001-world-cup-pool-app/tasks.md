# Tasks: Manita — Bolao Copa do Mundo 2026

**Input**: Design documents from `/specs/001-world-cup-pool-app/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/api.md

**Tests**: Per constitution Principle II (Testing Standards), integration and unit tests are included in each user story phase. 80% coverage on new code is mandatory.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Monorepo initialization, tooling, and project scaffolding

- [x] T001 Initialize pnpm monorepo with workspace config in pnpm-workspace.yaml and root package.json
- [x] T002 Create apps/api package with TypeScript, Hono, and dev scripts in apps/api/package.json
- [x] T003 [P] Create apps/web package with Vite, React 19, TypeScript in apps/web/package.json
- [x] T004 [P] Create packages/shared package with TypeScript in packages/shared/package.json
- [x] T005 Configure Biome for lint and format in biome.json at repo root
- [x] T006 Create docker-compose.yml with PostgreSQL 16 and Redis services
- [x] T007 Configure Tailwind CSS v4 with @theme design tokens (navy, cream, red, green, gray) and fonts (Space Grotesk, Inter) in apps/web/src/styles/app.css
- [x] T008 Configure Vite with TanStack Router plugin, React plugin, Tailwind v4 plugin, and vite-plugin-pwa in apps/web/vite.config.ts
- [x] T009 Create TanStack Router root layout with header (back button + menu) in apps/web/src/routes/__root.tsx
- [x] T010 Create shared constants for scoring rules, entry limits, and platform fee in packages/shared/src/constants/index.ts
- [x] T010a [P] Configure Vitest for apps/api and apps/web with shared config, PostgreSQL test database in docker-compose, and coverage threshold (80%) in vitest.config.ts
- [x] T010b [P] Configure CI pipeline with lint (Biome), type check, test suite, coverage threshold, and bundle size check in .github/workflows/ci.yml

**Checkpoint**: Monorepo builds, lint passes, dev servers start (API + Web), PostgreSQL + Redis running via Docker, CI pipeline configured

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema, auth framework, Stripe setup, and API client — MUST complete before ANY user story

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T011 Configure Drizzle ORM client and connection in apps/api/src/db/client.ts
- [x] T012 Create drizzle.config.ts at apps/api root with PostgreSQL dialect and schema path
- [x] T013 Generate Better Auth base schema (user, session, account, verification tables) via `npx auth@latest generate` and place in apps/api/src/db/schema/auth.ts
- [x] T014 Create Pool table schema with all fields, constraints, and indexes in apps/api/src/db/schema/pool.ts
- [x] T015 [P] Create PoolMember table schema with unique(poolId, userId) constraint in apps/api/src/db/schema/poolMember.ts
- [x] T016 [P] Create Payment table schema with unique(stripePaymentIntentId) index in apps/api/src/db/schema/payment.ts
- [x] T017 [P] Create Match table schema with unique(externalId) and indexes on status, matchDate in apps/api/src/db/schema/match.ts
- [x] T018 [P] Create Prediction table schema with unique(userId, poolId, matchId) constraint in apps/api/src/db/schema/prediction.ts
- [x] T019 Create Drizzle relations for all entities in apps/api/src/db/schema/relations.ts
- [x] T020 Create schema barrel export and run drizzle-kit generate + migrate in apps/api/src/db/schema/index.ts
- [x] T021 Configure Better Auth server with phone-number plugin, Drizzle adapter, session config (90 days, 24h updateAge), and sendOTP callback (Twilio placeholder) in apps/api/src/lib/auth.ts
- [x] T022 Create Hono app entry point with CORS, error handling, and route mounting in apps/api/src/index.ts
- [x] T023 Create auth session middleware for protected routes in apps/api/src/middleware/auth.ts
- [x] T024 [P] Create rate limiting middleware using hono-rate-limiter in apps/api/src/middleware/rateLimit.ts
- [x] T025 Mount Better Auth handler on /api/auth/* routes in apps/api/src/routes/auth.ts
- [x] T026 Configure Stripe SDK singleton in apps/api/src/lib/stripe.ts
- [x] T027 Create Hono RPC client for frontend type-safe API calls in apps/web/src/lib/api.ts
- [x] T028 [P] Create Better Auth client for frontend session management in apps/web/src/lib/auth.ts
- [x] T029 [P] Create Stripe Elements setup (loadStripe, Elements provider) in apps/web/src/lib/stripe.ts
- [x] T030 Create shared Zod schemas for pool (name, entryFee), prediction (homeScore, awayScore), and user (name) in packages/shared/src/schemas/index.ts
- [x] T031 Create shared TypeScript types for all entities in packages/shared/src/types/index.ts
- [x] T032 Create reusable UI primitives (Button, Input, Card, Loading, ErrorMessage) with ARIA labels, keyboard navigation, and WCAG 2.1 AA color contrast in apps/web/src/components/ui/

**Checkpoint**: Foundation ready — database migrated, auth working, Stripe configured, API client connected. User story implementation can now begin.

---

## Phase 3: User Story 1 — Autenticacao e Primeiro Acesso (Priority: P1) MVP

**Goal**: Users authenticate via OTP (WhatsApp) and complete their profile on first access

**Independent Test**: A new user can enter phone number, receive OTP, verify it, fill in name, and see the Home screen with their name displayed

### Implementation for User Story 1

- [x] T033 [US1] Create login page with phone input (+55 mask), OTP request button, and OTP verification form in apps/web/src/routes/login.tsx
- [x] T034 [US1] Create phone number input component with Brazilian mask (+55 DD NNNNN-NNNN) and validation in apps/web/src/components/ui/PhoneInput.tsx
- [x] T035 [US1] Create OTP input component (6-digit code) with auto-focus and submit in apps/web/src/components/ui/OtpInput.tsx
- [x] T036 [US1] Create complete-profile page that prompts for name when user.name is null in apps/web/src/routes/complete-profile.tsx
- [x] T037 [US1] Create users route with GET /api/users/me and PATCH /api/users/me endpoints in apps/api/src/routes/users.ts
- [x] T038 [US1] Create auth guard that redirects unauthenticated users to /login and checks name completion in apps/web/src/lib/authGuard.ts
- [x] T039 [US1] Create Home page with user greeting, "Criar bolao" and "Entrar em bolao" CTAs, "Meus boloes" list, and next matches (empty state if no match data yet) in apps/web/src/routes/index.tsx
- [x] T039a [US1] Write integration tests for GET /api/users/me and PATCH /api/users/me endpoints (auth required, name update, phone read-only) in apps/api/src/routes/__tests__/users.test.ts

**Checkpoint**: User Story 1 fully functional — users can authenticate via phone OTP, complete profile, and see Home

---

## Phase 4: User Story 2 — Criar Bolao e Convidar Amigos (Priority: P1)

**Goal**: Authenticated users create pools with payment and share invite links

**Independent Test**: A user creates a pool, pays the entry fee, and obtains a working invite link to share via WhatsApp

### Implementation for User Story 2

- [x] T040 [US2] Create pool service with create logic (validate name/fee, generate inviteCode, create PaymentIntent) in apps/api/src/services/pool.ts
- [x] T041 [US2] Create payment service with createPaymentIntent, handleWebhook (succeeded/failed), and createRefund logic in apps/api/src/services/payment.ts
- [x] T042 [US2] Create pools route with POST /api/pools (create), GET /api/pools (list user pools), GET /api/pools/:poolId (details) in apps/api/src/routes/pools.ts
- [x] T043 [US2] Create Stripe webhook route at POST /api/webhooks/stripe with signature verification and event handling in apps/api/src/routes/webhooks.ts
- [x] T044 [US2] Create pool creation page with name input, entry fee quick-select (R$20/50/100/200), custom value input, and 5% fee display in apps/web/src/routes/pools/create.tsx
- [x] T045 [US2] Create payment component with Stripe PaymentElement (handles Pix QR + card) and 30min Pix timer in apps/web/src/components/pool/PaymentForm.tsx
- [x] T046 [US2] Create invite ticket component with QR code, "Compartilhar via WhatsApp" button (deep link with pre-formatted message: "Entra no meu bolao {name} na Manita! {link}"), and "Copiar link" button in apps/web/src/components/pool/InviteTicket.tsx
- [x] T047 [US2] Create pool card component for "Meus boloes" list on Home (name, members, position) in apps/web/src/components/pool/PoolCard.tsx
- [x] T048 [US2] Update Home page (apps/web/src/routes/index.tsx) to fetch and display user pools list using GET /api/pools
- [x] T048a [US2] Write integration tests for POST /api/pools, GET /api/pools, GET /api/pools/:poolId (validation, payment intent creation, fee calculation) in apps/api/src/routes/__tests__/pools.test.ts
- [x] T048b [US2] Write integration test for POST /api/webhooks/stripe (payment_intent.succeeded creates PoolMember, idempotent handling) in apps/api/src/routes/__tests__/webhooks.test.ts
- [x] T048c [US2] Write unit tests for pool service (inviteCode generation, fee calculation, name/entryFee validation) in apps/api/src/services/__tests__/pool.test.ts

**Checkpoint**: User Story 2 fully functional — users can create pools, pay via Pix/card, and share invite links

---

## Phase 5: User Story 3 — Entrar em Bolao via Convite (Priority: P1)

**Goal**: Users join pools via invite links with payment

**Independent Test**: A user opens an invite link, sees pool details, pays entry fee, and is added as a member

### Implementation for User Story 3

- [x] T049 [US3] Add GET /api/pools/invite/:inviteCode endpoint (public pool info) and POST /api/pools/:poolId/join endpoint (create PaymentIntent for joining) to apps/api/src/routes/pools.ts
- [x] T050 [US3] Add join validation logic to pool service: check isOpen, check not already member, calculate prize total in apps/api/src/services/pool.ts
- [x] T051 [US3] Update webhook handler to create PoolMember on payment_intent.succeeded for join payments in apps/api/src/services/payment.ts
- [x] T052 [US3] Create invite page that loads pool info by inviteCode, shows ticket with details (name, owner, members, prize, fee), and "Pagar e entrar" button in apps/web/src/routes/invite/$inviteCode.tsx
- [x] T053 [US3] Add redirect-after-auth logic: store pending invite URL before auth redirect, restore after login in apps/web/src/lib/authGuard.ts
- [x] T053a [US3] Write integration tests for GET /api/pools/invite/:inviteCode and POST /api/pools/:poolId/join (closed pool, already member, valid join) in apps/api/src/routes/__tests__/pools-join.test.ts

**Checkpoint**: User Story 3 fully functional — invite flow works end-to-end including unauthenticated users

---

## Phase 6: User Story 4 — Palpites Fase de Grupos (Priority: P2)

**Goal**: Pool members make predictions on group stage matches with auto-save

**Independent Test**: A pool member sees group stage matches organized by group, makes predictions, sees them saved, and cannot edit after match starts

### Implementation for User Story 4

- [x] T054 [US4] Create match sync service with API-Football integration: fetch fixtures, upsert matches, sync live scores in apps/api/src/services/match.ts
- [x] T055 [US4] Create cron jobs for fixture sync (daily) and live score sync (every minute during matches) in apps/api/src/jobs/syncFixtures.ts and apps/api/src/jobs/syncLive.ts
- [x] T056 [US4] Create matches route with GET /api/matches (with stage/group/status filters) and GET /api/matches/live in apps/api/src/routes/matches.ts
- [x] T057 [US4] Create prediction service with upsert logic (validate match not started, validate membership, enforce unique constraint) in apps/api/src/services/prediction.ts
- [x] T058 [US4] Create predictions route with GET /api/pools/:poolId/predictions and PUT /api/pools/:poolId/predictions/:matchId in apps/api/src/routes/predictions.ts
- [x] T059 [US4] Create score input component with two number inputs (home x away), debounce 500ms auto-save, and status indicators (saved/locked/finished with points) in apps/web/src/components/prediction/ScoreInput.tsx
- [x] T060 [US4] Create match card component showing flags, team names, date/time, status badge (scheduled/live/finished), and score in apps/web/src/components/match/MatchCard.tsx
- [x] T061 [US4] Create predictions page with matches grouped by group (A-L tabs/accordion), each with ScoreInput, using TanStack Query for data fetching in apps/web/src/routes/pools/$poolId/predictions.tsx
- [x] T062 [US4] Create pool details page with pool info, stats, quick-access to Predictions/Ranking, and admin button (if owner) in apps/web/src/routes/pools/$poolId/index.tsx
- [x] T062a [US4] Write integration tests for PUT /api/pools/:poolId/predictions/:matchId (valid save, match started rejection, non-member rejection, unique constraint) in apps/api/src/routes/__tests__/predictions.test.ts
- [x] T062b [US4] Write unit tests for prediction service (matchDate validation, upsert logic) in apps/api/src/services/__tests__/prediction.test.ts

**Checkpoint**: User Story 4 fully functional — members can make and edit predictions on group stage matches

---

## Phase 7: User Story 6 — Ranking e Resultados (Priority: P2)

**Goal**: Pool ranking is calculated and displayed; match calendar with filters and live indicators

**Independent Test**: After matches finish, ranking shows correct positions with tiebreaker; match calendar filters work

### Implementation for User Story 6

- [x] T063 [US6] Create scoring service with points calculation logic (exact=10, winner+diff=7, winner=5, draw=3, miss=0) triggered when match status changes to finished in apps/api/src/services/scoring.ts
- [x] T064 [US6] Create calcPoints job that processes all predictions for a finished match and updates points in apps/api/src/jobs/calcPoints.ts
- [x] T065 [US6] Create ranking service with query (SUM points, COUNT exact matches, RANK with tiebreaker) in apps/api/src/services/ranking.ts
- [x] T066 [US6] Create ranking route with GET /api/pools/:poolId/ranking in apps/api/src/routes/ranking.ts
- [x] T067 [US6] Create ranking page with ordered list (position, name, points, exact matches), current user highlighted, pull-to-refresh, and prize total in apps/web/src/routes/pools/$poolId/ranking.tsx
- [x] T068 [US6] Create matches page with full calendar, filters by stage and group, live indicator badge, and chronological ordering in apps/web/src/routes/matches.tsx
- [x] T069 [US6] Add live scores polling with TanStack Query refetchInterval (30s when live matches exist) to match-related pages
- [x] T069a [US6] Write unit tests for scoring service with all 5 point scenarios (exact=10, winner+diff=7, winner=5, draw=3, miss=0) and edge cases in apps/api/src/services/__tests__/scoring.test.ts
- [x] T069b [US6] Write integration tests for GET /api/pools/:poolId/ranking (correct ordering, tiebreaker by exact matches, current user flag) in apps/api/src/routes/__tests__/ranking.test.ts

**Checkpoint**: User Story 6 fully functional — ranking accurate with tiebreaker, match calendar filterable with live indicators

---

## Phase 8: User Story 5 — Palpites Mata-mata (Priority: P3)

**Goal**: Bracket visual for knockout stages with predictions

**Independent Test**: After group stage, user sees bracket with qualified teams and can predict knockout matches

### Implementation for User Story 5

- [x] T070 [US5] Create bracket component with visual connected lines between stages (round-of-32 to final) in apps/web/src/components/match/Bracket.tsx
- [x] T071 [US5] Create knockout predictions page with bracket view and ScoreInput for each defined match in apps/web/src/routes/pools/$poolId/predictions.tsx (extend existing page with knockout tab)
- [x] T072 [US5] Add knockout match filtering to predictions route — separate group and knockout stages in response in apps/api/src/routes/predictions.ts

**Checkpoint**: User Story 5 fully functional — bracket displays correctly with empty slots for undefined teams

---

## Phase 9: User Story 7 — Gestao do Bolao (Priority: P3)

**Goal**: Pool owner can manage pool: edit name, remove members (with refund), close entries, cancel pool

**Independent Test**: Admin removes a member (refund processed), blocks entries, and cancels pool (all refunded)

### Implementation for User Story 7

- [x] T073 [US7] Add admin endpoints to pools route: GET /api/pools/:poolId/members, DELETE /api/pools/:poolId/members/:memberId, POST /api/pools/:poolId/cancel in apps/api/src/routes/pools.ts
- [x] T074 [US7] Add refund logic to payment service: single member refund and bulk refund (cancel pool) via Stripe Refund API in apps/api/src/services/payment.ts
- [x] T075 [US7] Add owner authorization middleware check for admin endpoints in apps/api/src/middleware/auth.ts
- [x] T076 [US7] Create pool management page with: edit name, member list with remove button, toggle isOpen, cancel pool button with confirmation in apps/web/src/routes/pools/$poolId/manage.tsx
- [x] T076a [US7] Write integration tests for admin endpoints (owner-only access, remove member with refund, cancel pool, block cancel after prize) in apps/api/src/routes/__tests__/pools-admin.test.ts

**Checkpoint**: User Story 7 fully functional — admin can manage pool, refunds processed correctly

---

## Phase 10: User Story 8 — Configuracoes e Perfil (Priority: P4)

**Goal**: User settings page with name edit, phone display, logout

**Independent Test**: User edits name, sees phone (read-only), logs out successfully

### Implementation for User Story 8

- [x] T077 [US8] Create settings page with name edit form, phone display (read-only), notification toggle (UI-only, persists preference locally), help/FAQ section (static content), logout button, and app version in apps/web/src/routes/settings.tsx

**Checkpoint**: User Story 8 fully functional — settings, profile, notifications toggle, help, and logout working

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: PWA, seed data, error handling, and overall quality improvements

- [ ] T078 [P] Configure PWA manifest (name, icons, theme_color #1a1a2e, display standalone) and service worker with runtime caching in apps/web/vite.config.ts
- [ ] T079 [P] Create dev seed script with sample users, pools, matches, predictions, and payments in apps/api/src/db/seed.ts
- [ ] T080 [P] Create env.example files for apps/api and apps/web with all required environment variables
- [ ] T081 Add global error boundary component with user-friendly error messages and retry action in apps/web/src/components/ui/ErrorBoundary.tsx
- [ ] T082 Add empty state components for pools list, predictions, and ranking in apps/web/src/components/ui/EmptyState.tsx
- [ ] T083 Add loading skeleton components for pool cards, match cards, and ranking rows in apps/web/src/components/ui/Skeleton.tsx
- [ ] T084 Review and add all database indexes per data-model.md specification
- [ ] T085 Run quickstart.md validation — verify full setup from clone to running dev environment
- [ ] T086 Accessibility audit: verify WCAG 2.1 AA compliance across all pages — ARIA labels, keyboard navigation, color contrast, focus management, screen reader support
- [ ] T087 Add bundle size monitoring to CI — fail build if any chunk exceeds budget threshold per constitution Principle IV

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 Auth (Phase 3)**: Depends on Foundational — BLOCKS US2, US3
- **US2 Create Pool (Phase 4)**: Depends on US1 (requires auth)
- **US3 Join Pool (Phase 5)**: Depends on US2 (requires pool creation + payment flow)
- **US4 Predictions Groups (Phase 6)**: Depends on Foundational. Match sync is an internal prerequisite within this phase
- **US6 Ranking (Phase 7)**: Depends on US4 (requires predictions + scoring)
- **US5 Predictions Knockout (Phase 8)**: Depends on US4 (extends prediction UI)
- **US7 Admin (Phase 9)**: Depends on US2 (requires pool + payment infrastructure)
- **US8 Settings (Phase 10)**: Depends on US1 (requires auth)
- **Polish (Phase 11)**: Depends on all desired user stories being complete

### User Story Dependencies

```
Phase 1 (Setup)
  └── Phase 2 (Foundational)
        ├── Phase 3 (US1: Auth) ──── Phase 10 (US8: Settings)
        │     └── Phase 4 (US2: Create Pool) ── Phase 9 (US7: Admin)
        │           └── Phase 5 (US3: Join Pool)
        └── Phase 6 (US4: Predictions Groups)
              ├── Phase 7 (US6: Ranking)
              └── Phase 8 (US5: Predictions Knockout)
```

### Within Each User Story

- Models/schemas before services
- Services before routes/endpoints
- Backend before frontend pages
- Core implementation before integration

### Parallel Opportunities

- **Phase 1**: T003, T004 can run in parallel
- **Phase 2**: T014-T018 (all schema files) can run in parallel; T027-T029 can run in parallel
- **Phase 4 + Phase 6**: US2 (Create Pool) and US4 (Predictions) can start in parallel after Foundational, as they touch different files
- **Phase 11**: T078, T079, T080 can all run in parallel

---

## Parallel Example: Foundational Phase

```bash
# Launch all schema files together:
Task: "Create Pool table schema in apps/api/src/db/schema/pool.ts"
Task: "Create PoolMember table schema in apps/api/src/db/schema/poolMember.ts"
Task: "Create Payment table schema in apps/api/src/db/schema/payment.ts"
Task: "Create Match table schema in apps/api/src/db/schema/match.ts"
Task: "Create Prediction table schema in apps/api/src/db/schema/prediction.ts"

# Launch frontend lib files together:
Task: "Create Hono RPC client in apps/web/src/lib/api.ts"
Task: "Create Better Auth client in apps/web/src/lib/auth.ts"
Task: "Create Stripe Elements setup in apps/web/src/lib/stripe.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1-3 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: US1 Auth
4. Complete Phase 4: US2 Create Pool
5. Complete Phase 5: US3 Join Pool
6. **STOP and VALIDATE**: Users can authenticate, create pools, pay, and invite friends
7. Deploy/demo if ready — this is a viable MVP

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 Auth → Users can log in (deployable)
3. US2 Create Pool + US3 Join Pool → Core pool functionality (MVP!)
4. US4 Predictions + US6 Ranking → Competition functionality
5. US5 Knockout + US7 Admin + US8 Settings → Full feature set
6. Polish → Production-ready PWA

### Task Count Summary

| Phase | Story | Tasks |
|-------|-------|-------|
| Phase 1 | Setup | 12 |
| Phase 2 | Foundational | 22 |
| Phase 3 | US1 Auth | 8 |
| Phase 4 | US2 Create Pool | 12 |
| Phase 5 | US3 Join Pool | 6 |
| Phase 6 | US4 Predictions | 11 |
| Phase 7 | US6 Ranking | 9 |
| Phase 8 | US5 Knockout | 3 |
| Phase 9 | US7 Admin | 5 |
| Phase 10 | US8 Settings | 1 |
| Phase 11 | Polish | 10 |
| **Total** | | **99** |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
