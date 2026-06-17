# Predictor Profile & Path to the Top — Implementation Plan

> **For agentic workers:** TDD the two pure domain policies first; the rest is wiring. Steps use checkbox (`- [ ]`) syntax. Commit after each task.

**Goal:** Replace the coaching half of the paid stats panel — single-dimension "Forças por tipo de jogo" → a 4-card "Seu perfil de palpiteiro"; "Jogos que mais importam" → "Caminho até o topo".

**Architecture:** Two new pure domain policies (`PredictorProfilePolicy`, `ClimbPolicy`) under `domain/stats/`, wired through `ParticipantPoolStats.build()`. The profile is computed read-time from one bounded query of the viewer's finished predictions (which also powers "Forma recente", replacing the `recentForm` query). The climb derives from the existing pool aggregate (now carrying member names) + the viewer's soonest pending match. Drops the 4 goal-band snapshot columns and the entire pending-impact ranking.

**Tech Stack:** TypeScript, Hono, Drizzle (Postgres), Vitest; React 19 + TanStack + Tailwind v4.

## Global Constraints (verbatim from spec)

- Rules live in `domain/` (guardrails G2 `pnpm check:leaks`, G3 `pnpm check:arch` run in CI). No inline fee/scoring math; `Score.calculate` for category classification carries `// leak-allow: policy-agnostic category`.
- All monetary values in centavos. Max points per match from `pool.scoringPolicy().maxPoints()` (10 range / 14 single-match / knockout per policy).
- Compare the participant only to the reality of their own matches (profile) and the public standings (climb). Never expose any third-party prediction or any consensus for a not-yet-started match.
- Migration gotcha: after `db:generate`, bump the new migration's `when` in `drizzle/meta/_journal.json` above the previous entry.
- No dead code/columns/types left behind.

## v1 thresholds (domain constants)

`DRAW_MIN_FINISHED=8`, `DRAW_MARGIN=0.10`; `CALIB_MIN_FINISHED=6`, `CALIB_MARGIN=0.4`, `SIGNATURE_MIN_SHARE=0.25`; goal-type `MIN_SAMPLES=3`, `MARGIN=0.15` (reuse existing). Near-miss: `Manhattan==1 && !exact`, points `= Σ(maxPoints − pointsEarned)`, shown when count ≥ 1.

## File structure

**Create**
- `apps/api/src/domain/stats/PredictorProfilePolicy.ts` — pure; 4 cards from the viewer's finished-prediction facts.
- `apps/api/src/domain/stats/PredictorProfilePolicy.test.ts`
- `apps/api/src/domain/stats/ClimbPolicy.ts` — pure; position/gap/chaser/nextMatch.
- `apps/api/src/domain/stats/ClimbPolicy.test.ts`
- `apps/web/src/components/pool/stats/PredictorProfile.tsx` — 4 Treinador cards.
- `apps/web/src/components/pool/stats/ClimbCard.tsx` — cream hero + next match.
- `apps/api/drizzle/0012_*.sql` — drop the 4 goal-band columns (generated).

**Modify**
- `domain/stats/StatsRepository.port.ts` — `ParticipantStatsRow` loses goal-band fields; add `ProfileFactRow` (+points); replace `recentForm()` with `viewerFinishedPredictions()`; `PoolStatsAggregateRow` gains `displayName: string | null`; remove `FormSampleRow`.
- `domain/stats/ParticipantPoolStats.ts` — `StatsBlocks` swaps `strengths` → `profile` + `climb`; `BuildInput` swaps `recentForm` → `profileFacts: ProfileFactRow[]` and adds `pendingMatches: PendingMatchInput[]`; wire the two policies; recentForm derived from `profileFacts`; delete `buildStrengths`/`DimensionStat`/`StrengthsBlock`.
- `infrastructure/persistence/DrizzleStatsRepository.ts` — `poolAggregate` joins `user.name`; new `viewerFinishedPredictions`; drop goal-band from `participantRow` + `recomputeSnapshot`.
- `application/stats/GetParticipantStatsUseCase.ts` — load `viewerFinishedPredictions` + pending matches; pass to `build`; result drops top-level `pendingImpact`; `EMPTY_ROW` loses goal-band; `TEASER.blocks` updated; remove `PendingMatchImpactPolicy` import/usage.
- `db/schema/participantPoolStats.ts` — remove the 4 goal-band columns.
- `apps/web/src/components/pool/stats/types.ts` — mirror new `StatsBlocks` (`profile`,`climb`; no `strengths`); remove `PendingMatchImpact`; `StatsResponse` drops `pendingImpact`.
- `apps/web/src/components/pool/stats/StatsPanel.tsx` — render `PredictorProfile` + `ClimbCard`; remove `DimensionRow`/`BETTER_AT_LABEL`/`PendingImpactSection`; props drop `pendingImpact`.
- `apps/web/src/routes/pools/$poolId/stats.tsx` — drop `pendingImpact` prop to `StatsPanel`.

**Delete**
- `domain/stats/PendingMatchImpactPolicy.ts` + `.test.ts`
- `apps/web/src/components/pool/stats/PendingImpactSection.tsx`
- rename integration `stats-pending-impact.test.ts` → `stats-climb.test.ts`

## Domain contracts

```ts
// StatsRepository.port.ts
export type ProfileFactRow = { predHome: number; predAway: number; actualHome: number; actualAway: number; points: number }
// PoolStatsAggregateRow gains: displayName: string | null
// ParticipantStatsRow loses: lowGoalsCorrect/Total, highGoalsCorrect/Total
// StatsRepository: replace recentForm(...) with
//   viewerFinishedPredictions(poolId, userId): Promise<ProfileFactRow[]>  // most-recent-first, ALL finished

// PredictorProfilePolicy.ts
export type PredictorProfileBlock = {
  drawBlindness: { yourRate: number; realRate: number; yourCount: number; realCount: number } | null
  nearMiss: { count: number; points: number } | null
  goalCalibration: { yourAvg: number; realAvg: number; lean: 'inflate'|'economize'|'calibrated'; signature: { home: number; away: number; sharePct: number } | null } | null
  goalType: { low: DimensionStat; high: DimensionStat; betterAt: 'low'|'high'|null } | null
  state: 'ok' | 'insufficient_data'
}
export const PredictorProfilePolicy = { build(facts: ProfileFactRow[], maxPoints: number): PredictorProfileBlock }
// DimensionStat = { correct; total; pct } stays (move here or keep in ParticipantPoolStats)

// ClimbPolicy.ts
export type ClimbNextMatch = { matchId: string; homeTeam: string; awayTeam: string; kickoff: string; hasPrediction: boolean; action: 'submit'|'change' }
export type ClimbBlock = {
  position: number | null; memberCount: number; leads: boolean
  nextUp: { name: string | null; gap: number; exactsToClose: number } | null
  chaser: { name: string | null; gap: number; close: boolean } | null
  nextMatch: ClimbNextMatch | null
  state: 'ok' | 'insufficient_data'
}
export const ClimbPolicy = { build(input: { aggregate: PoolStatsAggregateRow[]; viewerUserId: string; maxPoints: number; pendingMatches: PendingMatchInput[] }): ClimbBlock }
// PendingMatchInput = { matchId; homeTeam; awayTeam; matchDate: Date; hasPrediction } (move out of the deleted policy into ClimbPolicy or port)
```

## Tasks

- **Task 1 — `PredictorProfilePolicy`** (TDD). Tests: draw blindness shown/hidden by gate & direction; near-miss count+points incl. result-wrong off-by-one (points=max−earned); calibration lean inflate/economize/calibrated; signature mode + share gate; goal-type low/high accuracy + betterAt; empty facts → all null + `insufficient_data`. Then implement. Commit.
- **Task 2 — `ClimbPolicy`** (TDD). Tests: mid-pack gap+exactsToClose (ceil), chaser close flag; leader → `leads`, nextUp null; last → chaser null; unranked (viewer not in aggregate / no finishes) → `insufficient_data`; nextMatch = earliest pending, action submit/change; no pending → nextMatch null; name passthrough incl. null. Then implement. Commit.
- **Task 3 — Port + `ParticipantPoolStats`**. Update port types; swap StatsBlocks/BuildInput; wire policies; recentForm from `profileFacts` (latest 10); delete strengths. Update `ParticipantPoolStats.test.ts` (drop strengths, assert profile/climb wiring & recentForm-from-facts). Run unit. Commit.
- **Task 4 — `DrizzleStatsRepository`**. `poolAggregate` + `user.name` (join user, group by name); add `viewerFinishedPredictions`; drop goal-band from `participantRow` + `recomputeSnapshot`. Commit.
- **Task 5 — Schema + migration**. Remove 4 columns from schema; `pnpm --filter @m5nita/api db:generate`; verify `0012` drops exactly those columns; bump `_journal.json` `when`. Commit.
- **Task 6 — Use case**. Load `viewerFinishedPredictions` + pending matches (reuse `matchRepo.findPendingFor` + `predictionRepo.findByUserPool`); pass `profileFacts`+`pendingMatches` to `build`; return `{ unlocked, blocks }` (drop `pendingImpact`); fix `EMPTY_ROW`, `TEASER.blocks`; remove `PendingMatchImpactPolicy`. Delete policy + its unit test. Commit.
- **Task 7 — Frontend types + components**. Update `types.ts`; build `PredictorProfile.tsx` + `ClimbCard.tsx` (match mockup: dot/title/verdict/figure/chip/tip; cream hero); rewire `StatsPanel.tsx` + `stats.tsx`; delete `PendingImpactSection.tsx`. Commit.
- **Task 8 — Integration + checks**. Update `stats-blocks.test.ts` (strengths→profile); rename `stats-pending-impact`→`stats-climb` and assert climb. Run `pnpm test`, `pnpm biome check`, `pnpm check:leaks`, `pnpm check:arch`; fix; commit.

## Self-review

- Spec coverage: FR-001..007 → Tasks 1,3,7; FR-008..013 → Tasks 2,3,6,7; FR-014..017 → Tasks 3,4,5,6; FR-018/019 → preserved (profile reads only viewer facts; climb reads aggregate+pending; no third-party prediction touched). SC-001..006 → covered by unit+integration in Tasks 1,2,3,8.
- Type consistency: `ProfileFactRow`, `PredictorProfileBlock`, `ClimbBlock`, `PendingMatchInput` names used identically across port/policies/use case/frontend.
- No placeholders: thresholds and contracts are concrete above.
