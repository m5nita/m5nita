# Implementation Plan: Knockout Scoring (Extra Time & Penalties) + New Global Scoring Scale

**Branch**: `023-knockout-scoring` | **Date**: 2026-06-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/023-knockout-scoring/spec.md`

## Summary

Two related scoring changes, both forward-only:

1. **Refined global scale (all matches)** — replace the 4-tier scale (10/7/5/0) with a 5-tier scale **10 / 8 / 7 / 5 / 0**: exact → correct winner + winner's exact goals → correct winner + goal difference → correct result → miss. This is a change to the single domain rule in `domain/scoring/Score.ts` plus the `SCORING` constants.

2. **Knockout result handling** — capture the data provider's separated sub-scores (regulation, extra time, penalties), the winner, and the decision type; grade the scoreline on **regulation + extra time** (never the shootout-inflated `fullTime`); let every knockout prediction carry a "who advances on penalties" pick; and award **+2** when the match is actually decided on penalties and the pick matches the advancing side.

The technical approach keeps all rules in the domain layer: `Score.calculate` (the scale), a new `KnockoutResult` value object (decision type + winner + sub-scores), and an advance-bonus rule applied inside `ScoringPolicy.score(...)` so the ~5 scoring call sites stay single-sourced. Ingestion (the football-data port + sync use cases) is widened to carry the new provider fields; the `match` and `prediction` tables gain additive nullable columns via one Drizzle migration.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js ≥ 22 (monorepo, pnpm)  
**Primary Dependencies**: Hono (HTTP), Drizzle ORM (Postgres), Better Auth, grammY (Telegram); React 19 + TanStack Router/Query + Tailwind v4 (web); football-data.org v4 (match data, via `fetch`)  
**Storage**: PostgreSQL 16 via Drizzle. Additive nullable columns on existing `match` and `prediction` tables; one new migration `0011`. No new tables.  
**Testing**: Vitest (unit + integration). Domain scoring is pure → 100% unit coverage target (constitution II).  
**Target Platform**: Linux server (API) + PWA (web)  
**Project Type**: Web application (monorepo: `apps/api`, `apps/web`, `packages/shared`)  
**Performance Goals**: No change to hot paths. Scoring stays O(1) per prediction; the live-poll/ranking re-aggregation path is unchanged in shape (no new queries per prediction).  
**Constraints**: Forward-only — already-settled matches are never recomputed. New migration MUST carry a sequential `when` in `drizzle/meta/_journal.json` above the last entry (`1781510800000`), per the documented boot-time-migrate gotcha. Rules MUST live in `domain/` (G2/G3 architecture guardrails).  
**Scale/Scope**: Small production box (3 vCPU / 4 GB). World Cup-scale pools; knockout matches are a few dozen per tournament.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| **I. Code Quality** | New scale and bonus are small, single-responsibility additions to existing value objects. `SCORING` gains named constants (`WINNER_AND_WINNER_GOALS = 8`, `PENALTY_ADVANCE_BONUS = 2`) — no magic numbers. `KnockoutResult` and the advance-bonus rule are value objects, not primitives leaking through signatures. PASS. |
| **II. Testing Standards** | Scoring is pure domain → unit tests enumerate the full 10/8/7/5/0 truth table and the bonus matrix (shootout × pick × winner). Ingestion mapping (reg+ET, never fullTime) gets adapter/integration tests. TDD: tests authored before each domain change. PASS. |
| **III. UX Consistency** | The advance pick reuses the existing prediction surface (`ScoreInput`); result display reuses existing score rendering, extended with the shootout/winner annotation. Portuguese copy stays consistent. PASS. |
| **IV. Performance** | No new per-prediction queries; scoring remains O(1). The bonus needs `match.winner`/`duration`, already loaded with the match row. No N+1 introduced. PASS. |
| **V. Hexagonal & SOLID** | Scale → `domain/scoring/Score.ts`; knockout result → `domain/match` value object; bonus rule → `domain/scoring` applied via `ScoringPolicy`; provider fields enter through `application/ports/FootballDataApi.port.ts` and the infrastructure adapter; persistence via Drizzle mappers. Dependency direction preserved (domain has zero infra imports). PASS. |

**Result**: PASS — no violations, Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/023-knockout-scoring/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions & rationale
├── data-model.md        # Phase 1 — entity/column/algorithm changes
├── quickstart.md        # Phase 1 — how to validate
├── contracts/           # Phase 1 — API + domain scoring contracts
│   ├── prediction-api.md
│   └── scoring.md
└── checklists/
    └── requirements.md  # From /speckit.specify
```

### Source Code (repository root)

```text
packages/shared/src/
├── constants/index.ts        # SCORING: add WINNER_AND_WINNER_GOALS=8, PENALTY_ADVANCE_BONUS=2
├── schemas/index.ts          # upsertPredictionSchema: add optional advancePick
└── types/index.ts            # Prediction/Match types: advancePick, winner, duration, sub-scores, penaltyBonus

apps/api/src/
├── domain/
│   ├── scoring/
│   │   ├── Score.ts              # 5-tier scale (10/8/7/5/0) + penaltyBonus in breakdown
│   │   ├── ScoringPolicy.ts      # score(...) gains optional knockout context; applies bonus
│   │   ├── SingleMatchScore.ts   # base now 5-tier (delegates to Score); bonus stacks
│   │   └── PenaltyAdvanceBonus.ts# NEW — pure rule: shootout × pick × winner → 0|2
│   ├── match/
│   │   ├── KnockoutResult.ts     # NEW value object: decision type + winner + sub-scores; graded scoreline = reg+ET
│   │   ├── MatchStage.ts         # NEW (or helper): isKnockout(stage) = stage ∉ {group, league}
│   │   └── Match.ts              # optional: expose isKnockout()/winner for domain questions
│   └── prediction/Prediction.ts  # carry advancePick; calculatePoints takes knockout context
├── application/
│   ├── ports/FootballDataApi.port.ts   # ExternalMatch.score: add regularTime, extraTime, penalties, winner, duration
│   ├── match/SyncFixturesUseCase.ts    # map graded scoreline = reg+ET; persist sub-scores/winner/duration
│   ├── match/SyncLiveScoresUseCase.ts  # same mapping for live → finished
│   └── prediction/UpsertPredictionUseCase.ts # accept & persist advancePick
├── infrastructure/
│   ├── external/FootballDataApiAdapter.ts    # read new fields off the raw v4 response
│   ├── persistence/mappers/MatchMapper.ts    # map new columns ↔ domain
│   └── http/routes/predictions.ts            # validate advancePick
├── db/
│   ├── schema/match.ts          # + extraTime*, penalty*, winner, duration columns (nullable)
│   └── schema/prediction.ts     # + advancePick column (nullable)
├── services/                    # legacy mirrors (match.ts, matchUtils.ts) updated to the same mapping
└── drizzle/0011_*.sql + meta/_journal.json  # NEW migration; sequential `when`

apps/web/src/
├── components/prediction/ScoreInput.tsx   # advance radio for knockout matches; show penaltyBonus in breakdown
├── routes/pools/$poolId/predictions.tsx   # pass knockout flag, persist advancePick
└── features/competitions/ (result display) # show "1–1 (5–4 pens, X advances)"
```

**Structure Decision**: Existing hexagonal monorepo. Domain-first: scale and bonus rules in `domain/scoring`, knockout result in `domain/match`, both pure. Application widens ingestion + upsert; infrastructure widens the provider adapter, mappers, and route; web adds the advance pick + result annotation. Single additive migration.

## Complexity Tracking

> No constitution violations — section intentionally empty.
