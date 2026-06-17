# Feature Specification: Predictor Profile & Path to the Top (Stats coaching redesign)

**Feature Branch**: `026-stats-predictor-profile`
**Created**: 2026-06-16
**Status**: Draft
**Input**: User description: "Quero melhorar essa tela de stats com estatísticas que realmente ajudem os usuários. Não estou vendo diferencial no 'Jogos que mais importam'; talvez focar em 'Forças por tipo de jogo' com mais dicas ao usuário."

> **Update (post-implementation review):** the "Caminho até o topo" / climb
> section (User Story 2 below) was **dropped** — its inverted-hero layout
> duplicated the existing RankingHero at the top of the panel, adding no new
> read. The shipped redesign is the **predictor profile** (User Story 1). The
> single next-match nudge can be re-added elsewhere later if wanted.

## Problem

The paid statistics panel (spec 021) is today ~80% **scoreboard** (where you stand: ranking, hit rate, efficiency, distribution, evolution, recent form) and ~20% **coach** (why, and what to do). The value a participant pays R$1,99 for lives in the coach half — and that half underperforms:

- **"Forças por tipo de jogo"** carries a single dimension (low- vs high-scoring games). It is the only section that tells the participant something about *themselves*, but one dimension is too thin to feel like insight.
- **"Jogos que mais importam"** *looks* like coaching but is a reordered to-do list. In a pool every match matters and the participant will predict them all anyway, so ranking them by a "reachable-rival density" score changes no behavior — it reads as filler. (Confirmed by the product owner: "não estou vendo diferencial.")

This feature redesigns the **coach half** of the panel into two sections that turn the participant's own prediction history into self-knowledge plus one actionable tip each, and reframes the race into a concrete next step. It changes nothing about the scoreboard half, the unlock/entitlement, payments, or prize money.

Two product principles drive the design:

1. **Compare the participant to the reality of their own matches, not to other members.** "You bet draws 4% of the time; 25% of your games ended drawn" is more actionable, cheaper to compute, and exposes no one's predictions. Pool-relative comparison stays only where it already lives (the scoreboard half).
2. **Lead with one number and one tip.** Each insight is glanceable: a signal, a verdict, a figure, a single piece of advice.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — See my predictor profile (Priority: P1)

An unlocked participant opens the panel and sees **"Seu perfil de palpiteiro"**: a small set of cards, each revealing one pattern in how they predict, compared to what actually happened in their own games, with a plain-language verdict and one actionable tip. The cards cover: their blindness to draws, how often they were one goal from an exact score (and the points that would add), whether they inflate scorelines and lean on one signature scoreline, and whether they are sharper in low- or high-scoring games. No other member's data is ever used.

**Why this priority**: This is the redesign's core value and the reason the participant pays. It replaces the thin single-dimension "Forças por tipo de jogo."

**Independent Test**: With a participant who has enough finished predictions in a pool, open the panel and confirm each qualifying card renders with its own figure, a verdict, and a tip; that figures reconcile against the participant's raw predictions vs. the actual results of those same matches; and that no third-party data appears anywhere.

**Acceptance Scenarios**:

1. **Given** a participant who rarely predicts draws while many of their games ended drawn, **When** they open the profile, **Then** the **Empate cego** card shows their draw-prediction rate next to the real draw rate of their games and a tip to risk a draw in even matches.
2. **Given** a participant with finished predictions that were one goal away from the exact score, **When** they open the profile, **Then** the **Quase lá** card shows how many such games there were and the total points an exact score would have added.
3. **Given** a participant whose predicted scorelines average more goals than reality and who repeats one scoreline often, **When** they open the profile, **Then** the **Gols inflados / placar manjado** card shows their average predicted goals vs. the real average and their most-used scoreline with its share, plus a tip to lower and vary.
4. **Given** a participant who is clearly sharper in low- or in high-scoring games, **When** they open the profile, **Then** the **Truncado vs aberto** card shows their accuracy in each band and a tip naming the weaker band.
5. **Given** any card whose minimum sample/margin is not met, **When** the participant opens the profile, **Then** that card is omitted (not shown empty); **and** when no card qualifies, the whole profile shows a single "jogue mais alguns palpites" state.

---

### User Story 2 — See my path to the top (Priority: P1)

An unlocked participant sees **"Caminho até o topo"** in place of "Jogos que mais importam": one concrete, motivating read of the race — how many points (and how many exact scores) separate them from the rank immediately above, who is right behind them, and the single next match they can still act on, with a call to action into the existing predictions flow. It never reveals any other member's prediction for a not-yet-started match.

**Why this priority**: It replaces the section the product owner found valueless with a sharper, action-oriented one of equal placement.

**Independent Test**: With a pool that has standings and at least one not-yet-started match for the participant, open the panel and confirm the gap to the rank above is shown in points and whole exact-scores, the immediate chaser and their gap are shown, and exactly one next actionable match appears with a submit-or-change CTA — and that no third-party prediction is exposed.

**Acceptance Scenarios**:

1. **Given** a participant ranked below first, **When** they open the climb, **Then** they see the points gap to the rank immediately above and that gap expressed as whole exact-scores ("a 1 placar exato"), using the pool's max points per match.
2. **Given** a member ranked one place below the participant, **When** they open the climb, **Then** the immediate chaser and the points gap behind are shown, flagged when within one match's points ("colado").
3. **Given** the participant has not-yet-started matches in the pool, **When** they open the climb, **Then** exactly one — the soonest they can still act on — is surfaced with its kickoff/deadline and a submit (no prediction yet) or change (prediction exists) action that links into the existing predictions flow.
4. **Given** the participant currently leads the pool, **When** they open the climb, **Then** it shows a "você lidera — segure a ponta" state instead of a gap.
5. **Given** the participant has no not-yet-started matches remaining, **When** they open the climb, **Then** only the standings read is shown (no empty next-match card).
6. **Given** any not-yet-started match, **When** the participant views the climb, **Then** no other member's prediction and no pool consensus for that match is revealed.

---

### Edge Cases

- **Too few finished predictions**: each profile card has its own minimum; below it the card is omitted, and below the block minimum the whole profile shows the "not enough data yet" state. The climb still renders from standings.
- **Well-calibrated predictor** (no goal inflation): the calibration card shows a neutral/positive note rather than a red warning, or is omitted if there is nothing to advise.
- **Participant over-predicts draws** (rare): the draw card is omitted in v1 (the blind-spot framing only fits under-prediction); no misleading "good job" is shown.
- **No signature scoreline** (predictions are well spread): the signature chip is omitted; the inflation figure may still show.
- **Participant leads / is in last**: climb handles both — no rank above → "lidera"; no rank below → no chaser line.
- **Single-match & knockout pools**: the max points per match differs (range vs single-match vs knockout); "cravadas" and any points-recoverable figure use the pool's correct per-match maximum (reuse the existing scoring policy).
- **Live matches when the panel is opened**: the profile and climb do not recompute live; they reflect the last finished results and the current standings, consistent with the rest of the panel.
- **Postponed/rescheduled next match**: the climb's next match follows the same not-yet-started rule and updated kickoff; still no third-party prediction is exposed.

## Requirements *(mandatory)*

### Functional Requirements

#### Predictor profile (replaces single-dimension strengths)

- **FR-001**: The panel MUST present a **predictor profile** composed of independent cards, each derived **only** from the participant's own finished predictions in the pool compared to the actual results of those same matches. No other member's prediction or any pool aggregate is used to build any card.
- **FR-002**: **Empate cego** MUST show the participant's draw-prediction rate (their finished predictions where the predicted scoreline is a draw ÷ their finished count) next to the real draw rate of those same matches, with a tip. It MUST appear only when the finished count meets the card minimum AND the participant under-predicts draws by at least the configured margin; otherwise it is omitted.
- **FR-003**: **Quase lá** MUST show the count of finished predictions that were **not** an exact-score hit and were off by exactly one goal in total (the sum of the absolute home and away goal differences equals 1), and the total points an exact score would have added across those matches (for each such match: the pool's max points per match minus the points already earned). It MUST appear only when at least one such match exists.
- **FR-004**: **Gols inflados / placar manjado** MUST show the participant's average predicted total goals per game vs. the real average for those games, flagging inflation or economy beyond the configured margin, AND their most-used predicted scoreline with its share when that share meets the configured threshold. It MUST appear only when the finished count meets the card minimum.
- **FR-005**: **Truncado vs aberto** (the kept dimension) MUST show the participant's result accuracy in low-scoring (actual total ≤ 2 goals) vs high-scoring (> 2 goals) matches, with a verdict naming the stronger band when both bands meet the minimum sample and the accuracy gap meets the configured margin. The legacy "Forças por tipo de jogo" section MUST be removed; this card is its replacement.
- **FR-006**: Every profile card MUST carry a plain-language verdict and exactly one actionable tip ("Treinador" style). Cards that do not meet their gate MUST be omitted rather than shown empty; when no card qualifies, the profile MUST show a single "not enough data yet" state.
- **FR-007**: All profile thresholds (per-card minimum samples, margins, signature-scoreline share) MUST be defined as tunable constants in the domain layer, with documented v1 defaults (see Computation Notes).

#### Path to the top (replaces "Jogos que mais importam")

- **FR-008**: The panel MUST present a **climb** section showing the participant's current position and the pool size, the points gap to the rank immediately above, and that gap expressed as whole exact-scores using the pool's max points per match.
- **FR-009**: The climb MUST identify the immediate chaser (the member one rank below) and the points gap behind, flagged when that gap is within one match's max points.
- **FR-010**: The climb MUST surface exactly one not-yet-started match — the soonest one the participant can still act on — with its kickoff/deadline and an action of submit (no prediction yet) or change (a prediction exists) that links into the existing predictions flow. When the participant has no not-yet-started match, the next-match element is omitted.
- **FR-011**: When the participant leads the pool, the climb MUST show a leading state instead of a gap to the rank above; when the participant is last, the chaser line MUST be omitted.
- **FR-012**: The climb MUST derive its standings facts from the already-computed pool standings/aggregate; it MUST NOT run a new pool-wide aggregation, and MUST NOT simulate match outcomes. The full impact ranking of all upcoming matches and the reachable-rival "impact bucket" MUST be removed.
- **FR-013**: Names shown in the climb (the rank-above target and the chaser) are limited to what the pool leaderboard already exposes publicly; no prediction or per-match consensus is shown for any not-yet-started match.

#### Data, computation & performance

- **FR-014**: The predictor profile MUST be computed at read time, in the domain layer, from a single bounded query returning the participant's own finished predictions in the pool (raw predicted and actual scores plus the points already persisted per prediction). This query MUST also power the existing "Forma recente" block so the read path adds at most one query.
- **FR-015**: The feature MUST NOT recompute or re-derive scoring; it MUST use the points already persisted per prediction and the pool's max points per match from the existing scoring policy.
- **FR-016**: The per-participant snapshot's goal-band columns (low/high goal correct/total counts) MUST be removed, since the goal-band card is now computed at read time from the facts query; no unused column or code path may remain.
- **FR-017**: The profile and climb MUST stay off the 30-second live-polling path; they are served only on the (cold) paid-stats read path, consistent with spec 021.

#### Privacy & anti-herding (unchanged guarantees, restated)

- **FR-018**: The system MUST NOT reveal any third party's prediction for a not-yet-started match, nor any pool consensus/percentage/distribution for one (extends specs 009 and 021).
- **FR-019**: The predictor profile MUST compare the participant only to the reality of their own matches; the climb MUST compare only to the public standings. No individual member's prediction is exposed anywhere in the redesigned sections.

### Key Entities *(include if feature involves data)*

- **Predictor Profile (composed read model)**: The set of cards (draw blindness, near-miss, goal calibration + signature scoreline, low/high-goal strength) derived from the participant's own finished predictions vs. the actual results of those matches. Carries, per card, the figures, a verdict, a tip, and a shown/omitted flag. No persistence of its own.
- **Climb (composed read model)**: The participant's standings context (position, pool size, gap to the rank above in points and exact-scores, immediate chaser and gap) plus at most one next actionable match (kickoff, submit-or-change action). Derived from existing standings + the participant's not-yet-started matches.
- **Participant Pool Stats (snapshot) — modified**: The existing per-participant snapshot (spec 021) loses its goal-band columns (low/high goal correct/total); all other columns and behavior are unchanged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For an unlocked participant with sufficient history, every qualifying profile card renders with a figure, a verdict, and a tip; non-qualifying cards are omitted; with no qualifying card the profile shows one clear "not enough data yet" state — no blank or error states in normal operation.
- **SC-002**: Each profile figure reconciles exactly against the participant's raw predictions vs. the actual results of the same matches (draw rates, near-miss count/points, average goals, signature share, low/high-goal accuracy).
- **SC-003**: The climb's gap in points and in exact-scores, the chaser, and the position match the live standings and the pool's max points per match exactly.
- **SC-004**: No third-party prediction and no per-match consensus for a not-yet-started match is exposed anywhere in the redesigned sections (0 leakage events in testing).
- **SC-005**: The redesigned read path adds at most one query versus today and removes the upcoming-impact query; the section issues nothing on the 30-second live-polling cycle.
- **SC-006**: The snapshot migration removes the goal-band columns with no impact on the remaining stats and leaves no unused column or dead code path (architecture guardrails pass).

## Assumptions

- **Builds on 021 unchanged**: the unlock/entitlement, the locked teaser+price gate, the snapshot-refresh-on-match-finish trigger, the pool aggregate, and the scoreboard half (ranking, hit rate, efficiency, distribution, evolution, recent form) are all reused as-is. Only the coach half changes. The locked teaser copy MAY be updated to advertise the new insights, but reveals no real figure.
- **Comparison baseline (profile) is the participant's own match reality, by design** — not pool averages. This is intentional: more actionable, cheaper, and trivially privacy-safe. Pool-relative comparison remains only in the scoreboard half.
- **Climb names are leaderboard-public**: showing the rank-above target and the immediate chaser by name is consistent with the already-public pool standings; predictions remain hidden until kickoff.
- **Chosen visual direction**: "Treinador" (Direction A) — each card is a signal dot + title + verdict + figure + single tip; the climb hero uses the app's inverted cream card. Mockup reviewed and approved (`specs/026-stats-predictor-profile/mockup.html`, dark warm theme; red = você, green = vantagem, amber = oportunidade, gray = a realidade).
- **Thresholds are tunable** domain constants with v1 defaults (see Computation Notes); they may be adjusted after seeing real pools without changing the contract.
- **Knockout / single-match pools** reuse the existing per-pool scoring max for "cravadas" and points-recoverable; no special-casing beyond reading that max.

## Out of Scope (explicit prohibitions)

- **Favorite vs underdog** and **per-team** breakdowns — still deferred: the match data carries no odds/strength signal, and inferring it from pool consensus is both prohibited and unreliable.
- **Home-win bias** card — considered this round and dropped by product choice; not built.
- Any change to the unlock, payment, price, prize/fee, the snapshot-refresh trigger, or the scoreboard half of the panel.
- Any new prediction-editing surface — the climb only links into the existing predictions flow and its edit-until-kickoff rule.
- Cross-pool statistics of any kind.
- Putting the profile or climb on the 30-second live-polling path.

## Dependencies

- **Spec 021 (participant stats)** — the unlock, snapshot, pool aggregate, and read path this feature extends.
- **Spec 009 (hidden-until-kickoff)** — the privacy rule the climb's next-match surfacing relies on.
- **Spec 023 (knockout scoring)** — the per-pool max points per match used for "cravadas" and points-recoverable.
- **Existing standings/ranking** — source of the climb's position/gaps (no new aggregation).
- **Existing predictions flow** — the climb's submit/change CTA links into it; no editing is reimplemented.

## Computation Notes (non-normative v1 defaults)

These document the intended math and default thresholds; they live as domain constants and may be tuned without changing the requirements above.

**Source for all profile cards** — the participant's finished predictions in the pool, each row: `predHome, predAway, actualHome, actualAway, pointsEarned`. `maxPoints` = pool scoring policy max per match. `finished` = row count.

- **Empate cego** — `yourDrawRate = count(predHome == predAway) / finished`; `realDrawRate = count(actualHome == actualAway) / finished`. Show when `finished ≥ 8` and `realDrawRate − yourDrawRate ≥ 0.10`.
- **Quase lá** — a row is a near-miss when it is not exact and `|predHome − actualHome| + |predAway − actualAway| == 1`. `count` = such rows; `points = Σ(maxPoints − pointsEarned)` over them. Show when `count ≥ 1`.
- **Gols inflados** — `yourAvg = Σ(predHome+predAway)/finished`; `realAvg = Σ(actualHome+actualAway)/finished`. Inflation if `yourAvg − realAvg ≥ 0.4`, economy if `≤ −0.4`, else calibrated (neutral/omit). Show when `finished ≥ 6`.
- **Placar manjado** — modal `(predHome, predAway)` across finished rows; `share = modeCount / finished`. Show the chip when `share ≥ 0.25`.
- **Truncado vs aberto** — band by actual total goals: low `≤ 2`, high `> 2`. Per band `accuracy = count(result correct) / count(band)`. `betterAt` = the higher band when both bands have `≥ 3` samples and `|lowAcc − highAcc| ≥ 0.15`.

**Climb** — from standings sorted by points (tiebreak exact count, as today): `position`, `memberCount`; `gapToNextUp = points(position−1) − points(viewer)` (0 if leading); `exactsToClose = ceil(gapToNextUp / maxPoints)`; `chaser = member(position+1)` with `gap = points(viewer) − points(chaser)`, flagged when `gap ≤ maxPoints`; `nextMatch` = the viewer's soonest not-yet-started match (earliest kickoff), `action = hasPrediction ? change : submit`.
