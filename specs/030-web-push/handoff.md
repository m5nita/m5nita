# Handoff — Web Push (PWA) for m5nita

> **How to use this:** open a fresh session at the repo root and paste/point it at this
> file. It is a self-contained kickoff brief. Start with `superpowers:brainstorming`
> (settle the open decisions below), then `writing-plans`, then implement
> subagent-driven — same flow used for spec 029. Do **not** start coding before the
> spec is approved.

## Goal

Add **Web Push notifications** to the m5nita PWA so re-engagement no longer depends on
the Telegram bot. Today every notification (kickoff reminders, winner alerts) only
reaches users who connected Telegram — a minority. A torcedor who installed the PWA and
logged in with Google/email gets **nothing**. Web Push is the foundational retention
lever from the product audit: it unlocks "your match starts in 10 min, 3 palpites
faltando", "you dropped to 4th", and (later) round recaps for **everyone**.

This is the first of three retention bets (Web Push → recap de rodada → liga
recorrente). Web Push is the base the other two ride on.

## Project context (so you don't re-discover it)

- **Monorepo (pnpm):** `apps/api` (Hono + Drizzle + Better Auth + grammY), `apps/web`
  (React 19 + TanStack Router/Query + Tailwind v4 + **vite-plugin-pwa**),
  `packages/shared`. API is **hexagonal** (domain / application / infrastructure) with
  CI guardrails (`pnpm check:leaks`, `pnpm check:arch`). Tests: Vitest. Lint/format:
  **Biome** (no semicolons, single quotes — your editor may reformat to Prettier-style;
  run `pnpm biome check --write <file>` before staging).
- **Existing notification system (REUSE THIS):**
  - Port: `apps/api/src/application/ports/NotificationService.port.ts` — interface
    `NotificationService { notifyWinners, notifyAdminWithdrawalRequest,
    sendPredictionReminders }`. Payloads (e.g. `ReminderData`) are **channel-agnostic**
    and carry the recipient's `phoneNumber` + `email` so the adapter picks a channel.
  - Adapter: `apps/api/src/infrastructure/external/CompositeNotificationService.ts` —
    `implements NotificationService`, today routes to Telegram (resolve `chatId` from
    phone via `findChatIdByPhone`) with an **email fallback**. This is the seam where a
    **third channel (Web Push)** plugs in.
  - Telegram impl: `apps/api/src/infrastructure/external/TelegramNotificationService.ts`.
  - Cron: `apps/api/src/jobs/reminderJob.ts` → `sendPredictionReminders()`, scheduled in
    `apps/api/src/index.ts` (`scheduleCron`, `prediction-reminders` every 15 min).
- **PWA / service worker (CRITICAL — read carefully):**
  - `apps/web/vite.config.ts` uses `VitePWA({ registerType: 'autoUpdate', workbox: {...} })`
    — i.e. the default **`generateSW`** strategy (Workbox generates the SW; there is **no
    custom `src/sw.ts`**). `globPatterns: []`, with `runtimeCaching` for `/api/`.
  - SW is registered in `apps/web/src/main.tsx` via `registerSW` from
    `virtual:pwa-register`.
  - **You cannot add `push`/`notificationclick` handlers to a `generateSW` SW directly.**
    Two options (pick one in brainstorming): **(A)** keep `generateSW` and add
    `workbox.importScripts: ['/push-sw.js']` pointing at a hand-written push handler in
    `apps/web/public/push-sw.js` (lowest-risk, no restructuring), or **(B)** switch to
    `strategies: 'injectManifest'` with a custom `apps/web/src/sw.ts` (more control,
    needs `workbox-precaching` etc. as dev deps and rewires the build).
- **Auth/user:** Better Auth. `user` table (`apps/api/src/db/schema/auth.ts`) has a
  `text` primary key `id`. A push subscription belongs to a `user` (one user can have
  many devices → many subscriptions).
- **No web-push infra exists** (confirmed: zero VAPID / pushManager / web-push in the
  repo). This is net-new.

## How Web Push works (the standard, as in push.foo)

push.foo (webmaxru) is a Next.js + Workbox-SW PoC that implements the textbook flow;
m5nita's flow is the same, just wired into the existing notification port:

1. **VAPID keys** (one keypair for the whole app): generate once with
   `npx web-push generate-vapid-keys`. Public key → web env; public+private+subject →
   api env. (push.foo keeps VAPID config under `.well-known/`.)
2. **Client subscribe** (web): after the SW is ready and the user grants
   `Notification.requestPermission()`, call
   `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey:
   urlBase64ToUint8Array(VAPID_PUBLIC) })`. The returned `PushSubscription` has
   `{ endpoint, keys: { p256dh, auth } }`.
3. **Store subscription** (server): POST it to the API; persist per-user (a new
   `push_subscription` table). De-dupe by `endpoint`.
4. **Send** (server): use the **`web-push`** npm library —
   `webpush.setVapidDetails(subject, public, private)` then
   `webpush.sendNotification(subscription, JSON.stringify(payload))`. The library does
   the VAPID JWT signing + RFC 8291 payload encryption for you. Handle `410 Gone` /
   `404` → delete the dead subscription.
5. **Receive** (service worker): `self.addEventListener('push', (e) => {
   const data = e.data.json(); e.waitUntil(self.registration.showNotification(title,
   { body, icon, data: { url } })) })` and
   `self.addEventListener('notificationclick', (e) => { e.notification.close();
   e.waitUntil(clients.openWindow(e.notification.data.url)) })`.

## m5nita integration map (what to touch)

- **Dependency:** add `web-push` to `apps/api` (server only). This is the one justified
  new runtime dep — hand-rolling VAPID + ECDH/HKDF/AES-GCM payload encryption is
  error-prone. Note it explicitly in the spec (the repo otherwise avoids new deps).
- **DB:** new additive table `push_subscription` (`id`, `user_id` FK → `user.id`,
  `endpoint` unique, `p256dh`, `auth`, `user_agent?`, `created_at`). New Drizzle
  migration — ⚠️ **bump its `when` in `apps/api/drizzle/meta/_journal.json` above the
  previous entry** or boot-time migrate silently skips it in prod (known repo gotcha).
- **API routes (new):** `POST /api/push/subscribe` (auth'd, upsert the subscription for
  the current user), `DELETE /api/push/subscribe` (remove on logout/opt-out). Expose the
  VAPID **public** key to the web build via env (no endpoint needed).
- **Notification adapter:** add a `WebPushNotificationService` (new impl detail using
  `web-push` + the `push_subscription` repo) and route to it from
  `CompositeNotificationService` as the **third channel** — alongside Telegram/email.
  For each recipient, try Telegram (if chat) **and/or** push (if subscriptions) — decide
  in brainstorming whether push is a fallback or sent in parallel (avoid double-notifying
  the same person on Telegram **and** push).
- **Cron content (v1):** wire push into the **existing** `sendPredictionReminders` path
  first (kickoff reminders) — it already resolves recipients. Position-change alerts and
  round recaps are later.
- **Web client:** a subscribe flow + a small UI affordance. Audit recommendation: prompt
  for permission **right after the user saves their first palpite** (not on load).
  Service worker push/notificationclick handlers per the strategy chosen above. A toggle
  in `/settings` to opt in/out.
- **Shared:** any DTOs for the subscribe payload in `packages/shared` if useful.

## Suggested build order (refine in the plan)

1. VAPID env + `web-push` dep + `push_subscription` table/migration/repo.
2. `POST/DELETE /api/push/subscribe` routes (+ tests: auth, upsert, delete-on-410).
3. Service worker push + notificationclick handlers (strategy A or B).
4. Web subscribe flow + permission prompt (after first palpite) + settings toggle.
5. `WebPushNotificationService` + route it into `CompositeNotificationService`.
6. Wire push into the existing reminder cron; verify a real push end-to-end.

## Decisions to make (resolve in brainstorming)

- **SW strategy:** `generateSW` + `importScripts` (A) vs `injectManifest` (B). Lean A for
  lowest risk.
- **Permission UX:** when/where to ask. Recommendation: after first saved palpite, with a
  soft pre-prompt explaining the value, then the native prompt.
- **Channel policy:** push as fallback when Telegram is absent, or always-on in parallel?
  Don't double-notify.
- **v1 triggers:** kickoff reminder only, or also position-change? (Recap = separate spec.)
- **iOS:** Web Push on iOS requires the PWA **installed to the home screen** (iOS 16.4+).
  Decide whether to nudge installation; gate the prompt on `display-mode: standalone` for
  iOS.
- **Copy:** push titles/bodies must be **emoji-free** (product owner removed all emojis
  from the UI — keep notifications consistent).

## Gotchas

- iOS: Web Push only works for an **installed** PWA (16.4+); `pushManager` is undefined in
  Safari tabs. Feature-detect and degrade.
- HTTPS required (localhost is exempt for dev).
- `userVisibleOnly: true` is mandatory in Chrome (must show a notification per push).
- Dead subscriptions: delete on `410`/`404` from `sendNotification`.
- Migration journal `when` timestamp (above) — silent prod skip otherwise.
- Biome formatting + the editor-reformat gotcha (run `biome check --write` before staging).
- Keep VAPID **private** key server-only; only the public key ships to the web bundle.

## References

- push.foo (live PoC): https://push.foo/ · source:
  https://github.com/webmaxru/push.foo (Next.js + Workbox SW + `/api` routes + `.well-known`
  VAPID — standard flow).
- vite-plugin-pwa — custom SW / injectManifest:
  https://vite-pwa-org.netlify.app/guide/inject-manifest and the push-notifications
  discussion: https://github.com/vite-pwa/docs/issues/132
- `web-push` (server library): the de-facto Node library for VAPID + payload encryption.
- MDN: Push API, `PushManager.subscribe`, the `push`/`notificationclick` SW events.

## Commands

```bash
# generate VAPID keys once
npx web-push generate-vapid-keys
# dev: API + web
pnpm dev
# guardrails before pushing
pnpm test && pnpm biome check . && pnpm check:leaks && pnpm check:arch
```
