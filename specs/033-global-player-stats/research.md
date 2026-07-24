# Phase 0 Research: "Meu desempenho"

All unknowns from the Technical Context are resolved below. Format per decision:
Decision / Rationale / Alternatives considered.

## R1. Aggregation strategy — avoid the N+1 ranking scan

**Decision**: Compute the whole summary from **~3 batched queries**, then do all
per-pool math in memory in the domain:

1. `PerformanceReadRepository.getUserPoolFacts(userId)` — one user-scoped query
   returning, per **non-cancelled** pool the user belongs to: `poolId`, `name`,
   `status`, `entryFeeCentavos`, `discountPercent` (coupon join, null→0),
   `memberCount` (correlated `COUNT`), `entryPaidCentavos` (join
   `pool_member.paymentId → payment.amount`, completed entry), `joinedAt`, and
   `settledAt` (`pool.updatedAt` when closed). Drives participei, em andamento,
   the closed set, gastei, and the evolution ordering.
2. `RankingRepository.getStandingsForPools(closedPoolIds)` — one query,
   `inArray(pool_member.poolId, closedPoolIds)`, selecting `poolId` + the standing
   row, **ORDER BY `poolId`, then the full tiebreak** (`pointsTotal desc,
   exactMatches desc, name asc, userId asc`). Grouped by `poolId` in the
   application layer; each group is fed to `Ranking.build` to get position-1.
3. `PerformanceReadRepository.getUserWithdrawnPoolIds(userId)` — one query
   returning the pool ids that already have a `prize_withdrawal` row for the user
   (to compute "a sacar").

**Rationale**: The nearest existing code, `GetPendingPrizesUseCase`, loops
`GetPrizeInfoUseCase.execute` per closed pool, firing ~3–4 serial round-trips each
(`findByIdWithDetails` = 2 correlated subqueries, `getPoolRanking`, optional
`findByPoolAndUser`). For a global view that is O(pools) round-trips — unacceptable
on the small production box (Principle IV; the ranking re-aggregation + live-poll
load is already the scaling limit). Three set-based queries keep it O(1) in
round-trips regardless of history size. The pattern already exists in
`DrizzleStatsRepository.poolAggregate` (infra aggregates, domain derives).

**Alternatives considered**:
- *Reuse `GetPendingPrizesUseCase` and extend it* — rejected: it is the N+1 we must
  not copy; the global view is a superset needing losses/spend/series too.
- *Single monster SQL with window functions computing winnerShare in SQL* —
  rejected: it duplicates the ranking tiebreaker and the fee/prize formulas in SQL,
  violating Principle V (money & tiebreak math belong in the domain) and the G2
  domain-leak guardrail.
- *Materialized per-user stats table refreshed on pool close* — rejected as
  premature (YAGNI); adds write-path coupling and a migration for a read that 3
  batched queries already serve within budget. Revisit only if benchmarks fail.

## R2. Winner determination without duplicating the tiebreaker

**Decision**: Determine winners in the **domain** by reusing `Ranking.build`. For
each closed pool, map its (pre-sorted) standing rows to `RankingInput`
(`livePoints := totalPoints`, harmless because closed pools have no live matches),
call `Ranking.build(rows, userId)`, and take `position === 1` as the winner set;
`winnerCount = winners.length`, `isWinner = winners.some(w => w.userId === userId)`.

**Rationale**: The tiebreak rule (shared position only when both `totalPoints` and
`exactMatches` match) lives in `Ranking.build`. Reusing it — rather than a SQL
`RANK()` — keeps a single source of truth and matches how `GetPrizeInfoUseCase`
already picks winners (`ranking.filter(r => r.position === 1)`). No new `Ranking`
method is required; the batched query supplies the mandatory pre-sort.

**Alternatives considered**:
- *Add `Ranking.winnersOf(sortedRows)`* — viable and slightly cleaner (no dummy
  `currentUserId`), but reusing `build` avoids new domain surface. Kept as a
  fallback if `build`'s `isCurrentUser` mapping proves awkward in tests.
- *SQL `rank() over (…)`* — rejected (duplicates tiebreak; `DrizzleStatsRepository.currentPosition` even omits the name/userId tiebreak, so it is not tie-safe).

## R3. Signed money for `saldo` — the `Balance` value object

**Decision**: Add `domain/shared/Balance.ts`, an immutable value object wrapping a
**signed** integer centavos, with `Balance.of(centavos)`, `isPositive()`,
`isNegative()`, `isZero()`, `abs(): Money`, and `centavos`. `saldo = Balance.of(
premiosConquistados.centavos − gastei.centavos)`.

**Rationale**: `Money` intentionally forbids negatives (`Money.of` throws on
negative; `subtract` throws on a negative result) and has no `add`. `saldo` is a
P&L that is frequently negative (prejuízo). The constitution mandates value objects
for monetary concepts, so a raw signed `number` is not allowed. `Balance` is the
minimal, fully-tested primitive for this.

**Alternatives considered**:
- *Represent saldo as `{ sign, Money }`* — rejected: leaks the sign handling into
  every caller and the DTO; a VO centralizes it.
- *Relax `Money` to allow negatives* — rejected: `Money`'s non-negativity is relied
  on across prize/fee code; widening it risks regressions.

## R4. Summation without `Money.add`

**Decision**: Sum monetary quantities by adding **raw centavos** (integers) and
wrapping once with `Money.of(total)` (non-negative sums) or `Balance.of(total)`
(signed). Per-pool prize entitlement uses `PrizeCalculation.calculatePrizeTotal(
EntryFee.hydrate(entryFee), memberCount, FeePolicy.from(discountPercent))` then
`calculateWinnerShare(prizeTotal, winnerCount)` (guarded `winnerCount > 0`).

**Rationale**: `Money` exposes no `add`/`multiply`; centavos are integers so summing
them is exact. `EntryFee.hydrate` (not `of`) is the correct reconstructor for
persisted pools (skips the 500–100000 creation floor). This mirrors
`GetPrizeInfoUseCase` exactly.

**Alternatives considered**: adding `Money.add` — out of scope for this feature;
could be a later refactor but not required.

## R5. Metric definitions & edge cases (locked)

**Decision**:
- **participei** = count of the user's non-cancelled pools.
- **em andamento** = those with `status = 'active'` (not closed, not cancelled).
- **vitórias** = closed pools where the user is position 1 (ties count for all
  co-winners); **derrotas** = closed − vitórias.
- **aproveitamento** = `vitórias / (vitórias + derrotas)` as a ratio, or **null**
  when there are no decided pools (front shows "sem dados ainda").
- **gastei** = Σ `entryPaidCentavos` over non-cancelled pools (already coupon-net,
  completed entry payments only; excludes `stats_unlock`/`prize`/pending).
- **prêmios conquistados** = Σ `winnerShare` over won closed pools (entitlement,
  regardless of withdrawal).
- **saldo** = prêmios conquistados − gastei (a `Balance`).
- **a sacar** = Σ `winnerShare` over won closed pools **without** a `prize_withdrawal`
  row for the user.
- **maior prêmio** = max `winnerShare` across won pools, or null if never won.
- **evolução** = per-pool net (`(winnerShare || 0) − entryPaid`) accumulated in
  chronological order (`settledAt ?? joinedAt`); one point per pool.

**Rationale**: Directly encodes the spec's Requirements/Assumptions and matches the
existing winner/prize/withdrawal semantics.

**Alternatives considered**: counting "a sacar" as entitlement minus withdrawn
amount — rejected in favor of the simpler, existing "no withdrawal row yet" rule
(consistent with `GetPendingPrizesUseCase`, which lists `isWinner && withdrawal ===
null`).

## R6. No schema change; index sufficiency

**Decision**: Ship with **no migration**. Rely on existing indexes:
`payment_user_id_pool_id_idx` (leading `userId` covers the spend/entry read),
`pool_member_user_id_idx` (the "my pools" join), `pool_standing_pool_id_user_id_idx`
and `prize_withdrawal_pool_user_idx`.

**Rationale**: A user's row counts (pools, payments, standings) are small; the
leading-column indexes already restrict every batched query to the user's rows.
Adding a `payment(userId,type,status)` index is unnecessary for the expected
per-user cardinality and would add write cost.

**Alternatives considered**: add a covering `payment(userId,type,status)` partial
index — deferred; only add if the benchmark test (Principle IV) shows the spend
query missing budget in production-like data. If added later, follow the migration
`_journal.json` timestamp-bump gotcha.

## R7. Frontend structure & reuse

**Decision**: New guarded route `apps/web/src/routes/performance.tsx`
(`createFileRoute('/performance')` + `beforeLoad: () => requireAuthGuard()`,
mirroring `settings.tsx`). New `components/performance/` dir reusing the pool-stats
inline-SVG primitives: `EfficiencyDonut` → aproveitamento donut, `EvolutionLineChart`
→ saldo sparkline (single series), `RankingHero` → saldo hero panel, `CompareBar`/
card patterns → money tiles. Data via an inline `useQuery` (queryKey
`['my-performance']`) through `apiFetch`, optionally wrapped in a new
`useMyPerformance()` hook. Home card `MyPerformanceCard` self-gates (renders `null`
until data), inserted near the top of `DashboardHome`. Nav item added to **both**
arrays in `__root.tsx`. BRL via `formatCurrency`. Loading/error via `Loading`
(BallLoader) + `ErrorMessage`; empty state via the dashed `Insufficient` pattern.

**Rationale**: Matches every existing convention (Principle III); zero new chart
dependency (inline SVG already the house style).

**Alternatives considered**: a charting library — rejected (bundle budget, house
style is inline SVG).

## R8. Share card (P3)

**Decision**: Defer to a thin util mirroring `apps/web/src/lib/shareRanking.ts`
(existing share pattern), producing a shareable visual card of saldo/record/
aproveitamento/prêmios. Not part of the P1 MVP; sequenced after US1/US2.

**Rationale**: US3 is P3 and sits entirely on top of the P1 data; the existing
`shareRanking` gives a proven pattern.
