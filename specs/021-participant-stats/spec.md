# Feature Specification: Per-Participant Pool Statistics

**Feature Branch**: `021-participant-stats`
**Created**: 2026-06-03
**Status**: Draft
**Input**: User description: "estatísticas por participante, por bolão — produto pago simbólico que compara o desempenho do participante com o resto do bolão e ajuda a fechar palpites pendentes"

## Problem

Today a participant can see the pool leaderboard and their own predictions, but has no read on their **relative performance**: where they gain or lose points, how they have evolved in the race, how many points they left on the table, or which upcoming match most affects their prize chances. There is also no nudge toward the upcoming matches that most affect that race — matches where the participant could still **submit a prediction or change an existing one before kickoff** — and any such nudge must avoid a "herd effect" that would leak how others predicted.

This feature adds a **Statistics** section inside a pool, unlocked by a **single symbolic payment per pool** (default R$1,99, configurable). It is a 100%-platform-revenue product that **does not touch prize money**. The content is a heavy read-side aggregation, so it MUST be computed and cached (never recomputed per request) and MUST stay off the hot live-polling path.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Unlock statistics for a pool (Priority: P1)

A pool member who has not yet paid opens the Statistics section and sees a teaser (a sample of what the panel offers) plus a clear price. They choose to unlock, pay the symbolic one-time amount (Pix preferred), and once payment is confirmed the section unlocks **for that pool forever** — no subscription, no per-round charge. The unlock is tied to the `(participant, pool)` pair only.

**Why this priority**: Monetization and the server-side access gate are the foundation of the whole feature. Without a reliable, idempotent unlock there is no paid product and no protected content to show.

**Independent Test**: A member opens the Statistics section (sees teaser + price), completes a single payment, and after confirmation the same section shows the full panel; reopening it later — even after leaving and rejoining the app — never asks for payment again.

**Acceptance Scenarios**:

1. **Given** a pool member who has not unlocked statistics, **When** they open the Statistics section, **Then** the system shows only a teaser plus the unlock price and does not reveal any computed statistics.
2. **Given** that member, **When** they choose to unlock and complete the payment, **Then** the section becomes permanently unlocked for that member in that pool.
3. **Given** a member who already unlocked statistics for a pool, **When** they open the section again at any later time, **Then** the full panel is shown without any new charge.
4. **Given** a payment confirmation that is delivered more than once (duplicate webhook/retry), **When** it is processed, **Then** the member is charged at most once and exactly one entitlement exists for that `(participant, pool)`.
5. **Given** a non-member of the pool, **When** they attempt to access the statistics for that pool, **Then** access is denied regardless of any payment state.

---

### User Story 2 - See my performance versus the rest of the pool (Priority: P1)

An unlocked participant opens the Statistics panel and sees, **for that pool only**, four blocks comparing their performance to the pool average and to the leader: (a) hit rates versus the average, (b) their ranking evolution, (c) their strengths and weaknesses, and (d) points left on the table with an efficiency comparison. All comparisons use aggregated/anonymized pool figures — never another individual's prediction.

**Why this priority**: This is the core value the participant pays for. It is the reason the product exists and must work as soon as the unlock does.

**Independent Test**: With a pool that has finished matches and at least one unlocked participant, open the panel and confirm all four blocks render with the participant's own numbers next to the pool average and the leader, and that no individual third-party prediction is exposed anywhere.

**Acceptance Scenarios**:

1. **Given** an unlocked participant in a pool with finished matches, **When** they open the panel, **Then** Block A shows their exact-score % and result-hit % side by side with the pool average and the leader.
2. **Given** the same participant, **When** they view Block B, **Then** they see their points and ranking position per finished round, the gap to the leader, and a trend indicator (rising / falling / stable).
3. **Given** the same participant, **When** they view Block C, **Then** they see where they gain or lose points across the available dimensions (home/away accuracy and goal-volume bands).
4. **Given** the same participant, **When** they view Block D, **Then** they see total points left on the table (max possible minus earned over finished matches), their efficiency, and how it compares to rivals using already-computed standings totals.
5. **Given** a pool with too few finished matches to compute a meaningful comparison, **When** the participant opens the panel, **Then** each block degrades gracefully to a clear "not enough data yet" state instead of misleading numbers.

---

### User Story 3 - Act on the upcoming matches that matter most (Priority: P2)

An unlocked participant sees, among **all their own not-yet-started matches in the pool — whether or not they have already predicted them** — which ones most move their ranking / prize chances, ordered by impact, optionally surfaced as prioritized reminders tied to each match's kickoff deadline. For a match without a prediction the call to action is to submit one; for a match that already has a prediction (still editable until kickoff) the call to action is to review or change it. The participant is never shown any other member's prediction or any pool consensus for a not-yet-started match.

**Why this priority**: Turning insight into action — submitting or changing the highest-leverage predictions before kickoff — is a major retention and value driver, but it depends on the panel from Story 2 existing first.

**Independent Test**: With a pool that has not-yet-started matches for the participant (some already predicted, some not), open the panel and confirm all of them are ranked by impact, that the highest-impact ones are highlighted with their deadlines and a submit-or-change action, and that no third-party prediction or consensus is ever shown for any not-yet-started match.

**Acceptance Scenarios**:

1. **Given** an unlocked participant with several not-yet-started matches (some already predicted, some not), **When** they open the panel, **Then** all of those matches are ranked by an impact score and the highest-impact ones are highlighted.
2. **Given** a highlighted high-impact not-yet-started match, **When** the participant views it, **Then** they see the kickoff deadline and a call to action to submit a prediction (if missing) or to review/change it (if one already exists) before it locks.
3. **Given** a high-impact match the participant has already predicted, **When** they act on the reminder before kickoff, **Then** they can change that prediction (the existing edit-until-kickoff rule applies); after kickoff the match leaves the list.
4. **Given** any not-yet-started match, **When** the participant views impact information, **Then** the system never reveals another member's prediction or any aggregate consensus/percentage for that match.
5. **Given** a participant with no not-yet-started matches remaining, **When** they open this part of the panel, **Then** it shows an "all caught up" state instead of an empty list.

---

### User Story 4 - Get suggestions from my own historical pattern (Priority: P2)

An unlocked participant receives prediction suggestions derived **only from their own past hits** in that pool (e.g., "you hit home wins more often", "you tend to nail low-scoring games"). No data from any other member is used.

**Why this priority**: A personalized, privacy-safe nudge complements the impact ranking and increases the chance the participant submits or improves predictions on upcoming matches, but it is secondary to seeing the core panel and impact.

**Independent Test**: With a participant who has a track record in the pool, open the panel and confirm the suggestions reflect their own historical tendencies and that the explanation references only their own past results.

**Acceptance Scenarios**:

1. **Given** an unlocked participant with finished matches, **When** they view the suggestions, **Then** the tips reflect their own historical tendencies (e.g., home/away accuracy, goal-volume tendencies).
2. **Given** the same participant, **When** they inspect why a tip was given, **Then** the rationale is based solely on their own past hits and never on any other member's data.
3. **Given** a participant with insufficient history to detect a pattern, **When** they view the suggestions, **Then** they see a neutral "not enough history yet" state instead of a fabricated tip.

---

### Edge Cases

- **Payment fails or is abandoned**: no entitlement is granted; the section stays locked and the participant can retry. Money is never moved without a completed payment.
- **Duplicate/retried payment confirmation**: idempotent — at most one charge and exactly one entitlement per `(participant, pool)`.
- **Participant unlocks, then is removed from / leaves the pool**: the entitlement persists, but viewing the panel still requires current pool membership (access is gated on membership + entitlement).
- **Only the viewer has unlocked in the pool**: comparisons still use pool-wide aggregates (average and leader are computed from all members' results, not only unlocked members), so the comparison remains meaningful and anonymized.
- **Pool has no finished matches yet**: all comparison blocks show "not enough data yet"; the impact/reminder block can still rank the participant's not-yet-started matches.
- **Participant already predicted a high-impact upcoming match**: it still appears in the impact list with a "review/change" action and remains changeable until kickoff (existing edit rule); once it kicks off it drops out of the list. Surfacing it never exposes any other member's prediction.
- **Matches are live (in progress)** when the panel is opened: the panel does not recompute live; it shows the last computed values and indicates that statistics update when matches finish.
- **A not-yet-started match is postponed/rescheduled**: it remains in the impact ranking with its updated deadline; no third-party prediction is exposed because it is still not-started.
- **Single-match pool vs multi-match pool**: the max points per match differ (single-match pools score on a different maximum than range pools); "points left on the table" and impact use the correct per-pool maximum so efficiency is never overstated.

## Requirements *(mandatory)*

### Functional Requirements

#### Scope & entitlement

- **FR-001**: Statistics MUST always be scoped to a single pool; the system MUST NOT compute or display any cross-pool statistic.
- **FR-002**: The system MUST gate the statistics content server-side: a request without a valid entitlement MUST return only the teaser and the price, never any computed statistic.
- **FR-003**: Access to a pool's statistics MUST require current membership of that pool in addition to entitlement; non-members MUST be denied regardless of payment state.
- **FR-004**: An unlock MUST be a one-time grant per `(participant, pool)` that persists permanently; there MUST be no subscription and no per-round charge.
- **FR-005**: The unlock price MUST be configurable, defaulting to 199 centavos (R$1,99), expressed in centavos (BRL); the front MUST display the price exactly as provided by the system and MUST NOT compute or derive it.

#### Payment & money safety

- **FR-006**: Unlock MUST reuse the platform's existing payment capability, with Pix preferred for the symbolic amount.
- **FR-007**: Payment confirmation MUST be idempotent: duplicate or retried confirmations MUST result in at most one charge and exactly one entitlement.
- **FR-008**: The unlock amount MUST be 100% platform revenue; it MUST NOT enter any pool's prize, and prize/fee calculation MUST remain unchanged by this feature.
- **FR-009**: Granting an entitlement MUST NOT alter pool membership, pool activation, or any prize-related state.

#### The four panel blocks

- **FR-010**: Block A (Hit rate vs average) MUST show the participant's exact-score % and result-hit % alongside the pool average and the leader's figures, derived from finished matches.
- **FR-011**: Block B (Ranking evolution) MUST show the participant's points and position per finished round, the gap to the leader, and a trend indicator (rising / falling / stable).
- **FR-012**: Block C (Strengths & weaknesses) MUST show where the participant gains or loses points across at least these dimensions: home/away (host) accuracy and goal-volume bands (low- vs high-scoring matches).
- **FR-013**: Block D (Points left on the table) MUST show, over finished matches, the sum of (max possible points − earned points), the participant's efficiency (earned ÷ max possible), and a comparison to rivals using already-computed standings totals.
- **FR-014**: The system MUST reuse the existing scoring already persisted per prediction; it MUST NOT re-derive or recompute scoring to produce statistics.
- **FR-015**: The maximum points per match used in Blocks C/D and in impact MUST reflect the pool's scoring mode (range pools vs single-match pools have different maxima).

#### Help on upcoming matches (submit or change before kickoff)

- **FR-016**: The system MUST rank **all** the participant's own not-yet-started matches in the pool — **whether or not a prediction already exists for them** — by an impact score combining the points at stake in the match and the density of reachable rivals around the participant's current standing.
- **FR-017**: The impact computation MUST be bounded to the participant's own not-yet-started matches and the pool's members (no simulation of all outcome combinations).
- **FR-018**: The system MAY surface high-impact not-yet-started matches as prioritized reminders that include each match's kickoff deadline and indicate whether the action is to submit a new prediction or to review/change an existing one.
- **FR-019**: For a not-yet-started match that already has the participant's prediction, the help MUST present it as changeable (review/change) and MUST NOT prevent editing that is otherwise allowed until kickoff; the feature only surfaces the match — it does not relax or tighten the existing edit-until-kickoff rule.
- **FR-020**: The system MUST provide suggestions derived solely from the participant's own past hits in the pool, with the rationale referencing only the participant's own history.

#### Privacy & anti-herding (prohibitions)

- **FR-021**: The system MUST NOT reveal any third party's prediction for a not-yet-started match (respecting the existing "predictions hidden until kickoff" rule).
- **FR-022**: The system MUST NOT show any pool consensus, percentage, or distribution of predictions for a not-yet-started match (no herd effect).
- **FR-023**: All comparisons to other members MUST be aggregated and anonymized (pool average, leader figures); the system MUST NOT expose any individual member's prediction or per-prediction data.

#### Performance & freshness

- **FR-024**: Statistics MUST be served from precomputed/cached data and MUST NOT be recomputed from raw data on every request.
- **FR-025**: The pool-level aggregate MUST be invalidated/refreshed on the same event that refreshes the leaderboard (when a match finishes), and MUST be shared across all viewers of the pool.
- **FR-026**: The per-participant computed snapshot MUST be refreshed when a match finishes, but only for participants who have unlocked statistics in that pool (a small, bounded set).
- **FR-027**: The statistics section MUST NOT participate in the 30-second live polling used by the leaderboard/matches; during live matches it MUST indicate that statistics update when matches finish, and otherwise refresh on focus / at a long interval.
- **FR-028**: The upcoming-match impact MUST be computed cheaply at read time, limited to the participant's own not-yet-started matches, and MAY use a short-lived per-participant cache.

### Key Entities *(include if feature involves data)*

- **Stats Unlock (entitlement)**: Represents that a given participant has unlocked statistics for a given pool. Unique per `(participant, pool)`. References the payment that granted it and the moment it was unlocked. It is the server-side gate.
- **Participant Pool Stats (snapshot)**: A per-participant, per-pool precomputed summary over finished matches (e.g., exact hits, result hits, finished count, points earned, max possible points, home/away accuracy counts, low/high goal-band accuracy counts). Refreshed when a match finishes, only for unlocked participants. Survives restarts/deploys.
- **Pool Stats Aggregate**: A per-pool, shared summary (per-dimension averages, the leader's figures, and the finished-match base) used as the comparison baseline. Cached and invalidated on the leaderboard-refresh event. Never contains any individual's prediction.
- **Statistics Panel (composed view)**: The unlocked read model returned to the participant — the four blocks plus the upcoming-match impact ranking (each entry flagged as submit-or-change) and own-pattern suggestions, all precomputed/anonymized. The locked variant carries only the teaser and the price.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A participant can unlock a pool's statistics with a single payment and reach the full panel; reopening the section later never prompts for payment again (0 repeat charges).
- **SC-002**: Duplicate payment confirmations result in at most one charge and exactly one entitlement per `(participant, pool)` in 100% of cases.
- **SC-003**: A pool's total prize is identical before and after any number of statistics unlocks (0 cents of difference); unlock revenue never appears in any prize.
- **SC-004**: No third-party prediction for a not-yet-started match, and no per-match consensus/percentage for a not-yet-started match, is ever exposed in the statistics experience (0 leakage events in testing).
- **SC-005**: Opening the unlocked panel returns precomputed results without re-running the heavy aggregation per request, and the section issues no requests on the 30-second live-polling cycle.
- **SC-006**: After a match finishes, the affected participants' statistics and the pool aggregate reflect the new result on the next view (no manual refresh required), while never updating mid-match.
- **SC-007**: A non-member or an unauthenticated request can never retrieve a pool's computed statistics (100% of unauthorized attempts blocked server-side).
- **SC-008**: For an unlocked participant, every applicable panel block renders (or shows a clear "not enough data yet" state) — there are no blank or error states in normal operation.
- **SC-009**: The impact list includes every one of the participant's own not-yet-started matches — both already-predicted and not-yet-predicted — each labeled with a submit-or-change action; no not-yet-started match the participant can still act on is omitted.

## Assumptions

- **Validated product decisions (not to be reopened)**: scope is always per-pool; monetization is a one-time per-`(participant, pool)` unlock at a configurable price (default 199 centavos); unlock revenue is 100% platform and never touches prize; help is limited to (a) impact of the participant's own not-yet-started matches — predicted or not, so they can submit or change before kickoff — and (b) own-history suggestions; revealing third-party predictions for not-started matches and showing per-match consensus for a not-started match are prohibited (respecting the existing hidden-until-kickoff rule).
- **Strength/weakness dimensions for v1**: only dimensions derivable cheaply from existing match data are in scope — home/away (host) accuracy and goal-volume bands. "Favorite vs underdog" and per-team breakdowns are **out of scope for v1** because the match data carries no odds or strength signal and inferring it from pool consensus is both prohibited and unreliable.
- **Comparison baseline**: pool average and leader figures are computed from all members' results (not only unlocked members), so comparisons stay meaningful even when few members have unlocked. Aggregates never expose individual predictions.
- **Entitlement vs membership**: the entitlement is permanent, but viewing requires current pool membership; a removed/left member keeps the entitlement but loses view access until they are a member again.
- **Pricing display**: the price is always provided ready-to-display by the system; the front never computes price, fee, or prize.
- **Locked teaser**: the teaser communicates the value of the four blocks (e.g., obscured/sample visuals and headline labels) without revealing any real computed figure or any third-party data.
- **Editing predictions**: the help only surfaces and links to a not-yet-started match; the actual submit/change goes through the existing predictions flow and its edit-until-kickoff rule. This feature adds no new editing capability and no new lock/unlock behavior.
- **Refund/chargeback handling**: out of scope for v1 beyond the existing platform payment behavior; entitlement is granted only on a completed payment.

## Out of Scope (explicit prohibitions)

- Cross-pool statistics of any kind.
- Revealing any third-party prediction for a not-yet-started match, or any pool consensus / percentage / distribution for a not-yet-started match (no herd effect).
- Subscriptions or per-round charges.
- Any change to prize/fee calculation or routing unlock money into a prize pot.
- The "favorite vs underdog" block and per-team breakdowns (deferred — no odds data / too costly).
- Changing the existing prediction edit-until-kickoff rules (the impact list only links to the existing predictions flow; it adds no new editing surface).
- Putting the statistics section on the 30-second live-polling path.

## Dependencies

- Existing per-prediction scoring (the points already computed and persisted when matches finish) — statistics only aggregate it, never recompute it.
- Existing leaderboard/ranking and its refresh-on-match-finished event — the pool aggregate hooks into the same invalidation point.
- Existing payment capability (gateway + Pix) and its idempotent confirmation handling — unlock reuses it with a distinct payment purpose.
- Existing predictions flow and its edit-until-kickoff behavior — the impact list links into it for submit/change; it does not reimplement editing.
- The existing "predictions hidden until kickoff" rule (spec 009) — the privacy guarantees here depend on and extend it.
