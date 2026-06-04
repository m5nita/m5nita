# Quickstart / Manual Verification

Backend-only feature in `apps/api`. Email uses Resend; in dev without a real key, sends are
logged/mocked. The fastest confidence is the automated tests; manual steps below confirm
the end-to-end wiring.

## Run the automated checks

```bash
pnpm test            # unit + integration (Vitest)
pnpm biome check .   # lint + format
pnpm check:leaks     # architecture leak guard (G2)
pnpm build           # type-check / production build
```

Key tests:

- `apps/api/src/infrastructure/external/CompositeNotificationService.test.ts` — routing +
  per-item isolation for reminders and winners.
- `apps/api/src/lib/resend.test.ts` — reminder/winner email shape.
- `apps/api/src/jobs/reminderJob.test.ts` — candidate selection (phone OR verified email);
  channel-agnostic `ReminderData`.
- `apps/api/src/jobs/closePoolsJob.test.ts` — winners carry email.

## Manual scenario (reminders)

1. Set `RESEND_API_KEY`, `APP_URL` in `apps/api` env.
2. Create a pool with a match scheduled to start within the next hour.
3. Add a member whose user has a **verified email and no linked Telegram** (e.g., a
   Google/magic-link account); ensure they have **no** prediction for that match.
4. Trigger the reminder cycle (wait for the 15-min `prediction-reminders` cron, or invoke
   `sendPredictionReminders()` directly).
5. **Expect**: the member receives a branded email with the pool name, the match line
   (`Time A x Time B — em N min`) and a "Fazer palpites" button →
   `{APP_URL}/pools/{poolId}/predictions`.
6. Repeat with a member who **has** a linked Telegram → they receive the Telegram message
   and **no** email.

## Manual scenario (winner)

1. Have a pool whose matches are all finished, with a clear winner whose user has a
   **verified email and no linked Telegram**.
2. Trigger pool close (`checkAndClosePools()` / the close cron).
3. **Expect**: the winner receives a branded email — "🏆 Você venceu o bolão {poolName}!",
   prize in BRL, and a withdrawal CTA → `{APP_URL}`.
4. A winner with linked Telegram receives the Telegram message and no email.

## Regression to confirm (out of scope, must not break)

- Admin withdrawal-request notification still arrives in Telegram (with the "Mark as paid"
  button) for `ADMIN_USER_IDS`.
- Login OTP via Telegram is unchanged.
