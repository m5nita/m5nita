# Phase 0 Research: Web Push Notifications (PWA)

All decisions below are grounded in a codebase sweep (notification subsystem, PWA/SW
config, match-finish/scoring path, persistence/migration conventions). No
`NEEDS CLARIFICATION` remain.

---

## D1 — Service worker strategy (how push handlers attach)

**Decision**: Keep the existing **`generateSW`** strategy and add
`workbox.importScripts: ['/push-sw.js']` in `apps/web/vite.config.ts`, pointing at a
hand-written `apps/web/public/push-sw.js` that registers the `push` and
`notificationclick` listeners (Option A).

**Rationale**: `vite-plugin-pwa@^1.3.0` is configured with `registerType: 'autoUpdate'`
and the default Workbox-generated SW (no `src/sw.ts`). `importScripts` is supported and
augments the generated SW without rewiring the build, the `registerSW` flow in
`main.tsx`, or the existing `runtimeCaching`/`autoUpdate` behavior. `push-sw.js` is a
static `public/` asset loaded into the SW global scope at install.

**Alternatives considered**: Option B — switch to `strategies: 'injectManifest'` with a
custom `src/sw.ts`. Rejected for v1: it forces adding `workbox-precaching` et al. as dev
deps, re-implementing the precache manifest wiring, and carries regression risk on a
working SW for no v1 benefit. Revisit only if we later need richer SW logic.

---

## D2 — Server push delivery library

**Decision**: Add **`web-push`** to `apps/api` only, used exclusively from the
infrastructure layer (a new `WebPushNotificationService` adapter + a `lib/webpush.ts`
configuration shim).

**Rationale**: Web Push requires VAPID JWT signing (RFC 8292) and per-message ECDH +
HKDF + AES-GCM payload encryption (RFC 8291). Hand-rolling this is error-prone; `web-push`
is the de-facto maintained Node implementation. Constitution Principle V permits
third-party libraries **only** in the infrastructure layer — satisfied here. It ships
**zero** bytes to the web bundle (only the VAPID *public* key string reaches the client),
so Principle IV bundle budget is unaffected.

**Alternatives considered**: hand-rolled encryption (rejected — security/correctness
risk); a different library (none is as widely used/maintained).

---

## D3 — VAPID key management & graceful degradation

**Decision**: One app-wide VAPID keypair, generated once
(`npx web-push generate-vapid-keys`). API env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`VAPID_SUBJECT` (mailto). Web build env: `VITE_VAPID_PUBLIC_KEY` (public key only). VAPID
keys are **NOT** added to the boot-time `requiredEnvVars` list; when absent, push delivery
is disabled with a single warning (mirrors the payment-gateway mock pattern in
`container.ts`), so local dev and tests boot without them.

**Rationale**: Keeps the private key server-only (Principle/security), lets dev run
without push configured, and follows the existing "missing optional integration → warn,
degrade" convention rather than the hard-fail `requiredEnvVars` convention used for truly
mandatory secrets.

**Alternatives considered**: adding VAPID to `requiredEnvVars` (rejected — would break the
documented local-dev boot, which already requires RESEND/TELEGRAM keys; push is optional).

---

## D4 — "Pontos conquistados" trigger: hook point

**Decision**: Fire the pontos notification **immediately after** `calcPointsForMatch` in
the existing `onMatchFinished` wiring (`apps/api/src/index.ts`), by calling a new
`NotifyMatchPointsUseCase.execute(matchId)`. The `onMatchFinished` callback becomes
"score the match, recompute rankings, then notify points".

**Rationale**: `SyncLiveScoresUseCase.applyLiveMatch` already detects the single
`scheduled/live → finished` transition (`wasNotFinished && newStatus === 'finished'`) and
returns the `matchId` to the `onMatchFinished` callback (`calcPointsForMatch`), which
persists per-prediction `points` and calls `rankingRepo.recomputeStandings(poolId)` per
affected pool. Running the notify step **after** this means the use case reads
already-fresh `prediction.points` and ranking positions — no recomputation, clean SRP
separation between scoring and notifying. The stale-live→finished (12h) promotion flows
through the same transition, so pontos also fires for auto-finished matches.

**Alternatives considered**:
- Embedding the notify logic inside `calcPointsForMatch` (rejected — couples scoring and
  notification, grows the function past the size budget).
- A separate cron scanning for finished-but-unnotified matches (rejected — the
  transition chokepoint already exists; a poller adds load to the tiny prod box).

---

## D5 — "Pontos conquistados": per-pool data sourcing (avoid N+1)

**Decision**: In `NotifyMatchPointsUseCase`, for the finished match:
1. Find pools containing the match via a targeted repo method
   `poolRepo.findActivePoolsForMatch(match)` (new) — instead of scanning
   `findAllActive()` and filtering in memory per finished match.
2. Per pool: one `predictionRepo.findByPoolMatch(poolId, matchId)` (returns `userId`,
   `name`, `points`) **and** one `rankingRepo.getPoolRanking(poolId, '')` call, building a
   `Map<userId, position>` **once per pool** (never per user).
3. Build one `MatchPointsData` per (user, pool) and hand the batch to
   `notificationService.notifyMatchPoints(items)`.

**Rationale**: Principle IV (no N+1, tiny 3vCPU/4GB prod box, possible World-Cup bursts
when a popular match finishes). A finished match touches a bounded set of pools; two
queries per pool plus an in-memory position map keeps it linear in pools, not in members.

**Alternatives considered**: calling `getPoolRanking(poolId, userId)` per user (rejected —
N+1 over members); scanning all active pools per finished match (rejected — repeated full
scans during a matchday).

---

## D6 — At-most-once delivery for pontos (FR-017)

**Decision**: New additive table **`match_points_notified`** (`user_id`, `pool_id`,
`match_id`, unique composite index), mirroring `stats_unlock`. The push delivery records
each (user, pool, match) with `onConflictDoNothing().returning()` and only sends when the
row was **newly** inserted. The dedupe check + record live inside the **infrastructure**
push delivery (so the application use case stays a pure data-gatherer); the marker is
written immediately before the send attempt.

**Rationale**: The existing reminder dedupe is an in-memory `Set` that resets on restart —
insufficient for FR-017's "durable across restarts and re-syncs". `stats_unlock` is the
proven idempotent-marker pattern in this repo (`onConflictDoNothing` on a composite unique
key, `.returning().length > 0` ⇒ "newly recorded"). Per-match granularity matches the
trigger.

**Idempotency note**: `onMatchFinished` naturally fires once per transition, so this table
is a safety net against re-fires (restart mid-sync, stale-promotion re-eval), not the
primary gate.

**Alternatives considered**: a boolean column on `prediction` (rejected — pontos is
per-pool-per-match and predictions are already per-pool-per-match, but a dedicated marker
keeps notification concerns out of the prediction aggregate and avoids write contention on
the hot predictions table); reusing `payment` (rejected — pollutes payment semantics).

---

## D7 — Channel policy: "Push primary for all" (FR-011–FR-013)

**Decision**: Per user per event, deliver to the **first available** channel in order
**Web Push → Telegram → email**, where Web Push means "send to **all** of that user's
active subscriptions". To enable this:
- Add `userId: string` to `ReminderData` and `WinnerInfo` (both call sites —
  `reminderJob.buildRemindersToSend` and `closePoolsJob.notifyWinnersForPool` — already
  have `userId` in scope).
- Inject `PushSubscriptionRepository` + `WebPushNotificationService` into
  `CompositeNotificationService`; in each per-recipient loop, check
  `findByUserId(userId)` first; if non-empty, send push to all devices and **stop** (no
  Telegram/email); else fall through to the existing Telegram → email chain.

**Rationale**: Matches the product decision (push promoted above Telegram). The composite
is already the single routing seam; today it does Telegram-else-email per recipient, so
inserting a push-first branch is localized. `userId` is the only missing datum.

**Alternatives considered**: parallel send (rejected by product — risks double-notify);
push as last resort after email (rejected — email is almost always present, so push would
never fire).

---

## D8 — Reminder eligibility must include push-only users (FR-014)

**Decision**: Extend the eligibility filter in `reminderJob.collectRemindersForPool` with
a third OR branch: the user has at least one push subscription
(`exists(select 1 from push_subscription where user_id = pool_member.user_id)`).

**Rationale**: Today a member is reminder-eligible only with a phone number OR a verified
email. A user who signed in with Google, never verified email, and only enabled push would
be silently excluded. Adding the EXISTS branch makes push-only users eligible; the
composite then routes them to push.

**Alternatives considered**: none — this is a correctness gap, not a choice.

---

## D9 — Opt-in prompt: "shown once on app open" (FR-002/FR-003)

**Decision**: A soft in-app explainer (reusing the existing `Modal` primitive) shown
automatically on app open when: the user is **signed in**, the platform **supports** Web
Push, the browser permission is still `default` (never asked), and a local flag
`m5nita.push.promptSeen` is absent in `localStorage`. Choosing "enable" runs
`Notification.requestPermission()` then subscribes; any outcome (enable/dismiss) sets the
flag so it never auto-appears again. `/settings` always offers a manual toggle.

**Rationale**: The brainstorming decision moved the prompt off "first saved palpite"
(existing users already have predictions) to "first app open, once". `localStorage` is the
established client-persistence convention here (`m5nita.theme`; the banner uses
`m5nita.banner.dismissed` in sessionStorage). Persistent `localStorage` is correct because
"have we ever shown this" must survive across sessions.

**Alternatives considered**: server-side "seen" flag (rejected — adds a column/endpoint
for a purely client UX concern; `localStorage` is sufficient and matches conventions).

---

## D10 — iOS handling (FR-022/FR-023)

**Decision**: Feature-detect (`'serviceWorker' in navigator && 'PushManager' in window`).
Where unsupported, hide/disable the enable control. On iOS specifically, when the user is
in a Safari tab (not `display-mode: standalone`), show an "Adicionar à Tela de Início"
guidance instead of attempting to subscribe.

**Rationale**: iOS exposes `PushManager` only for a home-screen-installed PWA (16.4+);
attempting `requestPermission`/`subscribe` in a tab fails. Detect via
`window.matchMedia('(display-mode: standalone)')` / `navigator.standalone`.

**Alternatives considered**: aggressive install prompting (rejected by product — too
pushy for v1); silent-only with no hint (rejected — leaves iOS users with a dead toggle).

---

## D11 — Hexagonal placement (Principle V)

**Decision**:
- **Domain** (`domain/push/`): `PushSubscription` as a plain readonly type (a delivery
  record with no business behavior — pragmatic-scope exemption from the value-object
  mandate), and `PushSubscriptionRepository.port.ts` (repository ports live in `domain/`).
- **Application** (`application/`): `SubscribeToPushUseCase`, `UnsubscribeFromPushUseCase`,
  `NotifyMatchPointsUseCase` (each a single `execute()`); extend
  `application/ports/NotificationService.port.ts` with `notifyMatchPoints(...)`,
  `MatchPointsData`, and `userId` on the existing payloads.
- **Infrastructure** (`infrastructure/`): `DrizzlePushSubscriptionRepository`,
  `WebPushNotificationService` (wraps `web-push`, prunes dead subs on 404/410), an internal
  `match_points_notified` dedupe store, updated `CompositeNotificationService`, new
  `http/routes/push.ts`, `lib/webpush.ts`. Wire everything in `container.ts`.
- **Shared** (`packages/shared`): `subscribePushSchema` Zod schema (+ inferred DTO).

**Rationale**: Follows the established convention (repo ports in `domain/<aggregate>/`,
external-service port additions in `application/ports/`, adapters in `infrastructure/`,
manual DI in `container.ts`). Push subscriptions and the dedupe marker carry no business
rules, so per the constitution's pragmatic-scope clause they stay light (plain types,
thin repos) rather than full aggregates with value objects.

**Alternatives considered**: routes writing the DB directly (rejected — violates the
arch guardrail that routes/services must not import `db/schema`; an existing offender in
`users.ts` is baselined and must not be extended).

---

## D12 — Migration mechanics (one migration: 0015)

**Decision**: A single migration `0015` adds both `push_subscription` and
`match_points_notified` (one `pnpm --filter @m5nita/api db:generate` run captures both new
tables). After generating, **verify the new `_journal.json` entry's `when` timestamp is
greater than `0014`'s (`1781656602574`)**; a fresh `Date.now()` in mid-2026 is naturally
larger, but the documented gotcha (boot-time migrate applies in journal order and silently
skips an out-of-order entry in prod) makes the check mandatory.

**Rationale**: Matches the repo's migration workflow and the known `_journal.json`
ordering hazard (CLAUDE.md + project memory).

**Alternatives considered**: two separate migrations (unnecessary — both are additive and
land together).

---

## Summary of decisions

| ID | Topic | Decision |
|----|-------|----------|
| D1 | SW strategy | `generateSW` + `importScripts: ['/push-sw.js']` (Option A) |
| D2 | Push library | `web-push` in `apps/api`, infrastructure-only |
| D3 | VAPID keys | env-based, optional (degrade gracefully, not in `requiredEnvVars`) |
| D4 | Pontos hook | after `calcPointsForMatch` in `onMatchFinished` → `NotifyMatchPointsUseCase` |
| D5 | Pontos data | targeted pools-for-match query; one ranking query/pool → position map |
| D6 | At-most-once | new `match_points_notified` table, `onConflictDoNothing().returning()` |
| D7 | Channel policy | Push (all devices) → Telegram → email; add `userId` to payloads |
| D8 | Reminder eligibility | add "has push subscription" EXISTS branch |
| D9 | Opt-in prompt | once on app open, gated by `localStorage` flag + `/settings` toggle |
| D10 | iOS | feature-detect, degrade, "Add to Home Screen" hint |
| D11 | Layering | domain type+port / application use cases / infra adapters / shared schema |
| D12 | Migration | single `0015`, verify journal `when` > `1781656602574` |
