# Phase 0 Research: statistics availability by pool scope

No `NEEDS CLARIFICATION` markers survived the spec. This records the decisions and
what was rejected.

## Production baseline (measured, 2026-07-29)

| Fact | Value |
|---|---|
| Pools: whole-competition / matchday-range / single-fixture | 3 / 21 / 5 |
| `stats_unlock` records total | 6 |
| …of those, on matchday-range pools | **2** |

**Consequence**: the change hides the tab on 26 of 29 pools, and exactly 2
viewer/pool pairs need the grandfather exception. That number is small enough that
a refund was on the table — and cheap enough that keeping access is strictly
better for everyone.

## Decision 1 — Keep access for people who already paid, rather than refund

**Decision**: `statsAvailable = scope supports statistics **or** this viewer
already holds an unlock`.

**Rationale**: it costs one boolean and removes the entire problem class — no Pix
refunds to execute by hand, no complaint from someone who lost a paid feature, no
data migration. Expressed as a general rule (not a list of two ids), it also
covers any unlock bought between now and deploy.

**Alternatives rejected**:
- *Hide for everyone + refund the two*: a clean rule, but it means manual money
  movement and a worse outcome for the two buyers.
- *Hide for everyone, no refund*: simplest code, takes away something paid for.

## Decision 2 — The rule lives on `PoolScope`, not in the interface

**Decision**: `PoolScope.supportsParticipantStats()`, with `Pool` delegating.

**Rationale**: the repository already has a guardrail (`check:leaks`, G2) whose
job is to stop scope-branching from leaking outside the domain, and `CLAUDE.md`
states the front never re-derives pool rules. Today `PoolHub` decides with
`pool.matchId != null` — a leak this change removes rather than extends. Putting
the predicate on the value object means adding a fourth scope kind later touches
one method.

**Alternative rejected**: a `StatsAvailabilityPolicy` module. For a one-line
predicate over an existing value object, it adds a hop and a file without adding
meaning.

## Decision 3 — Per-viewer flag on pool detail, not a separate endpoint

**Decision**: `getPoolById` returns `statsAvailable`, resolved for the requesting
user, inside the payload the pool hub already fetches.

**Rationale**: the hub loads pool detail on every pool screen, so the flag arrives
with data already in flight — no extra round trip, and the unlock lookup joins the
existing `Promise.all`. A dedicated "can I see stats?" endpoint would add a
request to the hot path to answer one boolean.

**Note on caching**: pool detail is not self-polled (see the comment in
`PoolHub`), and TanStack refetches on focus, so a just-granted unlock appears on
the next load without special handling.

## Decision 4 — Enforce server-side too, with a distinct error code

**Decision**: `GetParticipantStatsUseCase` refuses when the scope does not support
statistics **and** the viewer holds no unlock; `UnlockStatsUseCase` refuses to
create a checkout for such a pool. New `StatsError` code `SCOPE_UNSUPPORTED`,
mapped to `404`.

**Rationale**: a hidden tab is a UI convenience, not access control — the
endpoints are reachable directly. `404` (rather than `403`) matches the existing
`NOT_FOUND`/`NOT_MEMBER` mapping and reads correctly: for this pool, that resource
does not exist.

**Ordering detail**: in `UnlockStatsUseCase`, the pre-existing
`ALREADY_UNLOCKED` check stays first, so a grandfathered holder who somehow
re-posts still gets the accurate answer. Either order refuses the purchase; this
one changes less.

## Decision 5 — Leave stored snapshots alone

**Decision**: no cleanup of `participant_pool_stats` rows belonging to shorter
pools.

**Rationale**: those rows are written on demand when someone opens the panel, not
by a scheduled job. With the tab gone, nothing writes or reads them again — so
deletion would be churn with a migration attached and no benefit.
