# Feature Specification: Statistics tab only where statistics mean something

**Feature Branch**: `035-stats-scope-gate`
**Created**: 2026-07-29
**Status**: Draft
**Input**: User description: "A aba /stats dentro de um bolão só faz sentido em campeonatos completos e não em bolões de somente rodadas, então podemos remover a visualização"

## Overview

The paid per-participant "Estatísticas" panel was built for a season's worth of
history: accuracy dials, an evolution curve, recent form, a predictor profile.
In a pool that covers one or two rounds — or a single fixture — those charts are
plotted over a handful of matches and say nothing. Offering to sell them there is
worse than not offering them at all.

The tab becomes available only for **whole-competition** pools. One exception is
deliberate: the people who **already paid** for an unlock on a shorter pool keep
their access, so nobody loses something they bought and no refund is needed.

Nothing about how statistics are calculated changes. This removes a surface.

## Clarifications (resolved during brainstorming)

- **Where statistics stay**: whole-competition pools only. Matchday-range pools
  lose the tab; single-fixture pools already hid it and now fall under the same
  rule instead of a separate front-end check.
- **Existing paid unlocks**: **kept working**. Two `stats_unlock` records exist
  today on matchday-range pools; for those two people, in those two pools, the
  tab stays. No refunds, no data migration.
- **No new statistics**: designing a round-appropriate panel is explicitly not
  part of this. The surface is removed, not replaced.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - No statistics offer where statistics are meaningless (Priority: P1)

As a member of a pool that covers only a few rounds, I no longer see an
"Estatísticas" tab offering to sell me a panel built for a full season. As a
member of a whole-competition pool, nothing changes.

**Why this priority**: it is the requested change, and it stops the product from
charging for something that does not work in that context.

**Independent Test**: open a whole-competition pool and a matchday-range pool as
a member; the tab is present in the first and absent in the second, and the
statistics endpoints agree with what the screen shows.

**Acceptance Scenarios**:

1. **Given** a whole-competition pool, **When** a member opens it, **Then** the
   "Estatísticas" tab is present and behaves exactly as before.
2. **Given** a matchday-range pool, **When** a member opens it, **Then** there is
   no "Estatísticas" tab.
3. **Given** a single-fixture pool, **When** a member opens it, **Then** there is
   no "Estatísticas" tab (same rule now covers it).
4. **Given** a member of a matchday-range pool without an unlock, **When** they
   navigate straight to the statistics URL, **Then** they are sent to the
   predictions tab.
5. **Given** the same member, **When** the statistics data is requested directly,
   **Then** the request is refused.
6. **Given** the same member, **When** they try to buy an unlock directly,
   **Then** the request is refused and no charge is created.

---

### User Story 2 - Keep what I already paid for (Priority: P1)

As one of the people who already paid to unlock statistics on a pool that covers
only a few rounds, my access is untouched: the tab is still there and the panel
still loads.

**Why this priority**: it ships with User Story 1 by necessity. Removing paid
access is the one outcome this change must not produce.

**Independent Test**: as a member of a matchday-range pool who holds an unlock,
open the pool and the panel; both work. As another member of the same pool
without an unlock, neither does.

**Acceptance Scenarios**:

1. **Given** a matchday-range pool and a member who already holds an unlock,
   **When** they open the pool, **Then** the tab is present and the panel loads.
2. **Given** that same pool, **When** a different member without an unlock opens
   it, **Then** they see no tab and cannot reach the data.
3. **Given** that same holder, **When** their access is checked, **Then** no
   refund, deletion, or data change was applied to their record.

---

### Edge Cases

- **A member of a whole-competition pool who has not paid**: unchanged — the tab
  shows and the paywall behind it is untouched.
- **An unlock granted while the screen is open on a shorter pool**: the next load
  of the pool reflects the new access; no special handling.
- **A non-member reaching the statistics URL**: unchanged — membership gating
  already applies before this rule.
- **Statistics snapshots already stored for shorter pools**: left in place and
  unread. They are written only when someone opens the panel, so nothing keeps
  computing them.
- **A closed (finished) matchday-range pool**: same rule — no tab, unless the
  viewer holds an unlock.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Whether a pool offers per-participant statistics MUST be decided by
  a single rule owned by the pool's scope concept: **whole-competition only**.
- **FR-002**: A user who already holds an unlock for a pool MUST keep access
  regardless of that pool's scope.
- **FR-003**: Availability MUST be resolved per viewer and delivered ready-made
  with the pool's details. The interface MUST NOT re-derive it from scope fields.
- **FR-004**: The "Estatísticas" tab MUST be hidden whenever statistics are
  unavailable to the viewer.
- **FR-005**: Navigating directly to the statistics URL when it is unavailable
  MUST land the user on the predictions tab instead of an error.
- **FR-006**: A direct request for statistics data MUST be refused when
  statistics are unavailable to that viewer.
- **FR-007**: A request to purchase an unlock MUST be refused for a pool that
  does not offer statistics, and MUST NOT create a charge.
- **FR-008**: No refunds and no data migration. Existing unlock records and
  stored statistics MUST be left untouched.
- **FR-009**: Behaviour for whole-competition pools — including the existing
  paywall, teaser and purchase flow — MUST be unchanged.

### Key Entities *(include if feature involves data)*

No new or changed data. The feature reads two things that already exist: the
pool's scope (whole competition / matchday range / single fixture) and whether the
viewer holds a statistics unlock for that pool.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The "Estatísticas" tab appears only on whole-competition pools,
  plus the pools where the viewer already holds an unlock — 2 such viewer/pool
  pairs exist today.
- **SC-002**: Zero new statistics purchases are created for pools that are not
  whole-competition after this change.
- **SC-003**: All existing unlock records still grant access: nobody who paid
  loses the panel, and no refund is issued.
- **SC-004**: Whole-competition pools show no behavioural difference before and
  after — same tab, same paywall, same panel.
- **SC-005**: The availability rule exists in exactly one place; no interface or
  endpoint decides it from scope fields on its own.

## Assumptions

- Per-participant statistics are computed on demand when the panel is opened, not
  by a scheduled job, so hiding the tab needs no job or cleanup change and no
  stored data becomes stale.
- Membership gating already precedes any statistics access, so this rule composes
  with it rather than replacing it.
- Two viewer/pool pairs hold unlocks on matchday-range pools today (measured in
  production on 2026-07-29). The exception is written as a general rule, not a
  hardcoded list, so it also covers any unlock bought before this ships.

## Out of Scope

- Designing statistics that *would* make sense for a matchday-range or
  single-fixture pool.
- Refunding the existing unlocks on shorter pools (access is kept instead).
- Changing the statistics content, price, paywall copy or teaser for
  whole-competition pools.
- Deleting stored statistics snapshots for shorter pools.
- The global "Meu desempenho" screen, which is free, cross-pool, and unaffected.

## Dependencies

- `021-participant-stats` — the panel, paywall and unlock entitlement.
- `019-single-match-pool` / `006-multi-competition` — the pool scope concept the
  rule is attached to.
