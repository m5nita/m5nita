# Research: View Other Participants' Predictions on Locked Matches

**Feature**: 009-view-others-predictions
**Phase**: 0 — Outline & Research
**Date**: 2026-04-11

Technical Context has no `NEEDS CLARIFICATION` markers — the tech stack, storage, and testing approach are fully inherited from existing features. This document captures the small number of design decisions that still benefit from an explicit record before implementation.

---

## Decision 1: Endpoint shape — single payload vs. two calls

**Decision**: Return predictors AND non-predictors in a single response payload from one endpoint.

**Rationale**:
- Pool size is bounded (≤ 200 per the spec's SC-005). Even the pathological case of 200 members with short display names serializes to ~8–10KB gzipped, well under the 200ms p95 budget over the existing API pipeline.
- One network round-trip keeps the accordion expand interaction feeling instant (<100ms perceived) on the second open, because TanStack Query caches the full response by `(poolId, matchId)`.
- Splitting the non-predictors behind a separate `?includeNonPredictors=true` call adds a second loading state and a second cache entry for no measurable benefit, and risks a UI flicker when the user opens the "5 sem palpite" toggle.
- The response can still be streamed progressively on the UI side: render predictors immediately, show the non-predictors only when the toggle is opened — no extra request needed.

**Alternatives considered**:
- **Two endpoints** (`/predictions` and `/non-predictors`): rejected — doubles the round-trips, adds complexity for zero performance gain at this scale.
- **Query flag** (`?includeNonPredictors=true`): rejected — creates two cache entries, requires the UI to choose between them, and users who toggle the non-predictors list must wait for a second fetch.

---

## Decision 2: Lock-time source of truth

**Decision**: A match is considered "locked" when `new Date(match.matchDate) <= new Date()` OR `match.status IN ('live', 'finished')`. This is the same check already performed by `ScoreInput.tsx` on the web and must be mirrored by the API endpoint as a guard.

**Rationale**:
- Reusing the exact same predicate guarantees UI and API cannot disagree on whether a match is revealable. The UI shows the expand control whenever that predicate is true; the API returns 403/409 otherwise.
- `status` alone is insufficient: the `status` column is maintained by an external feed/job and can lag behind the real kickoff time. `matchDate <= now()` is the authoritative lower bound.
- No new schema field is needed; no new column, no new index.

**Alternatives considered**:
- **Relying only on `status`**: rejected — status updates are asynchronous and would let predictions leak for up to a few seconds after kickoff if the feed is slow (FR-002, SC-002 violation).
- **Introducing a dedicated `lockedAt` column**: rejected — redundant with `matchDate`, and would require a migration for zero functional benefit.

---

## Decision 3: Points column semantics for pending scoring

**Decision**: The API returns `points: number | null` per predictor. `null` means "match finished but scoring pipeline hasn't run yet"; the UI renders it as "aguardando" (or equivalent muted label). A non-null value (including `0`) is a final scored result.

**Rationale**:
- Matches the existing `prediction.points` nullable column semantics — no new state to invent.
- The UI can distinguish "zero points, final" from "not scored yet" without an extra field.
- Consistent with the existing pattern used by `ScoreInput.tsx`, which reads `points` from the shared `Prediction` type and renders `+{points} pts` only when non-null.

**Alternatives considered**:
- **Adding a `scoringStatus` enum**: rejected — overengineered for a single edge case already representable with `null`.
- **Hiding the row entirely until scored**: rejected — users expect to see all predictors immediately at lock time; waiting for scoring would delay the core value (SC-001).

---

## Decision 4: Authorization — reuse existing membership check

**Decision**: Reuse the existing `pool_member` lookup pattern used by `getUserPredictions()` and `upsertPrediction()`. The new service function performs the same `and(eq(poolMember.poolId, poolId), eq(poolMember.userId, viewerUserId))` check before querying predictions, and throws `PredictionError('NOT_MEMBER', ...)` on failure.

**Rationale**:
- Consistency with existing endpoints (constitution I & III).
- No new middleware to maintain; no new auth surface to audit.
- The existing `PredictionError` taxonomy already covers the failure modes needed (`NOT_MEMBER`, plus a new `MATCH_NOT_LOCKED` to add).

**Alternatives considered**:
- **Route-level middleware for pool access**: rejected — the codebase intentionally performs this check in the service layer so tests can exercise it without spinning up the Hono app. Changing the pattern for one endpoint would fragment the convention.

---

## Decision 5: Naming convention for the endpoint

**Decision**: `GET /api/pools/:poolId/matches/:matchId/predictions`.

**Rationale**:
- Mirrors the hierarchy already expressed in the existing routes: `/api/pools/:poolId/predictions` (current user, all matches) and `/api/pools/:poolId/predictions/:matchId` (PUT upsert for current user, one match). The new "all participants for one match" endpoint fits naturally as a more specific resource under `/matches/:matchId/predictions`.
- Distinct from `/predictions/:matchId` (which is the PUT upsert for the viewer), avoiding any REST verb/path ambiguity.
- Plural `predictions` reflects the many-rows response.

**Alternatives considered**:
- **`/api/pools/:poolId/predictions/:matchId/all`**: rejected — `/all` is a non-standard suffix and collides conceptually with the existing PUT route.
- **`/api/pools/:poolId/predictions?matchId=...&scope=all`**: rejected — hides the resource structure behind a query flag, harder to cache and test.

---

## Summary

No unresolved unknowns remain. Phase 1 (data model, contract, quickstart) can proceed.
