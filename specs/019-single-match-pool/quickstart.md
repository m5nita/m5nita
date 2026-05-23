# Quickstart — Single-match pool

## Try the feature end-to-end (local dev)

Pre-req: existing m5nita dev environment is up (`pnpm dev` runs API + web; Postgres on 5432 with seed data including at least one active league competition with upcoming matches).

1. **Apply the new migration**
   ```bash
   pnpm drizzle-kit generate
   pnpm drizzle-kit migrate
   ```
2. **Sign in** at http://localhost:3000.
3. **Open "New pool"** from the pools list.
4. **Pick a competition** (e.g., the seeded La Liga). The new **scope toggle** appears.
5. **Switch to "One match"**. The matchday-range inputs disappear; the **upcoming-match picker** loads, grouped by matchday (or by stage for cup competitions). Only matches whose kickoff is in the future are listed.
6. **Select one match**. The pool summary at the bottom names the two teams and the kickoff time.
7. **Submit**. The existing checkout flow runs unchanged.
8. **Open the new pool**. Only the chosen match is shown for prediction. Submitting a prediction for any other match returns the standard "not in this pool" error.
9. **Force-finish the match** in dev (admin Telegram command or DB update of `home_score`/`away_score` + `status='FINISHED'`). The scoring job picks it up; the pool's leaderboard reflects scores, with prize split equally among all top-tied scorers.

## Verify the constitution gates pass

```bash
pnpm biome check .
pnpm test --filter @m5nita/api -- domain/shared/PoolScope domain/pool/Pool application/pool/CreatePoolUseCase
pnpm test --filter @m5nita/api -- infrastructure/http/routes/pools infrastructure/persistence/DrizzlePoolRepository
pnpm test --filter @m5nita/web
```

Expected: all green, including the new `PoolScope` unit tests (100% coverage), the updated `Pool` entity tests, the new branch in `CreatePoolUseCase` tests (single-match success + `MATCH_UNAVAILABLE` rejection), and the integration test for `POST /api/pools` that exercises both scope modes plus the `INVALID_SCOPE` 400.

## Verify the database invariant

```bash
psql $DATABASE_URL -c "INSERT INTO pool (id, name, entry_fee, owner_id, invite_code, competition_id, matchday_from, matchday_to, match_id, status) VALUES (gen_random_uuid(), 'bad', 100, '00000000-0000-0000-0000-000000000000', 'BADXYZ', '<comp-uuid>', 1, 1, '<match-uuid>', 'pending');"
```

Expected: `ERROR: new row for relation "pool" violates check constraint "pool_scope_exclusivity_chk"`.

## Demo script (90 seconds, mirrors SC-001)

1. Open New pool → 5s
2. Pick competition → 5s
3. Toggle "One match" → 2s
4. Scroll picker, select a marquee fixture → 15s
5. Enter pool name + entry fee → 20s
6. Confirm → 5s
7. Land on the invite page showing the single match → 5s

Total ≈ 60s, well under the 90s SC-001 target.
