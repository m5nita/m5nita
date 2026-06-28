# Contracts: Web Push API

New external HTTP surface and the internal notification-port contract changed by this
feature. Routes live in `apps/api/src/infrastructure/http/routes/push.ts`, registered as
`app.route('/api', pushRoutes)` in `app.ts`. All routes require an authenticated session
(`requireAuth` middleware; `401 UNAUTHORIZED` otherwise) and return JSON. Error envelope
follows the repo convention: `{ "error": "CODE", "message": "..." }`.

---

## POST /api/push/subscribe

Register (or refresh) the current device's push subscription for the signed-in user.
Idempotent on `endpoint`.

**Auth**: required.

**Request body** (validated by `subscribePushSchema`):

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/abc123...",
  "keys": {
    "p256dh": "BPx...base64url...",
    "auth": "k9...base64url..."
  }
}
```

The server reads `User-Agent` from request headers to populate the optional device label
(`user_agent`); it is not part of the body.

**Responses**:

| Status | Body | When |
|--------|------|------|
| `201 Created` | `{ "ok": true }` | subscription stored or refreshed (upsert by endpoint) |
| `400 VALIDATION_ERROR` | `{ "error": "VALIDATION_ERROR", "message": "..." }` | malformed body / missing keys |
| `401 UNAUTHORIZED` | `{ "error": "UNAUTHORIZED", "message": "..." }` | no session |

**Behavior**:
- Upsert by `endpoint`: if the endpoint exists, update `user_id`, `p256dh`, `auth`,
  `user_agent` (FR-008 idempotent re-enable; FR-009 belongs to the authed user).
- Calling again from the same device is a no-op-equivalent `201`.

---

## DELETE /api/push/subscribe

Remove a device's subscription on opt-out (FR-005). The client also calls
`pushManager.getSubscription()?.unsubscribe()` locally.

**Auth**: required.

**Request body**:

```json
{ "endpoint": "https://fcm.googleapis.com/fcm/send/abc123..." }
```

**Responses**:

| Status | Body | When |
|--------|------|------|
| `200 OK` | `{ "ok": true }` | subscription for that endpoint removed (or already absent) |
| `400 VALIDATION_ERROR` | `{ "error": "VALIDATION_ERROR", "message": "..." }` | missing/invalid endpoint |
| `401 UNAUTHORIZED` | `{ "error": "UNAUTHORIZED", "message": "..." }` | no session |

**Behavior**:
- Deletes only the row matching (`user_id`, `endpoint`); other devices keep their
  subscriptions (FR-007). Deleting a non-existent endpoint still returns `200` (idempotent).

---

## VAPID public key delivery (no endpoint)

The VAPID **public** key reaches the web client at **build time** via
`import.meta.env.VITE_VAPID_PUBLIC_KEY` (mirrors `VITE_TURNSTILE_SITE_KEY`). No runtime
endpoint is exposed. The private key never leaves the server.

---

## Service worker push payload contract

The server sends `web-push` notifications with a JSON string body; `push-sw.js` parses it.

```json
{
  "title": "string (emoji-free, pt-BR)",
  "body": "string (emoji-free, pt-BR)",
  "url": "/relative/deep-link",
  "tag": "string (optional, collapses duplicates)"
}
```

- `push` handler: `showNotification(title, { body, icon: '/icon-192.png', data: { url }, tag })`.
- `notificationclick` handler: `close()` then focus an existing client at `url` or
  `clients.openWindow(url)` (FR-021).
- `userVisibleOnly: true` is set at subscribe time, so every push MUST render a
  notification (FR-020).

**Deep-link targets**:
| Trigger | `url` |
|---------|-------|
| Kickoff/palpite reminder | `/pools/{poolId}/predictions` |
| Pontos conquistados | `/pools/{poolId}` (ranking/results) |
| Winner alert | `/pools/{poolId}` |

---

## Internal contract — `NotificationService` port (changed)

Channel selection happens in `CompositeNotificationService`. Contract (see
`data-model.md` for full types):

- `notifyWinners(poolName, winners: WinnerInfo[], prizeShare)` — `WinnerInfo` gains
  `userId`. Routing per winner: **push (all devices) → Telegram → email**, exactly one
  channel (FR-011, FR-013).
- `sendPredictionReminders(reminders: ReminderData[])` — `ReminderData` gains `userId`.
  Same routing.
- `notifyMatchPoints(items: MatchPointsData[])` — **new**. For each item: record
  (`user_id`,`pool_id`,`match_id`) in `match_points_notified`; if newly recorded **and**
  the user has ≥1 subscription, send push to all devices. **Push-only** — no Telegram/email
  fallback (FR-016). Dead subscriptions pruned on `404`/`410` (FR-010).

**Routing invariant (FR-013)**: a single user receives any given event on **at most one**
channel — never Telegram *and* push for the same event.
