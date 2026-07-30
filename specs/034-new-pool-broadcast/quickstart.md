# Quickstart: exercising the broadcast and the preferences locally

## Prerequisites

- `docker compose up -d postgres` (and `postgres-test` for integration tests).
- `apps/api/.env` with non-empty `RESEND_API_KEY` and `TELEGRAM_BOT_TOKEN` — the
  API throws at import without them, even in dev.
- Migration applied: `pnpm --filter @m5nita/api db:migrate`.
- `pnpm dev` (API + web).

## Seeing the toggles

1. Log in (dev phone flow: `+5511999999999`; the OTP is printed to the API console
   as `[DEV] OTP for …`).
2. Open `/settings`. Below the per-device push block there is **"O que você quer
   receber"** with three switches and one locked row (`Prêmio disponível — sempre
   ativo`).
3. Toggle "Novos bolões" off and reload: the state persists. Check the row that was
   written:

   ```sql
   select * from notification_preference where user_id = '<your-user-id>';
   ```

   Only the type you touched has a row. Everything else resolves from
   `notification_type.default_enabled`.

## Triggering an announcement end to end

Push needs two accounts, because the creator is always excluded.

1. As user **B**, open `/settings` and enable push for the device (grant the
   browser permission). Confirm:

   ```sql
   select user_id, count(*) from push_subscription group by user_id;
   ```

2. As user **A**, go to `/pools/create`, fill the form, and **tick "avisar todo
   mundo do m5nita sobre este bolão"**.
3. Complete the checkout. In dev without `PAYMENT_GATEWAY` set, `MockPaymentGateway`
   confirms the payment immediately, so `CompleteCheckoutUseCase` runs inline and
   the announcement fires within the same request.
4. User **B** receives one push: *"Novo bolão no m5nita — A criou … · entrada
   R$ …"*. Clicking it opens `/invite/<code>`.
5. The API log shows the delivery outcome (`[WebPush] send outcome=ok`). User **A**
   receives nothing.

### Checking the negative paths

| To verify | Do this | Expect |
|---|---|---|
| Unpaid pool never announces | Create with the box ticked, abandon the checkout | no notification; `pool.status = 'pending'` |
| Unticked box | Create without ticking | no notification |
| Preference respected | B turns "Novos bolões" off, then A announces | B gets nothing |
| Telegram fallback | B disables push but has a linked Telegram chat | B gets the Telegram message only |
| Locked type | `curl -X PATCH … -d '{"code":"pool_result","enabled":false}'` | `409 NOTIFICATION_TYPE_LOCKED` |
| Unknown type | same with `"code":"nope"` | `404 UNKNOWN_NOTIFICATION_TYPE` |
| Payment survives a broken channel | stop the push service / unset VAPID keys and announce | payment `completed`, pool `active`, member row present, error in the log |

> Telegram in dev: `findChatIdByPhone` only resolves for a phone that has actually
> talked to the bot. Without that, the fallback is exercised by the unit tests
> rather than by hand.

## Adding a fifth notification type (SC-005)

No code changes, no deploy:

```sql
insert into notification_type (code, label, description, opt_outable, default_enabled, sort_order)
values ('pool_closing', 'Bolão encerrando',
        'Aviso quando um bolão que você participa está prestes a fechar.',
        true, true, 5);
```

Reload `/settings` — the new switch is there and patchable. (The in-process catalog
cache means an API restart may be needed in dev; that is expected, since the
catalog is treated as near-static.)

The reverse direction is guarded: `NOTIFICATION_TYPE_CODES` in the domain must stay
in sync with the seeded catalog, and a Vitest consistency test fails the build if a
code the application sends has no catalog row.

## Tests

```bash
# Domain + application + adapters (unit)
pnpm --filter @m5nita/api exec vitest run src/domain/notification src/application/notification
pnpm --filter @m5nita/api exec vitest run src/application/pool/AnnounceNewPoolUseCase.test.ts
pnpm --filter @m5nita/api exec vitest run src/infrastructure/external/CompositeNotificationService.test.ts

# Whole suite + guardrails
pnpm test
pnpm check:leaks
pnpm check:arch
pnpm biome check --write .

# Integration (real Postgres on 5433)
DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test \
  pnpm --filter @m5nita/api test:integration
```
