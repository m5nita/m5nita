# Quickstart: verifying the statistics scope gate

## Prerequisites

- `docker compose up -d postgres` (and `postgres-test` for integration tests).
- `apps/api/.env` with non-empty `RESEND_API_KEY` and `TELEGRAM_BOT_TOKEN` — the
  API throws at import without them, even in dev.
- `pnpm dev`, then log in (dev phone flow `+5511999999999`; the OTP is printed to
  the API console as `[DEV] OTP for …`).

## The three cases, by hand

Seed data: `pnpm --filter @m5nita/api db:seed` plus `db:seed-stats` gives a pool
with statistics data.

| Open | Expect |
|---|---|
| A **whole-competition** pool (no `matchday_from`, no `match_id`) | "Estatísticas" tab present, paywall or panel exactly as before |
| A **matchday-range** pool | no tab |
| A **single-fixture** pool | no tab (previously hidden by a front-end check, now by the same server rule) |

Check the flag directly:

```bash
curl -s -b cookies.txt localhost:3001/api/pools/<poolId> | jq '{matchdayFrom, matchId, statsAvailable}'
```

Then confirm the tab and the flag agree — that is the whole contract.

### Direct-URL and endpoint behaviour

```bash
# member of a range pool, no unlock
curl -i -b cookies.txt localhost:3001/api/pools/<rangePoolId>/stats
# → 404 SCOPE_UNSUPPORTED

curl -i -X POST -b cookies.txt localhost:3001/api/pools/<rangePoolId>/stats/unlock
# → 404 SCOPE_UNSUPPORTED, and no new row in "payment"
```

Visiting `/pools/<rangePoolId>/stats` in the browser should land on the
predictions tab, not an error screen.

## The case that must not break: someone who already paid

Dev uses the **live** InfinitePay handle, so do not try to buy it. Grant the
entitlement directly instead:

```sql
-- pick a range pool you are a member of
INSERT INTO stats_unlock (id, user_id, pool_id, payment_id)
SELECT gen_random_uuid(), '<yourUserId>', '<rangePoolId>', p.id
FROM payment p
WHERE p.user_id = '<yourUserId>' AND p.pool_id = '<rangePoolId>'
LIMIT 1;
```

Reload the pool: the tab is back for you, and the panel loads. A different member
of that same pool still sees no tab. That asymmetry is the feature.

To confirm production is in the state the spec describes:

```sql
SELECT su.user_id, su.pool_id
FROM stats_unlock su JOIN pool p ON p.id = su.pool_id
WHERE p.matchday_from IS NOT NULL OR p.match_id IS NOT NULL;
-- 2 rows as of 2026-07-29 — these are the people who must keep access
```

## Tests

```bash
pnpm --filter @m5nita/api exec vitest run src/domain/shared/PoolScope.test.ts
pnpm --filter @m5nita/api exec vitest run src/application/stats
pnpm --filter @m5nita/web exec vitest run src/components/pool

pnpm test
pnpm check:leaks
pnpm check:arch

DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test \
  pnpm --filter @m5nita/api test:integration
```
