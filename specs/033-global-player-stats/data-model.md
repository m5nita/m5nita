# Phase 1 Data Model: "Meu desempenho"

**No new persistence tables and no migration.** This feature is a read model over
existing tables plus new domain value objects. This document describes (a) the
reused tables, (b) the read projections returned by the infrastructure, (c) the
domain objects that compute the result, and (d) the response DTO.

## A. Reused persistence tables (reference only)

| Table | Columns used | Role here |
|-------|--------------|-----------|
| `pool` | `id`, `name`, `entry_fee`, `status` (`active`/`closed`/`cancelled`), `coupon_id`, `updated_at` | membership target; `status` classifies em andamento vs decided; `updated_at` ≈ settledAt when closed |
| `pool_member` | `pool_id`, `user_id`, `payment_id`, `joined_at` | the user's pools (via `pool_member_user_id_idx`); links to the entry payment |
| `pool_standing` | `pool_id`, `user_id`, `points_total`, `exact_matches` | winner determination per closed pool |
| `payment` | `user_id`, `pool_id`, `amount`, `status`, `type` | `entry`+`completed` → entryPaid / gastei |
| `prize_withdrawal` | `pool_id`, `user_id` | existence ⇒ prize already claimed (drives "a sacar") |
| `coupon` | `discount_percent` | fee discount for prize math |

## B. Read projections (infrastructure → application)

### `UserPoolFact` — from `PerformanceReadRepository.getUserPoolFacts(userId)`

One row per **non-cancelled** pool the user belongs to.

| Field | Type | Notes |
|-------|------|-------|
| `poolId` | string (uuid) | |
| `name` | string | |
| `status` | `'active' \| 'closed'` | cancelled excluded by the query |
| `entryFeeCentavos` | integer ≥ 0 | `pool.entry_fee` |
| `discountPercent` | integer 0–100 | coupon join, null → 0 |
| `memberCount` | integer ≥ 1 | correlated `COUNT(pool_member)` |
| `entryPaidCentavos` | integer ≥ 0 | `payment.amount` for `pool_member.payment_id`, completed entry (coupon-net; 0 for comp members) |
| `joinedAt` | timestamp | `pool_member.joined_at` |
| `settledAt` | timestamp \| null | `pool.updated_at` when `status='closed'`, else null |

### `PoolStandingRow` — from `RankingRepository.getStandingsForPools(poolIds)`

One row per member of each closed pool, **pre-sorted** `ORDER BY pool_id,
points_total DESC, exact_matches DESC, name ASC, user_id ASC`.

| Field | Type |
|-------|------|
| `poolId` | string |
| `userId` | string |
| `name` | string \| null |
| `totalPoints` | integer |
| `exactMatches` | integer |

### `getUserWithdrawnPoolIds(userId): string[]`

Pool ids that already have a `prize_withdrawal` row for the user.

## C. Domain objects (application composes; math stays in domain)

### `Balance` (VO, `domain/shared/Balance.ts`) — NEW
- `centavos: number` (signed integer)
- `static of(centavos: number): Balance` — integer required; sign allowed
- `isPositive() / isNegative() / isZero(): boolean`
- `abs(): Money`

### `PoolContribution` (domain input, assembled by the use case)
Per pool the user is in:
| Field | Type | Notes |
|-------|------|-------|
| `status` | `'active' \| 'closed'` | |
| `entryPaid` | `Money` | from `entryPaidCentavos` |
| `isWinner` | boolean | closed only; from `Ranking.build` position 1 |
| `winnerShare` | `Money \| null` | closed winners only; `PrizeCalculation.calculateWinnerShare(prizeTotal, winnerCount)` |
| `hasWithdrawal` | boolean | from `getUserWithdrawnPoolIds` |
| `orderAt` | timestamp | `settledAt ?? joinedAt` (evolution ordering) |
| `poolId` | string | for the evolution point label |

> `prizeTotal` is derived in the domain: `PrizeCalculation.calculatePrizeTotal(
> EntryFee.hydrate(entryFeeCentavos), memberCount, FeePolicy.from(discountPercent))`.

### `PerformanceSummary` (aggregate VO, `domain/performance/PerformanceSummary.ts`) — NEW
Produced by `PerformanceCalculation.summarize(contributions)`.

| Field | Type | Derivation |
|-------|------|-----------|
| `participei` | integer | count of contributions |
| `vitorias` | integer | count `status='closed' && isWinner` |
| `derrotas` | integer | count `status='closed' && !isWinner` |
| `emAndamento` | integer | count `status='active'` |
| `aproveitamento` | number \| null | `vitorias/(vitorias+derrotas)`, **null** when denominator 0 |
| `gastei` | `Money` | Σ `entryPaid.centavos` |
| `premiosConquistados` | `Money` | Σ `winnerShare.centavos` (won pools) |
| `aSacar` | `Money` | Σ `winnerShare.centavos` where `isWinner && !hasWithdrawal` |
| `saldo` | `Balance` | `Balance.of(premiosConquistados.centavos − gastei.centavos)` |
| `maiorPremio` | `Money \| null` | max `winnerShare`, null if none |
| `evolucao` | `EvolutionPoint[]` | contributions sorted by `orderAt`, cumulative `(winnerShare||0) − entryPaid` |

### `EvolutionPoint` (VO)
`{ poolId: string; orderAt: Date | null; cumulativeSaldoCentavos: number (signed) }`

### `PerformanceCalculation` (domain service, `domain/performance/PerformanceCalculation.ts`) — NEW
- `static summarize(contributions: PoolContribution[]): PerformanceSummary`
- Pure, no I/O. 100% unit-tested. Enforces the **reconciliation invariant**
  (SC-003): `saldo.centavos === Σ((winnerShare||0) − entryPaid)` over non-cancelled
  pools, and (SC-005) `vitorias + derrotas === count(status='closed')`.

## D. Response DTO (`packages/shared` → HTTP)

`MyPerformanceResponse` (see `contracts/get-my-performance.md`) — the route maps the
`PerformanceSummary` VO to primitive centavos + a signed `saldoCentavos`, so the
frontend only formats (via `formatCurrency`) and colors by sign.

## Validation & derivation rules

- Cancelled pools never appear (filtered in the query) → excluded from every count
  and total.
- Free pools (`entryFeeCentavos = 0`) contribute to counts/record but add 0 to
  money.
- `aproveitamento` is **null**, never `0`, when there are no decided pools.
- Ties for 1st: every co-winner has `isWinner = true`; `winnerShare` uses
  `winnerCount = |position-1 set|` so the split matches what the pool pays.
- All sums are non-negative except `saldo` (a `Balance`).
