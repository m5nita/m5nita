# Implementation Plan: Critical Fixes + Telegram Prediction Reminders

**Branch**: `004-critical-fixes-telegram-reminders` | **Date**: 2026-03-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-critical-fixes-telegram-reminders/spec.md`

## Summary

This feature addresses two workstreams: (1) critical security and UX fixes — mounting the existing OTP rate limit middleware, adding router-level auth guards, cleaning dead code, and documenting missing env vars; (2) a new Telegram prediction reminder job that notifies pool members without predictions ~1 hour before match kickoff.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js >= 20)
**Primary Dependencies**: Hono (API), Better Auth + phone-number plugin, Drizzle ORM, grammY (Telegram), React 19, TanStack Router, TanStack Query
**Storage**: PostgreSQL 16
**Testing**: Vitest
**Target Platform**: Web (PWA) + Node.js server
**Project Type**: Web service (monorepo: apps/api + apps/web + packages/shared)
**Performance Goals**: API responses < 200ms p95, page load < 1.5s FCP
**Constraints**: Single-process deployment, in-memory dedup acceptable
**Scale/Scope**: ~64 matches (Copa 2026), hundreds of users, ~10 pools

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | PASS | Removing dead code aligns directly. New code follows single-responsibility (one job file, one middleware mount). |
| II. Testing Standards | PASS | Acceptance scenarios defined for all user stories. Will need unit tests for reminder job and integration test for OTP rate limit. |
| III. UX Consistency | PASS | Auth guard eliminates content flash. Reminder message in pt-BR matching app language. Rate limit returns user-friendly error. |
| IV. Performance | PASS | Reminder job runs every 15min with efficient SQL (LEFT JOIN + IS NULL). No bundle size impact (backend-only changes + minimal frontend route config). |

No violations. No complexity justification needed.

## Project Structure

### Documentation (this feature)

```text
specs/004-critical-fixes-telegram-reminders/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/api/
├── src/
│   ├── index.ts                    # MODIFY: mount OTP rate limit, add reminder cron
│   ├── types/hono.ts               # MODIFY: add parsedBody to AppEnv
│   ├── middleware/
│   │   ├── auth.ts                 # MODIFY: remove requirePoolOwner
│   │   └── rateLimit.ts            # EXISTS: otpRateLimit already defined
│   ├── routes/
│   │   └── auth.ts                 # DELETE: dead code
│   ├── jobs/
│   │   ├── reminderJob.ts          # CREATE: prediction reminder job
│   │   ├── syncFixtures.ts         # DELETE: dead code
│   │   └── syncLive.ts             # DELETE: dead code
│   └── lib/
│       └── telegram.ts             # EXISTS: reuse findChatIdByPhone, bot
├── .env.example                    # MODIFY: add ALLOWED_ORIGIN

apps/web/
├── src/
│   ├── routes/
│   │   ├── pools/
│   │   │   └── route.tsx           # CREATE: layout route with auth guard
│   │   ├── settings.tsx            # MODIFY: add beforeLoad
│   │   └── invite/
│   │       └── $inviteCode.tsx     # MODIFY: move auth to beforeLoad
│   ├── lib/
│   │   └── authGuard.ts            # EXISTS: reuse requireAuthGuard
│   └── components/ui/
│       └── Card.tsx                # DELETE: dead code
```

**Structure Decision**: Existing monorepo structure preserved. No new directories except `contracts/` in specs. Changes are surgical modifications to existing files plus one new job file and one new route layout file.

## Phase 0: Research

### R-001: Hono middleware ordering for body parsing before auth handler

**Decision**: Use `c.req.raw.clone().json()` to parse body without consuming the original request stream.
**Rationale**: Hono's `c.req.raw` is a Web API `Request` whose body can only be consumed once. Cloning before parsing preserves the stream for Better Auth's downstream handler. This is the standard approach in Hono middleware that needs to inspect request bodies.
**Alternatives considered**:
- `c.req.json()` — consumes the body stream, breaking Better Auth's handler
- Reconstructing a new Request after parsing — complex and error-prone
- Using `c.req.text()` + `JSON.parse()` — also consumes the stream

### R-002: TanStack Router layout routes for grouped auth guards

**Decision**: Create `routes/pools/route.tsx` as a layout route with `beforeLoad` calling `requireAuthGuard()`.
**Rationale**: TanStack Router file-based routing treats `route.tsx` in a directory as the layout for all child routes. A single `beforeLoad` in the layout guards all pool routes without modifying each child. The `requireAuthGuard()` function already throws `redirect()` which TanStack Router handles natively in `beforeLoad`.
**Alternatives considered**:
- Adding `beforeLoad` to each individual pool route — duplicative, harder to maintain
- Creating a custom route wrapper component — less idiomatic for TanStack Router

### R-003: Efficient SQL query for users without predictions

**Decision**: Use `selectDistinctOn([poolMember.userId])` with LEFT JOIN prediction + IS NULL pattern.
**Rationale**: A user in multiple pools should get ONE reminder per match. `selectDistinctOn` (PostgreSQL-specific) deduplicates at the DB level, avoiding application-side dedup. The LEFT JOIN + IS NULL pattern is the standard way to find "missing" records in SQL.
**Alternatives considered**:
- NOT EXISTS subquery — equivalent performance but less readable in Drizzle ORM
- Application-side dedup with Set — adds complexity, moves work from DB to app

### R-004: In-memory vs persistent dedup for reminders

**Decision**: In-memory `Set<string>` keyed by `${userId}:${matchId}`.
**Rationale**: Copa 2026 has 64 matches. Even with 1000 users, max 64K entries (~2MB). Single-process deployment means no cross-instance coordination needed. Worst case on restart: one duplicate reminder per user per match — low impact. No migration needed.
**Alternatives considered**:
- DB table `reminder_sent` — requires migration, adds write load for minimal benefit
- Redis set — Redis is in docker-compose but not integrated; overkill for this use case

### R-005: Reusing existing `findChatIdByPhone` helper

**Decision**: Reuse `findChatIdByPhone` from `apps/api/src/lib/telegram.ts:229` in the reminder job.
**Rationale**: The function already performs the exact lookup needed (phoneNumber -> chatId via telegram_chat table). Avoids code duplication (Constitution Principle I).
**Alternatives considered**:
- Joining telegram_chat in the main query — more efficient (one query vs N+1) but couples the reminder query to the telegram schema. For the expected scale (~hundreds of users), the N+1 is acceptable.

## Phase 1: Design

### Data Model

No new database tables or migrations required. The feature uses existing tables:
- `match` (status, matchDate, homeTeam, awayTeam)
- `pool_member` (poolId, userId)
- `prediction` (userId, poolId, matchId)
- `user` (phoneNumber)
- `telegram_chat` (phoneNumber, chatId)

New in-memory structure only:
- `sentReminders: Set<string>` — keys are `"${userId}:${matchId}"`, grows monotonically, max ~64K entries

### API Contracts

No new API endpoints. Changes are internal (middleware mount, cron job, frontend route config).

The only externally visible change is:
- `POST /api/auth/phone-number/send-otp` — now returns `429 Too Many Requests` with `{ error: 'TOO_MANY_REQUESTS', message: 'Tente novamente em alguns minutos' }` after 3 requests per phone per 5 minutes.

### Implementation Details

#### 1. Mount OTP Rate Limit (FR-001, FR-002)

**File**: `apps/api/src/index.ts`

Insert before line 31 (`app.all('/api/auth/*', ...)`):
```typescript
import { otpRateLimit } from './middleware/rateLimit'

app.post('/api/auth/phone-number/send-otp', async (c, next) => {
  try {
    const body = await c.req.raw.clone().json()
    c.set('parsedBody', body)
  } catch { /* IP fallback */ }
  await next()
})
app.post('/api/auth/phone-number/send-otp', otpRateLimit)
```

**File**: `apps/api/src/types/hono.ts`

Add `parsedBody` to AppEnv Variables:
```typescript
export type AppEnv = {
  Variables: {
    user: Session['user']
    session: Session['session']
    parsedBody?: { phoneNumber?: string }
  }
}
```

#### 2. Prediction Reminder Job (FR-003 through FR-006, FR-012)

**File**: `apps/api/src/jobs/reminderJob.ts` (NEW)

Core logic:
1. Query matches WHERE status='scheduled' AND matchDate BETWEEN now AND now+60min
2. For each match, query pool_member LEFT JOIN prediction WHERE prediction.id IS NULL, selectDistinctOn userId
3. For each user, call `findChatIdByPhone(phoneNumber)` — skip if null
4. Check `sentReminders.has(key)` — skip if already sent
5. Send via `bot.api.sendMessage(chatId, message, { parse_mode: 'Markdown' })`
6. Add key to `sentReminders`

Message format (pt-BR):
```
Jogo em X min!

*Brasil x Argentina*

Voce ainda nao fez seu palpite. Acesse o app agora!
```

**File**: `apps/api/src/index.ts`

Add to serve() callback:
```typescript
setInterval(() => {
  sendPredictionReminders().catch((err) => console.error('[Cron] Reminder job failed:', err))
}, 15 * 60 * 1000)
```

#### 3. Auth Guard at Router Level (FR-007 through FR-009)

**File**: `apps/web/src/routes/pools/route.tsx` (NEW)
```typescript
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { requireAuthGuard } from '../../lib/authGuard'

export const Route = createFileRoute('/pools')({
  beforeLoad: () => requireAuthGuard(),
  component: Outlet,
})
```

**File**: `apps/web/src/routes/settings.tsx` — add `beforeLoad: () => requireAuthGuard()`

**File**: `apps/web/src/routes/invite/$inviteCode.tsx` — replace imperative auth check (lines 16, 39-43) with `beforeLoad` that calls `savePendingRedirect(location.pathname)` before redirect. Remove `useSession` import and usage. Remove `enabled: !!session` from useQuery.

#### 4. Dead Code Cleanup (FR-010)

**Delete**:
- `apps/api/src/routes/auth.ts` — never imported
- `apps/api/src/jobs/syncFixtures.ts` — wrapper never called
- `apps/api/src/jobs/syncLive.ts` — wrapper never called
- `apps/web/src/components/ui/Card.tsx` — never imported

**Edit**:
- `apps/api/src/middleware/auth.ts` — remove `requirePoolOwner` function (no-op, never imported)

#### 5. Env Config (FR-011)

**File**: `apps/api/.env.example` — add `ALLOWED_ORIGIN=http://localhost:5173`

## Constitution Re-Check (Post-Design)

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | PASS | Dead code removed. New code is single-responsibility. No duplication (reuses findChatIdByPhone). |
| II. Testing Standards | PASS | Need: unit test for reminderJob, integration test for OTP rate limit, smoke test for auth guard redirect. |
| III. UX Consistency | PASS | Error messages in pt-BR. No content flash on protected routes. Reminder message clear and actionable. |
| IV. Performance | PASS | No bundle size impact. Reminder query uses efficient LEFT JOIN. 15min interval = low DB load. |

## Verification

1. **Lint & Types**: `pnpm biome check --write . && pnpm typecheck`
2. **Tests**: `pnpm test` — all existing tests must pass
3. **OTP Rate Limit**: Send 4 OTP requests for same phone in 5 min — 4th returns 429
4. **Auth Guard**: Navigate to `/pools/create` while logged out — immediate redirect to `/login`
5. **Invite Redirect**: Open `/invite/SOMECODE` while logged out — redirect to `/login`, then after login return to invite page
6. **Dead Code**: Verify build succeeds after deletions
7. **Reminder Job**: Create a match scheduled for +30min, have a pool member without prediction, call `sendPredictionReminders()` manually, verify Telegram message received
