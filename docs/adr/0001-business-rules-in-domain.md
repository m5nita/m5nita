# ADR 0001 — Business rules live in `apps/api/src/domain/`

**Status**: Accepted (2026-05-26)
**Supersedes**: —

## Context

Before this decision, prize/fee math, scoring algorithm selection, ranking
tiebreaker rules, and match lifecycle decisions (12h "stale live",
kickoff-vs-now deadline, single-match pool eligibility) were duplicated in
4–6 places each across `services/`, `application/`, `infrastructure/`, jobs,
and the frontend. Any change to a rule meant grepping for every duplicate
and risked silent drift (front diverging from back; repo computing one way,
service another).

The hexagonal foundation (spec 011) introduced `domain/`, `application/`,
`infrastructure/` layers and repository ports, but did not enforce where
specific *rules* should live, so leaks were allowed to grow.

## Decision

Every core business rule has exactly one home, inside the domain layer of
`apps/api/src/`:

- **Money & fees** — `domain/shared/FeePolicy.ts` + `domain/prize/PrizeCalculation.ts`
- **Pure fee math shared with the front** — `packages/shared/src/lib/fee.ts`
  (the only place outside `domain/` allowed to encode the formula; `FeePolicy`
  delegates to it for back-end use)
- **Pool state & money methods** — `domain/pool/Pool.ts`
- **Scoring algorithm choice** — `Pool.scoringPolicy()` returning a
  `ScoringPolicy` from `domain/scoring/ScoringPolicy.ts`
- **Ranking** — `domain/ranking/Ranking.ts`
- **Match lifecycle** — `domain/match/Match.ts`, `MatchStatus.ts`,
  `StaleMatchPolicy.ts`, `MatchEligibility.ts`

Callers in `services/`, `application/`, `infrastructure/`, `jobs/`, and the
front consume these via methods on the aggregates or via the shared pure
helpers — they never re-derive the rule.

## Consequences

**Positive**

- One place to change a rule. Drift between back and front becomes mechanically
  impossible for the protected rules.
- Code in the outer layers reads as orchestration rather than business logic.
- Tests around domain rules are pure and fast (no DB, no HTTP).

**Negative**

- Slightly more indirection when a use case needs to derive a value
  (`pool.prize(memberCount, feePolicy)` instead of inline `floor(...)`).
- Repositories sometimes need extra port methods to keep the domain pure
  (e.g. `MatchRepository.hasUnfinishedFor(query)` so `closePoolsJob` doesn't
  branch on `pool.matchId`).

## Guardrails

Enforced in CI:

1. **G2** — `scripts/ci/check-domain-leaks.mjs` (`pnpm check:leaks`). Regex
   guard with file-level allow-lists. Catches inline prize/fee formulas,
   magic `0.05`, `MATCH_MAX_DURATION_MS` outside `StaleMatchPolicy`,
   `isSingleMatchPool` / `scope.matchId !== null` branching, deprecated
   helper usage, front-side `calculate*` financial helpers.
2. **G3** — `apps/api/src/_architecture.test.ts` (Vitest). Import-graph
   guard. Catches `domain/` reaching into outer layers, `application/`
   importing concrete adapters, `services/`/`routes/` bypassing the repository
   layer.

Both run on every CI build. Intentional exceptions use `// leak-allow:` or
`// arch-allow:` end-of-line comments with a short justification.

## Migration history

- **Onda 1** (PR #66, #67) — `FeePolicy`, `PrizeCalculation`, read-model in
  `DrizzlePoolRepository`, `services/pool.ts` rewrite, `services/coupon.ts:
  getEffectiveFeeRate` removal, front `lib/utils.ts` financial helpers
  deletion, shared fee helper.
- **Onda 2** (PR #68) — `Score.breakdown`, `ScoringPolicy` + impls,
  `Pool.scoringPolicy()`, `Ranking` VO, `services/ranking.ts` rewrite,
  `computeLivePoints` takes a policy.
- **Onda 3** (PR #69) — `MatchStatus`, `Match` aggregate, `StaleMatchPolicy`
  (12h), `MatchEligibility`, `Prediction.canSubmitFor(match)`, repository
  `hasUnfinishedFor(query)` consolidation, `matchUtils.ts` thin.
- **Guardrails** (this PR) — G3 architecture tests, CLAUDE.md section,
  this ADR, PR template checkbox.

## References

- `CLAUDE.md` § "Where business rules live (DDD layout)"
- Plan: `/Users/igortullio/.claude/plans/quero-fazer-uma-an-lise-snug-fiddle.md`
  (local plan file — captures the full analysis that motivated this work)
