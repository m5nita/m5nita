# Quickstart: Per-Participant Pool Statistics

How to build, configure, run and verify the feature locally. Follow the TDD + layer order from the plan.

## Configuration

| Env var | Default | Where read |
|---|---|---|
| `STATS_UNLOCK_PRICE_CENTAVOS` | `199` | `apps/api/src/container.ts` → `StatsUnlockPrice.of(...)` |
| `PAYMENT_GATEWAY` | (unset → Mock in dev) | existing; `mercadopago` / `infinitepay` / `stripe` in prod |

The domain never reads `process.env`; the composition root resolves the price and injects the VO.

## Migrations

```bash
pnpm drizzle-kit generate   # generates SQL for stats_unlock + participant_pool_stats
pnpm drizzle-kit migrate    # apply
# dev-only fast path: pnpm drizzle-kit push
```

Additive only — no change to prize/fee/`payment` column DDL (`payment.type` is text; only the shared `PAYMENT.TYPES` constant gains `'stats_unlock'`).

## Build order (matches plan phases)

1. **Domain (TDD, Vitest first)** — `domain/scoring` `maxPoints()`, then `domain/stats/`: `StatsUnlockPrice`, `StatsComparisonPolicy`, `PendingMatchImpactPolicy`, `ParticipantPoolStats`, + ports. Red → green → refactor. Target 100% coverage (constitution II).
2. **Infrastructure + application + cache + payment + migration** — Drizzle schemas/repos, `services/statsCache.ts`, `UnlockStatsUseCase`, `GetParticipantStatsUseCase`, `payment.type` plumbing through the gateway adapters, the `handleCheckoutCompleted` dispatch branch, the `calcPoints.ts` snapshot recompute + cache invalidation, and wiring in `container.ts` + `app.ts`.
3. **Frontend** — `estatisticas.tsx` route + `PoolHub` tab + `StatsPaywall`/`StatsPanel`/`Sparkline`/`CompareBar`, reusing the Pix → `payment-success` flow.

## Run

```bash
pnpm dev        # API + Web
```

## Manual verification (dev, Mock gateway)

With `PAYMENT_GATEWAY` unset, the Mock gateway auto-completes the checkout (now routed through `handleCheckoutCompleted`, so it exercises the real `stats_unlock` branch — see research D9).

1. Create a pool, join it with 2–3 users, submit predictions, finish a match (trigger `calcPoints`).
2. Open the pool → **Estatísticas** tab → confirm the **locked** teaser + price `R$ 1,99` (no real figures shown).
3. Click "Desbloquear" → Mock completes → tab now shows the **unlocked** panel (4 blocks).
4. Re-open the tab → no new charge, panel still unlocked.
5. Confirm a pending match for the user appears in the impact list with its kickoff; confirm **no** other member's prediction or any consensus is shown.

## Automated tests to add

**Domain (unit, Vitest)** — `domain/stats/*.test.ts`:
- exact%/result% vs average and leader; efficiency & points-left-on-table with both range (max 10) and single-match (max 14) maxima.
- ranking trend (rising/falling/stable) from `position` vs `prevPosition`.
- impact ranking is bounded (`O(pending+members)`), uses only own pending matches, never reads third-party predictions (anonymization assertions).
- "insufficient_data" states when `finished_count == 0` / dimension total `== 0`.
- `StatsUnlockPrice` default 199 + override.
- `maxPoints()` returns 10 (range) / 14 (single-match).

**Integration (real DB, spec 016 harness)**:
- **Gate**: non-member → 404; member without entitlement → `{unlocked:false, teaser, price}`; member with entitlement → full payload.
- **Idempotency**: duplicate `handleCheckoutCompleted` for a `stats_unlock` payment → one charge, exactly one `stats_unlock` row (SC-002).
- **Prize invariance (SC-003)**: snapshot `getPoolPrizeTotal`/`PrizeCalculation` before vs after N unlocks → identical (0 cents); assert no `poolMember` row created by an unlock.
- **No-leak (SC-004)**: unlocked payload for a pool with not-started matches contains no third-party prediction and no per-pending-match consensus.
- **Cache/freshness**: after `calcPoints` finishes a match, the aggregate cache is invalidated and unlocked users' snapshots are recomputed; the stats endpoint reflects the new result on next read.

## Guardrails (must be green before review)

```bash
pnpm check:leaks                       # no inline fee math, no hardcoded 10/14, no scope.kind branching
pnpm test apps/api/src/_architecture.test.ts   # layer boundaries; BASELINE_* must NOT grow
pnpm test                              # full suite incl. new domain + integration tests
pnpm biome check --write .
```

## Reviewer gate (CTO)

Reviewer signs off with `file:line` evidence that:
- stats math is only in `domain/stats/` (none in `services/`/`infrastructure/`/`jobs/`/front);
- scoring is reused via `prediction.points` + `maxPoints()` (no re-derivation, no hardcoded 10/14);
- the unlock is idempotent and prize is provably untouched;
- the tab is off the 30s poll path;
- guardrails green and `BASELINE_*` unchanged. No rubber-stamp.
