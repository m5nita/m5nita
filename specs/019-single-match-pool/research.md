# Phase 0 — Research

## Unknowns extracted from Technical Context

The Technical Context had no `NEEDS CLARIFICATION` markers; the spec's three clarifications resolved tie-break, cancellation, and minimum-members rules. The remaining open questions are how to model the new scope without scattering null checks across the codebase, and how to source the match-picker data.

---

### Decision 1 — Modeling pool scope

**Decision**: Introduce a value object `PoolScope` in `domain/shared/` as a discriminated union with two variants: `{ kind: 'range', range: MatchdayRange }` and `{ kind: 'single-match', matchId: MatchId }`. The existing `MatchdayRange` VO is reused inside the `range` variant. `Pool.scope: PoolScope` replaces today's `Pool.matchdayRange: MatchdayRange | null`. Two helper methods on `PoolScope` — `contains(match: { matchday, id }): boolean` and `matchIdsHint(): string[] | null` — are the only ways downstream code asks "does this match belong to this pool's scope?".

**Rationale**: Today, `null` matchdayRange means "all matches of the competition". Adding a separate `matchId` column would mean every consumer (predictions filter, reminder job, ranking freeze, scoring trigger) acquires a second null check and a second branch. A discriminated VO collapses both branches behind one polymorphic check (`scope.contains(match)`), enforces mutual exclusivity at construction time, and respects Principle V (logic inside domain, not scattered in adapters).

**Alternatives considered**:
- **Two independent nullable fields on `Pool`** (`matchdayRange` and `singleMatchId`): rejected — invariant ("exactly one of the two") would only be enforced at construction and easy to break in mappers; consumers would need defensive null checks everywhere.
- **Inheritance — `RangePool` and `SingleMatchPool` subclasses**: rejected — over-engineering for two variants; storage is a single table, and the entity boundary stays clearer without subclasses (Principle I, brevity tradeoff).
- **Keep `matchdayRange` + add optional `singleMatchId` on `Pool`, hide behind getter**: rejected for the same reason as the first alternative, plus the getter would still need to encode the invariant.

---

### Decision 2 — Database representation

**Decision**: Add a nullable `match_id uuid` column to the `pool` table with FK to `match.id` and an index on `match_id`. Enforce mutual exclusivity with a single Postgres `CHECK` constraint: `(match_id IS NULL) <> (matchday_from IS NULL AND matchday_to IS NULL) = FALSE` written as `CHECK ( (match_id IS NOT NULL)::int + ((matchday_from IS NOT NULL) OR (matchday_to IS NOT NULL))::int <= 1 )`. A pool with all three fields null remains valid and means "whole competition" (existing semantics).

**Rationale**: A single column matches the conceptual "single match" addition without restructuring existing range columns. The CHECK constraint guarantees the invariant survives any code path (manual SQL, future bulk imports, future admin tooling), satisfying Principle II ("invariants in the database, not just the application"). FK to `match.id` keeps referential integrity; index supports the match-picker reverse lookup ("which single-match pools exist for match X").

**Alternatives considered**:
- **Replace `matchday_from`/`matchday_to` with a single `scope jsonb` column**: rejected — would force a destructive migration for existing rows, lose typed FK to match, and reduce queryability (FRs like reminders join on `match` rows).
- **Separate `pool_single_match` table 1-1 with `pool`**: rejected — adds a join to every pool read for no expressive gain; the column-plus-CHECK approach gives the same invariant with less mechanical cost.

---

### Decision 3 — Data source for the match picker

**Decision**: Reuse the existing match query path. Add a single read-only endpoint `GET /api/competitions/:competitionId/upcoming-matches` that returns matches where `kickoff_at > now()` and `status IN ('SCHEDULED','TIMED','POSTPONED')`, ordered by `kickoff_at ASC`, with fields `{ id, homeTeam, awayTeam, kickoffAt, matchday, stage }`. The existing `match` index on `(competition_id, matchday)` plus a (new) partial index on `(competition_id, kickoff_at) WHERE kickoff_at > now()` is overkill — the regular composite index is sufficient for the volumes involved (≤ 380 fixtures per league season).

**Rationale**: Matches are already projected from the external sync; no new sync work is required (per Assumptions in spec.md). One endpoint keeps the contract small and lets the frontend group client-side, which is trivial for ≤ 400 items and avoids growing a "scope-aware" parameter on a server-side group endpoint.

**Alternatives considered**:
- **Server-side grouping into matchday/stage buckets**: rejected — adds shape coupling to a UI concern; client grouping is O(n) on tiny n.
- **Extending an existing `/matches` endpoint with filters**: deferred — only if a similar listing endpoint already exists with overlapping needs; otherwise a small purpose-built endpoint is clearer (Principle I, intention-revealing naming).

---

### Decision 4 — Validating "match has not kicked off" at creation

**Decision**: The `CreatePoolUseCase` queries the `Match` repository for the candidate `matchId` and rejects creation with a typed `PoolError('MATCH_UNAVAILABLE', …)` if (a) the match is not found, (b) its `competitionId` does not match the input `competitionId`, or (c) its kickoff time is in the past relative to `Clock.now()`. The existing `Clock` port is injected; tests fake it.

**Rationale**: Centralising the rule in the use case keeps the domain pure (no clock in `Pool`), reuses the same kickoff-lock primitive that predictions already follow, and produces a typed domain error that maps cleanly to a 400/409 in the route layer (Principle V error mapping).

**Alternatives considered**:
- **Enforce in a DB CHECK against `match.kickoff_at`**: rejected — Postgres CHECK constraints cannot reference other tables; would require a trigger, which is heavier and harder to test.
- **Trust the client and only filter the picker**: rejected — race condition where a fixture kicks off between picker render and submission would slip past.

---

### Decision 5 — Reusing existing cancellation, refund, and minimum-members behavior

**Decision**: All three behaviors (kickoff close, refund on annulled match, minimum members) are inherited unchanged by passing through the same paths used by multi-match pools. The implementation work is **plumbing only**: `scope.contains(match)` must answer "yes" for the single chosen match and "no" otherwise, after which existing jobs (`closePoolsJob`, refund flow, reminder job) behave correctly without further branching.

**Rationale**: The clarification session explicitly said: same behavior as multi-match pools, no special-case logic. The VO from Decision 1 is precisely the seam that lets us do nothing special at the consumer sites.

**Alternatives considered**:
- **Hardcode per-job branches for single-match scope**: rejected — violates the clarification's "no special-case logic" directive and Principle I's no-duplication rule.

---

### Decision 6 — Frontend scope selection UX

**Decision**: A two-option toggle ("Whole round/range" / "One match") at the top of the pool-create form. Choosing "One match" hides the matchday-range inputs and reveals an `UpcomingMatchPicker` component. The picker fetches the new endpoint, groups items by `matchday` (when `matchday !== null`, league) or by `stage` (otherwise, cup), and renders each option with home/away crests, kickoff time in the user's locale, and the round/phase label. The pool-create submit button is disabled until either a valid range or a valid `matchId` is selected.

**Rationale**: A binary toggle is the smallest disruption to the existing form. Grouping client-side by the field that's present (`matchday` vs `stage`) handles both competition types without a per-type branch in the API. The disabled-submit gate enforces FR-002 at the UI boundary in addition to the server validation.

**Alternatives considered**:
- **Auto-detect scope when the user picks any single match (no toggle)**: rejected — hides the choice; some users want to start by typing a range and then change their mind, others want to start from a match. Explicit toggle is more discoverable and matches FR-001's wording.

---

## Open follow-ups for `/speckit.tasks`

None — all NEEDS CLARIFICATION resolved or deferred to plan-level decisions made above.
