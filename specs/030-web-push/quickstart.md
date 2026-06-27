# Quickstart: Web Push Notifications (PWA)

How to configure, run, and manually verify Web Push end-to-end in local dev.

## 1. Generate VAPID keys (once)

```bash
npx web-push generate-vapid-keys
# => Public Key:  B...   Private Key:  ...
```

## 2. Environment

**API** — `apps/api/.env` (and document in `apps/api/.env.example`):

```bash
VAPID_PUBLIC_KEY=<public key from step 1>
VAPID_PRIVATE_KEY=<private key from step 1>
VAPID_SUBJECT=mailto:admin@m5nita.com
```

VAPID keys are **optional** for boot: if unset, the API logs a warning and push delivery
is disabled (subscribe routes still work; sends are skipped). They are **not** added to
`requiredEnvVars`.

**Web** — `apps/web/.env` (and `apps/web/.env.example`):

```bash
VITE_VAPID_PUBLIC_KEY=<same public key>
```

> The web build needs a rebuild/restart to pick up a changed `VITE_*` value. Only the
> **public** key ships to the browser; never expose the private key with a `VITE_` prefix.

## 3. Install the dependency & migrate

```bash
pnpm --filter @m5nita/api add web-push
pnpm --filter @m5nita/api add -D @types/web-push   # if types are not bundled
pnpm --filter @m5nita/api db:generate              # creates migration 0015 (2 tables)
# VERIFY: open apps/api/drizzle/meta/_journal.json — the new 0015 entry's "when" must be
# greater than 0014's (1781656602574). If not, bump it (boot-time migrate skips
# out-of-order entries in prod).
pnpm --filter @m5nita/api db:migrate               # or db:push in dev
```

## 4. Run

```bash
pnpm dev   # API + web. localhost is a secure context, so Push API works without HTTPS.
```

## 5. Manual end-to-end verification

1. **Log in** (dev: phone `+5511999999999`; the OTP is printed to the API console as
   `[DEV] OTP for …`).
2. **First-open prompt**: on a fresh profile (no `m5nita.push.promptSeen` in
   `localStorage`), the soft explainer modal appears. Choose **enable** → grant the
   native browser permission → confirm a `push_subscription` row exists for your user
   (DB or `db:studio`). Reload → the modal does **not** reappear.
3. **Settings toggle**: open `/settings`; the push control shows "enabled". Toggle off →
   the row is deleted and the local subscription is unsubscribed. Toggle on → re-subscribes.
4. **Kickoff reminder via push**: ensure your user is a member of a pool with an upcoming
   match (within the reminder window) and **no** palpite for it; trigger
   `sendPredictionReminders` (cron `*/15`, or invoke the job). With a push subscription you
   receive a **push** (not Telegram/email); tapping it opens `/pools/{poolId}/predictions`.
5. **Pontos conquistados**: with a submitted palpite, drive a match to `finished` via the
   live-score sync path (the `onMatchFinished` → `calcPointsForMatch` →
   `NotifyMatchPointsUseCase` chain). Confirm **one push per pool** containing that match
   stating points earned + your position, deep-linking to `/pools/{poolId}`. Re-run the
   sync for the same match → **no** duplicate push (a `match_points_notified` row already
   exists).
6. **Winner alert**: close a pool where your user is the winner → receive a **push**
   (not Telegram/email) opening `/pools/{poolId}`.
7. **Dead-subscription pruning**: from browser devtools, unsubscribe the SW subscription
   without telling the server, then trigger a send → the server gets `404/410` and the
   `push_subscription` row is removed.
8. **iOS degrade**: in iOS Safari (a tab, not installed), the enable control shows the
   "Adicionar à Tela de Início" guidance and does not error.

## 6. Guardrails before pushing

```bash
pnpm test \
  && pnpm biome check . \
  && pnpm check:leaks \
  && pnpm check:arch

# Integration tests (real Postgres on :5433):
DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test \
  pnpm --filter @m5nita/api test:integration
```

Run `pnpm biome check --write <file>` before staging (editor may reformat to
Prettier-style; Biome is the source of truth — no semicolons, single quotes).

## Notes / gotchas

- **Emoji-free copy**: all push titles/bodies must contain no emoji (pt-BR), matching the
  rest of the product.
- **`userVisibleOnly: true`** is mandatory at subscribe time — every push must show a
  visible notification.
- **HTTPS** is required in production; `localhost` is exempt for dev.
- **Don't double-notify**: routing picks exactly one channel per user per event
  (push → Telegram → email).
- **Pontos is push-only** in v1 — users without a subscription receive nothing for it.
