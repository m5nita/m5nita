# Implementation Plan: View Other Participants' Predictions on Locked Matches

**Branch**: `009-view-others-predictions` | **Date**: 2026-04-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-view-others-predictions/spec.md`

## Summary

Allow any pool member to see, directly on the palpites page, the predictions submitted by other members for a match whose lock time has passed. The view is exposed as an inline accordion that expands the existing locked match row in place — no new screen, no new ornamental UI (no avatars, rank badges, lock icons). A single new API endpoint returns the list of predictions (name, score, points) for one match in one pool, plus the count and names of members who did not predict (surfaced behind a secondary toggle in the UI). Pool scoping reuses the existing membership check used by the current predictions endpoints.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js ≥ 20
**Primary Dependencies**: Hono (API), Drizzle ORM, Better Auth (auth middleware), React 19, TanStack Router, TanStack Query, Tailwind CSS v4
**Storage**: PostgreSQL 16 — reuses existing `prediction`, `pool_member`, `match`, and `user` tables (no schema changes)
**Testing**: Vitest (API integration + unit), existing web component tests
**Target Platform**: Web PWA (apps/web) consuming Hono API (apps/api)
**Project Type**: Monorepo with `apps/api`, `apps/web`, `packages/shared`
**Performance Goals**: List for a typical locked match (≤200 members) MUST render within 2s on 4G (spec SC-005); API response p95 < 200ms (constitution IV); accordion expand interaction < 100ms perceived latency (constitution IV)
**Constraints**: Must not expose any prediction before a match's lock time (spec FR-002 + SC-002). Must strictly scope data to the viewer's pool (spec FR-005). No new ornamental UI; feature must reuse existing visual language (spec FR-003a/b, constitution III)
**Scale/Scope**: One new API endpoint, one new shared type, one UI change (expand affordance + inline accordion body) on the existing predictions page. No database migrations.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Code Quality — PASS

- Reuses existing Drizzle schemas, shared types, and the existing membership check helper used by `GET /api/pools/:poolId/predictions`. No duplication introduced.
- New service function has a single responsibility: "return other members' predictions for a locked match in a pool, plus non-predictor info". Cognitive complexity budget respected.
- No dead code, no inline TODOs.

### II. Testing Standards — PASS

- New endpoint covered by integration tests (pool membership enforcement, lock-time guard, response shape, non-predictors list). Unit tests for the service function covering: match not locked → error; user not a pool member → error; happy path with N predictors + M non-predictors; viewer's own prediction excluded from the returned list; points correctly propagated for finished matches; pending points for matches awaiting scoring.
- Web component test for the accordion: renders rows in the existing visual style; collapses/expands; "N sem palpite" toggle reveals non-predictors list; does not render the viewer's own row.

### III. UX Consistency — PASS (this feature is explicitly a UX-consistency exercise)

- Uses existing design tokens (cream bg, barlow condensed display font, score-box style, `+N pts` meta, muted/green states).
- No new ornamental UI (explicitly ruled out in spec FR-003a).
- Expand/collapse control uses the same meta text style already used by the match row's status line.
- Reuses the current date-centered-above layout; no changes to the unlocked-match row visuals.

### IV. Performance Requirements — PASS

- Single SQL query: `SELECT user_id, home_score, away_score, points FROM prediction JOIN user ON ... JOIN pool_member ON ... WHERE pool_id = ? AND match_id = ?`. Existing indexes cover this: `prediction(matchId)` and unique `prediction(userId, poolId, matchId)`.
- Non-predictor list computed via a single additional query against `pool_member LEFT JOIN prediction` filtered by pool and match.
- Typical payload for 200 members ≤ ~10KB gzipped. No N+1, no full table scan.
- TanStack Query caches the result per `(poolId, matchId)` — accordion expand is effectively instant on subsequent opens.

**Gate result**: All four principles pass. No violations to justify. Complexity Tracking table left empty.

## Project Structure

### Documentation (this feature)

```text
specs/009-view-others-predictions/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── get-match-predictions.md  # Phase 1 output — HTTP contract for the new endpoint
├── checklists/
│   └── requirements.md  # From /speckit.specify
└── mockups.html         # Visual reference
```

### Source Code (repository root)

```text
apps/api/
├── src/
│   ├── routes/
│   │   └── predictions.ts          # + new handler for GET /api/pools/:poolId/matches/:matchId/predictions
│   ├── services/
│   │   └── predictions.ts          # + getMatchPredictions(poolId, matchId, viewerUserId)
│   ├── db/schema/
│   │   ├── prediction.ts           # unchanged
│   │   ├── poolMember.ts           # unchanged
│   │   ├── match.ts                # unchanged
│   │   └── user.ts                 # unchanged
│   └── tests/
│       └── predictions.match.test.ts   # + new integration tests

apps/web/
├── src/
│   ├── components/prediction/
│   │   ├── ScoreInput.tsx              # + render the "Ver palpites do bolão ▾" control + accordion slot
│   │   └── MatchPredictionsList.tsx    # NEW — accordion body (name · score · points), reuses existing styles
│   └── routes/pools/$poolId/
│       └── predictions.tsx             # Wires TanStack Query for the new endpoint, passes handler to ScoreInput

packages/shared/
└── src/types/index.ts                  # + MatchPredictionsResponse type + MatchPredictor entry type
```

**Structure Decision**: Standard monorepo layout already established (apps/api, apps/web, packages/shared). No new packages, no new top-level directories. The accordion body is extracted into its own component (`MatchPredictionsList.tsx`) so `ScoreInput.tsx` stays focused on its current responsibility (score input + match row rendering) while gaining a single new prop to render the inline accordion beneath the row.

## Complexity Tracking

> No constitution violations. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
