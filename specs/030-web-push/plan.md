# Implementation Plan: Web Push Notifications (PWA)

**Branch**: `030-web-push` | **Date**: 2026-06-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/030-web-push/spec.md`

## Summary

Add Web Push as a first-class, **primary** notification channel for the m5nita PWA. Per
user per event, delivery is chosen in order **Web Push → Telegram → email** (exactly one
channel, push delivered to all the user's devices). v1 carries three triggers: the
existing pre-kickoff/palpite reminder and winner alert (which gain push delivery), plus a
net-new **"pontos conquistados ao final de cada jogo"** push — one per pool a user
predicted, with points earned and resulting rank, **push-only**, fired right after the
existing `calcPointsForMatch` chokepoint when a match finishes. Opt-in is a soft in-app
explainer shown once on app open (gated by a `localStorage` flag) plus a `/settings`
toggle; iOS degrades gracefully with an "Add to Home Screen" hint.

Technical approach (from research): keep the `generateSW` PWA and attach a hand-written
`public/push-sw.js` via `workbox.importScripts`; add the `web-push` library in the API
infrastructure layer behind a `WebPushNotificationService`; two additive tables
(`push_subscription`, `match_points_notified`); a domain repo port + Drizzle adapter; thin
application use cases for subscribe/unsubscribe and match-points notify; route push as the
first branch inside the existing `CompositeNotificationService`. See
[research.md](./research.md), [data-model.md](./data-model.md),
[contracts/web-push-api.md](./contracts/web-push-api.md), [quickstart.md](./quickstart.md).

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node.js ≥ 22 (monorepo, pnpm)
**Primary Dependencies**: API — Hono, Drizzle ORM, Better Auth, grammY, Resend; **NEW**
`web-push` (api, infrastructure-only). Web — React 19, TanStack Router/Query, Tailwind v4,
`vite-plugin-pwa@^1.3.0` (existing; `generateSW` + new `workbox.importScripts`). Shared —
Zod.
**Storage**: PostgreSQL 16 via Drizzle. Two new additive tables (`push_subscription`,
`match_points_notified`); migration `0015`. No existing tables altered.
**Testing**: Vitest (unit across workspaces; integration against real Postgres on
`:5433`). No Playwright wired (web `*.spec.ts` are not runnable).
**Target Platform**: Browsers supporting the Push API (Chromium, Firefox, and iOS 16.4+
**installed** PWA); Node server API.
**Project Type**: Web application (monorepo: `apps/api` backend + `apps/web` frontend +
`packages/shared`).
**Performance Goals**: API p95 < 200ms (Principle IV). **Pontos delivery threshold (the
defined benchmark for this performance-sensitive path)**: on a finished match the
notification path MUST issue **at most 2 queries per affected pool** (one
`findByPoolMatch` + one `getPoolRanking`) and **zero per-user ranking queries** — i.e.
cost is O(pools), never O(members). A unit test asserts this query bound (T036). Push
sends are network I/O, issued per-device without blocking the sync loop.
**Constraints**: HTTPS required in prod (localhost exempt); iOS Push only for installed
PWA; `userVisibleOnly: true` mandatory; prune dead subscriptions on `404/410`; VAPID
private key server-only; **emoji-free** pt-BR copy; never double-notify (one channel per
user per event); tiny prod box (3 vCPU / 4 GB) → World-Cup match-finish bursts must stay
linear in pools.
**Scale/Scope**: Modest user base; bursts concentrated at match endings. ~2 API tables,
2 routes, 3 use cases, 1 new adapter + 1 repo, composite routing change, ~5 web files.

## Constitution Check

*GATE: evaluated before Phase 0 and re-checked after Phase 1 design. PASS.*

| Principle | Assessment | Status |
|-----------|-----------|--------|
| **I. Code Quality** | New code is feature-scoped; no dead code. The push-first branch recurs in reminders + winners + match-points (Rule of Three) → extracted into a single private channel-resolution helper on the composite (T016) so each routing method stays ≤10 lines and the class stays within the 50-line limit (the composite is already ~60 lines pre-feature; the helper keeps it from growing further). Explicit types on all ports. `PushSubscription` is a plain type (no domain behavior) — pragmatic-scope clause; a delivery record, not an aggregate. | PASS |
| **II. Testing Standards** | TDD. Unit: composite push-first routing (push→TG→email, all-devices, no double-notify), `WebPushNotificationService` (payload, 404/410 prune), `NotifyMatchPointsUseCase` (per-pool fan-out, dedupe, push-only) **with a query-bound benchmark assertion (T036, the mandated benchmark for the perf-sensitive pontos path)**, reminder push-only eligibility (T027), subscribe/unsubscribe use cases, `lib/push.ts` pure helpers (T020). Integration: `POST/DELETE /api/push/subscribe` (auth, upsert idempotency, delete), repo adapters against real PG, `match_points_notified` at-most-once. Domain additions are trivial types (no new branching logic to hit 100%). | PASS |
| **III. UX Consistency** | Reuses existing `Modal`/`Button` primitives and `/settings` section pattern; pt-BR + emoji-free copy; explicit loading/disabled states; graceful degrade + iOS hint (no dead controls); deep-links land on existing screens. **WCAG 2.1 AA**: the opt-in prompt and settings toggle carry explicit a11y acceptance criteria (focus management, keyboard operability, `aria` labels on the toggle) in T030/T047, spot-checked in T055. | PASS |
| **IV. Performance** | Pontos path is O(pools), not O(members): targeted `findActivePoolsForMatch`, exactly one `getPoolRanking` per pool → in-memory `userId→position` map, enforced by the T036 query-bound test (≤2 queries/pool, 0 per-user). Indexes: `push_subscription(user_id)`, unique `(endpoint)`, unique `(user_id,pool_id,match_id)`. Web bundle unaffected (`web-push` is server-only; only the public VAPID string ships). Reminder eligibility uses a single `EXISTS` subquery. Send-outcome + dead-sub-prune counters (T014) make SC-004/SC-007 measurable. | PASS |
| **V. Hexagonal & SOLID** | domain (type + repo port) → application (use cases + `NotificationService` port extension) → infrastructure (Drizzle repos, `WebPushNotificationService`, routes, `lib/webpush`), manual DI in `container.ts`. Dependencies point inward; `web-push` imported only in infrastructure. ISP: `notifyMatchPoints` added to the cohesive notification port; subscription CRUD is a separate repository port. DIP: composite depends on the repo port abstraction. | PASS |

**New dependency justification (Technical Decision Guidelines)**: `web-push` — actively
maintained, the de-facto Node implementation of VAPID signing + RFC 8291 payload
encryption; hand-rolling is a security/correctness risk. Infrastructure-only (Principle V),
zero web-bundle impact (Principle IV). Compliant — **not** a constitution violation, so no
Complexity Tracking entry required.

No gate violations. No entries in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/030-web-push/
├── handoff.md           # Original kickoff brief (pre-existing)
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 decisions (D1–D12)
├── data-model.md        # Phase 1 tables + in-code types
├── quickstart.md        # Phase 1 setup + manual E2E verification
├── contracts/
│   └── web-push-api.md  # HTTP routes + SW payload + port contract
└── checklists/
    └── requirements.md  # Spec quality checklist (from /speckit.specify)
```

### Source Code (repository root)

```text
apps/api/src/
├── db/schema/
│   ├── pushSubscription.ts          # NEW table
│   ├── matchPointsNotified.ts       # NEW table
│   └── index.ts                     # export the two new tables
├── domain/push/
│   ├── PushSubscription.ts          # NEW plain type
│   └── PushSubscriptionRepository.port.ts   # NEW repo port
├── application/
│   ├── ports/NotificationService.port.ts    # +userId, +MatchPointsData, +notifyMatchPoints
│   ├── push/
│   │   ├── SubscribeToPushUseCase.ts        # NEW
│   │   └── UnsubscribeFromPushUseCase.ts    # NEW
│   └── match/NotifyMatchPointsUseCase.ts    # NEW
├── infrastructure/
│   ├── persistence/
│   │   ├── DrizzlePushSubscriptionRepository.ts   # NEW
│   │   └── DrizzleMatchPointsNotifiedStore.ts     # NEW (infra-internal dedupe)
│   ├── external/
│   │   ├── WebPushNotificationService.ts          # NEW (wraps web-push, prunes 404/410)
│   │   └── CompositeNotificationService.ts        # push-first routing + notifyMatchPoints
│   └── http/routes/push.ts                        # NEW POST/DELETE /api/push/subscribe
├── lib/webpush.ts                   # NEW (setVapidDetails from env; optional/degrade)
├── jobs/
│   ├── reminderJob.ts               # +userId in ReminderData; +push EXISTS eligibility
│   └── closePoolsJob.ts             # +userId in WinnerInfo
├── app.ts                           # register pushRoutes
├── index.ts                         # onMatchFinished: calcPoints + NotifyMatchPointsUseCase
└── container.ts                     # wire push repo, web-push service, new use cases

apps/web/
├── public/push-sw.js                # NEW push + notificationclick handlers
├── vite.config.ts                   # workbox.importScripts: ['/push-sw.js']
├── .env.example                     # VITE_VAPID_PUBLIC_KEY
└── src/
    ├── lib/push.ts                  # NEW: feature-detect, subscribe/unsubscribe, iOS detect
    ├── components/push/PushOptInPrompt.tsx   # NEW soft explainer (Modal), shown once
    ├── routes/settings.tsx          # add push toggle section
    └── (root/main mount of PushOptInPrompt)

packages/shared/src/schemas/        # subscribePushSchema (+ inferred DTO)

apps/api/.env.example               # VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT
apps/api/drizzle/0015_*.sql + meta/_journal.json   # migration (verify `when` > 0014)
```

**Structure Decision**: Existing monorepo hexagonal layout (`apps/api` domain/application/
infrastructure, `apps/web` React PWA, `packages/shared`). The feature adds a thin `push`
slice in each API layer, one infra adapter for sending, a routing change in the existing
composite seam, and a small web client surface — no structural change.

## Complexity Tracking

No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
