# Quickstart: "Meu desempenho"

How to build, run, and verify this feature. Assumes the monorepo dev setup
(`pnpm install`, Node ≥ 22).

## Build order (domain-first, per constitution V)

1. **Domain**
   - `apps/api/src/domain/shared/Balance.ts` (+ `Balance.test.ts`, 100%).
   - `apps/api/src/domain/performance/PerformanceSummary.ts`,
     `PerformanceCalculation.ts` (+ `PerformanceCalculation.test.ts`, 100%),
     `PerformanceReadRepository.port.ts`.
   - `apps/api/src/domain/ranking/RankingRepository.port.ts` → add
     `getStandingsForPools(poolIds: string[])`.
2. **Application**
   - `apps/api/src/application/performance/GetMyPerformanceUseCase.ts`
     (+ `.test.ts` with fake repos).
3. **Infrastructure**
   - `DrizzlePerformanceReadRepository.ts` (getUserPoolFacts, getUserWithdrawnPoolIds).
   - `DrizzleRankingRepository.ts` → implement `getStandingsForPools` (`inArray`).
   - `users.ts` route → `GET /users/me/performance`.
   - `container.ts` → construct + expose `getMyPerformanceUseCase`.
   - `packages/shared/src/types/index.ts` → `MyPerformanceResponse`.
4. **Frontend**
   - `apps/web/src/routes/performance.tsx` (guarded).
   - `apps/web/src/components/performance/*` (reuse stats SVG primitives).
   - `apps/web/src/components/home/DashboardHome.tsx` → `<MyPerformanceCard/>`.
   - `apps/web/src/routes/__root.tsx` → nav item in **both** arrays.

## Run

```bash
pnpm dev                      # API + web dev servers
pnpm --filter @m5nita/api db:seed   # dev data (seeded demo user has pools)
```

Log in (dev): phone `+5511999999999`; OTP is printed to the API console as
`[DEV] OTP for …` (no Telegram in dev). Open **Meu desempenho** from the header nav,
or see the summary card on the home dashboard.

Hit the endpoint directly (needs the session cookie):

```bash
curl -s http://localhost:3000/api/users/me/performance -b cookie.txt | jq
```

## Test

```bash
# Domain + application unit tests (fast, no DB)
pnpm --filter @m5nita/api exec vitest run src/domain/shared/Balance.test.ts
pnpm --filter @m5nita/api exec vitest run src/domain/performance/PerformanceCalculation.test.ts
pnpm --filter @m5nita/api exec vitest run src/application/performance/GetMyPerformanceUseCase.test.ts

# Full unit suite
pnpm test

# Integration (real Postgres on 5433 — docker compose postgres-test)
DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test \
  pnpm --filter @m5nita/api test:integration

# Architecture + domain-leak guardrails
pnpm check:leaks
pnpm check:arch
pnpm biome check --write .
```

## Acceptance mapping (verify against spec)

| Spec | Verified by |
|------|-------------|
| US1 #1 (all numbers) | `PerformanceCalculation.test.ts` + integration over the 17-pool fixture |
| US1 #2 (a sacar / withdraw) | integration: seed a withdrawal, assert `aSacarCentavos` drops, `saldo` unchanged |
| US1 #3 (only in-progress → aproveitamento null) | domain test: no closed pools |
| US1 #4 (empty state) | contract test: `participei=0` payload; web renders empty state |
| US1 #5 (negative saldo) | domain test: gastei > prêmios → `Balance.isNegative()` |
| US2 (home card) | web: card shows saldo + record, links to `/performance`, hidden when logged out |
| SC-003 / SC-005 (reconciliation) | contract/integration invariants (see contract doc) |
| SC-004 / Perf | endpoint benchmark + query-count guard (≤ 3 round-trips, p95 < 200ms) |

## Definition of done

- Domain new code at 100% coverage; overall new-code coverage ≥ 80%.
- `pnpm test`, `test:integration`, `check:leaks`, `check:arch`, `biome check` green.
- Endpoint meets the performance budget; no N+1 (verified).
- Screen + home card match the approved "Carteira" mockup, light and dark.
