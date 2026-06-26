# Feature Specification: Fluid Real-Time Scores & Ranking

**Feature Branch**: `028-realtime-scores-ranking`
**Created**: 2026-06-26
**Status**: Draft
**Input**: User description: "Quero ajustar os fluxos de atualização dos placares em tempo real e da pontuação. Para verificar atualizações tenho que mudar e voltar entre páginas ou sair e abrir novamente o app. Quero algo mais fluído, onde o usuário realmente consiga acompanhar em tempo real os resultados dos jogos e as pontuações no ranking (o ranking às vezes fica bugado)."

## Summary

Make live match scores and pool rankings update **fluidly**, so a user can follow a game and the leaderboard without switching pages or restarting the app. Today the app only auto-refreshes *while a match is already live and the screen is in the foreground*, on a ~30–40s timer, with **no refresh when the user returns to the app** (`refetchOnWindowFocus` is disabled) and **no auto-update at kickoff** (nothing polls until the backend has flagged the match `live`). The leaderboard also has two real correctness bugs that read as "the ranking gets buggy": tied participants **shuffle order** between refreshes, and a finishing match's points **momentarily vanish then reappear**.

This feature delivers fluidity through **smart polling** (no new real-time infrastructure): instant refresh on app focus and network reconnect, a light heartbeat that flips a section to "live" at kickoff, the existing ~30s live polling aligned to a slightly faster backend cadence, and fixes for the two ranking bugs. The backend live-score sync becomes **adaptive and call-budget-aware** so scores get fresher (~30s) while never exceeding the football-data API limit.

## Clarifications

### Session 2026-06-26

- Q: How should updates reach the app — enhanced polling or a real-time push channel (SSE/WebSocket)? → A: **Smart polling.** The focus/reconnect refresh + post-action behavior are the real wins; SSE is risky on the small box and cannot beat the backend's data-freshness ceiling. (SSE explicitly **out of scope** for now.)
- Q: During live matches, should the leaderboard reorder in real-time as provisional points come in? → A: **No.** Keeping the official finished-points order with the red `+X` provisional badge is the **intended** behavior — that signal exists to show points the user *will* earn from in-progress games. The list must **not** reorder on live points.
- Q: Should submitting a prediction invalidate/refetch match & ranking data? → A: **No.** Saving a prediction is unrelated to scores; the existing optimistic update is enough. This idea is **dropped**.
- Q: The backend only pulls scores every 60s. Tighten it for fresher scores? → A: **Yes, but respect the football-data limit of 20 calls/min (dropping to 10 calls/min after the World Cup).** Tighten to ~30s during live windows in a budget-aware way.
- Q: Should a section auto-flip to "live" when a match kicks off, with no interaction? → A: **Yes** — add a light heartbeat for the imminent-kickoff window.
- Q: With a live match, if the user sits idle on `/predictions`, does it already update? → A: **Yes**, while the screen is foregrounded; the felt "freeze" is specifically (1) returning to the app and (2) the moment of kickoff. Both are addressed here.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Live updates keep flowing, and refresh instantly on return (Priority: P1)

A user is watching a live match inside the app — on the matches list, the predictions screen, or the ranking. Scores and provisional points keep updating on their own while they watch. They switch to another app to reply to a message, then come back: the screen **immediately** reflects the latest score and standings, with no need to navigate away and back or restart the app.

**Why this priority**: This is the heart of the request — "algo mais fluído" without page-switching/app-restart gymnastics. Returning-to-the-app is the single most-felt friction. It is independently valuable and demonstrable on its own.

**Independent Test**: With a live match, open a live screen and confirm it updates without interaction while foregrounded; background the app, let the score change on the server, return to the app, and confirm the new value appears within ~1–2 seconds without any manual navigation.

**Acceptance Scenarios**:

1. **Given** a live match and a live screen in the foreground, **When** the user does nothing, **Then** scores/provisional points refresh on their own on the live cadence.
2. **Given** the user backgrounded the app (switched apps / locked the phone) while a live screen was open, **When** they return the app to the foreground, **Then** the live data refreshes immediately (on focus), not after a full poll cycle and not requiring navigation.
3. **Given** the device lost and regained network while a live screen was open, **When** connectivity returns, **Then** the live data refreshes automatically (on reconnect).
4. **Given** the app is backgrounded, **When** it is not visible, **Then** the live polling pauses (to conserve battery/data) and resumes on return — the focus refresh covers the gap.

---

### User Story 2 - The ranking is consistent during and after live games (Priority: P1)

A user follows the leaderboard during a live round. Participants tied on the same points do **not** swap places between refreshes, and when a match ends, nobody's points momentarily disappear and pop back. The provisional red `+X` keeps showing what each player is earning from in-progress games, and the order stays the official finished-points order (no live reordering).

**Why this priority**: "O ranking às vezes fica bugado" is an explicit complaint and erodes trust in every other improvement. Fixing the shuffle and the finish-flicker is independently valuable and testable, and is a prerequisite for the leaderboard feeling "real-time" rather than glitchy.

**Independent Test**: Create a pool where several members are tied; refetch the ranking repeatedly and confirm tied members keep a stable, identical order each time. Then drive a match from `live` to `finished` and confirm a watching client never sees the just-finished match's points drop to a lower value before settling.

**Acceptance Scenarios**:

1. **Given** two or more participants tied on both total points and exact-score count, **When** the ranking is refetched multiple times, **Then** those tied participants appear in the same, deterministic order every time (no row shuffling).
2. **Given** a participant earning provisional points from a live match, **When** the ranking refreshes, **Then** their list position does **not** change due to live points; only the red `+X` badge reflects them.
3. **Given** a live match that the user has points riding on, **When** the match transitions to `finished`, **Then** at no observable moment do that match's points disappear from the user's total before reappearing as finalized — the value only ever moves from "provisional" to "final".
4. **Given** the official standings are unchanged, **When** a client polls the ranking, **Then** the order and positions returned are stable between polls.

---

### User Story 3 - A match goes "live" by itself at kickoff (Priority: P2)

A user opens the app a few minutes before kickoff and stays on the matches/home section without touching anything. When the match starts, the section flips to "live" and begins showing the score on its own — the user does not have to navigate or reopen the app to "wake it up".

**Why this priority**: Closes the kickoff blind spot where nothing polls yet (because the backend hasn't flagged the match `live`). Valuable for the "follow it in real-time" goal, but secondary to the return-to-app refresh and ranking consistency.

**Independent Test**: With a match scheduled to start shortly and the matches section open and idle, advance the match to `live` on the server and confirm the section flips to live and starts polling within roughly the heartbeat interval, with no user interaction.

**Acceptance Scenarios**:

1. **Given** a match whose kickoff is imminent (within the configured pre-kickoff window) and not yet `live`, **When** the user is idle on a section showing that match, **Then** the section refreshes on a light heartbeat so it can pick up the `live` transition.
2. **Given** the match becomes `live`, **When** the heartbeat next runs (or the user focuses the app), **Then** the section switches to the live cadence and shows the live score.
3. **Given** no match is live or imminent, **When** the user is idle on the section, **Then** no extra background polling runs beyond the focus/reconnect refresh (no constant load while nothing is happening).

---

### User Story 4 - Scores are fresher, within the API budget (Priority: P2)

During live games, the score a user sees is at most ~30s behind reality (down from ~60s), and this never causes the platform to exceed the football-data API rate limit — including after the limit drops from 20 to 10 calls/min post-World-Cup.

**Why this priority**: Raises the data-freshness ceiling so the front-end improvements have fresher data to show. Important but strictly bounded by the external API budget, and the app is still markedly more fluid without it.

**Independent Test**: With one or more competitions live, confirm the live-sync runs at the faster cadence and that total football-data calls per minute stay at or below the configured budget; reduce the configured budget and confirm the sync self-throttles (slower cadence) rather than overrunning it.

**Acceptance Scenarios**:

1. **Given** at least one match is live or imminent, **When** the live-sync runs, **Then** it polls at the faster (~30s) cadence and only calls football-data for competitions that actually have a live/imminent match.
2. **Given** no match is live or imminent, **When** the live-sync would run, **Then** it backs off (slower cadence or no live-score call), spending no external calls on idle competitions.
3. **Given** the configured per-minute call budget, **When** more competitions are live than the budget allows at the fast cadence, **Then** the sync automatically slows down to stay at or under the budget instead of exceeding it.
4. **Given** the post-World-Cup budget of 10 calls/min, **When** the operator sets the budget via configuration, **Then** the sync honors the new ceiling without code changes.

---

### Edge Cases

- **Tie that includes the current user**: stable ordering applies to the current user too; their row never jumps relative to equally-tied peers across refreshes.
- **All members tied at zero (start of pool)**: the most common shuffle trigger; order must be stable and identical on every refresh.
- **Many simultaneous focus events**: a burst of users returning to the app at once must not stampede the heavy ranking aggregate — the existing per-pool cache (25s) + single-flight must absorb it; focus refetch must not bypass that protection.
- **Focus refetch vs. very fresh data**: returning to the app within a few seconds of the last fetch should not trigger a redundant heavy refetch — `staleTime` gates it; only genuinely stale live data refetches on focus.
- **Installed PWA / standalone display**: focus and visibility detection must work when the app runs as an installed PWA (standalone), not only in a browser tab.
- **Match stuck `live` (provider glitch)**: provisional points keep showing; the existing stale-live policy still finalizes the match — this feature must not change or break that safety net.
- **Multiple matches finishing in the same sync tick**: none of their points may enter the vanish-then-reappear limbo for a watching client, even when scored sequentially.
- **Heartbeat with no imminent match**: must not run, so an idle app with nothing upcoming spends no extra polling.
- **Budget exhausted mid-round**: when self-throttling, the chosen cadence must remain predictable (graceful slowdown), and the front-end live cadence must still function (it reads the DB, not the external API).
- **Backgrounded for a long time**: returning after a long absence refreshes everything stale-on-focus without a manual reload.

## Requirements *(mandatory)*

### Functional Requirements

**Front-end fluidity**

- **FR-001**: Live-data views (matches list, live home section, predictions, ranking) MUST refresh automatically the moment the app/tab regains focus, when their data is stale, without the user navigating or restarting the app.
- **FR-002**: Live-data views MUST refresh automatically when network connectivity is restored.
- **FR-003**: While a match is live and the view is foregrounded, live data MUST continue to poll on its own (no interaction required), and MUST pause polling while the view is not visible, resuming on return.
- **FR-004**: A view showing a match whose kickoff is imminent (within a configured pre-kickoff window) but not yet `live` MUST poll on a light heartbeat so it can detect and display the `live` transition without user interaction; this heartbeat MUST stop once the match is live or once no match is imminent.
- **FR-005**: Refresh-on-focus MUST be scoped/tuned so that static or rarely-changing data is not needlessly refetched, and so that focus bursts cannot stampede the heavy ranking aggregate (must go through the existing cache + single-flight).
- **FR-006**: The stats view and the pool header MUST reflect updates on focus/reconnect (today they can stay frozen until manual navigation).
- **FR-007**: Submitting a prediction MUST NOT trigger a refetch of match scores or ranking; the optimistic update remains the only local effect. (Explicit non-change.)
- **FR-008**: The front-end live polling cadence MUST be aligned to the backend live-sync cadence so it does not poll meaningfully faster than the data can change.

**Ranking correctness**

- **FR-009**: The ranking MUST order participants by a fully deterministic, stable key so that participants tied on points and exact-score count keep the same relative order across repeated reads (no shuffling between refreshes).
- **FR-010**: The leaderboard MUST NOT reorder based on live (provisional) points; live points are shown only as the provisional `+X` indicator while the official order stays by finalized points.
- **FR-011**: When a match transitions from `live` to `finished`, a client reading the ranking MUST NOT observe that match's points disappear before reappearing as final; the points MUST move from provisional to final without an intermediate "missing" state.
- **FR-012**: The provisional-vs-final accounting MUST avoid double-counting a match's points (never counted as both live and finalized for the same read).

**Backend freshness within budget**

- **FR-013**: The live-score sync MUST run at a faster cadence (~30s target) when at least one match is live or imminent, and back off when nothing is live/imminent.
- **FR-014**: The live-score sync MUST determine which competitions to call from local state (database), spending zero external API calls on competitions with no live/imminent match.
- **FR-015**: The system MUST enforce a configurable maximum football-data calls-per-minute budget (default 20, settable to 10 for the post-World-Cup limit) and MUST self-throttle the sync cadence to stay at or under it, degrading gracefully rather than overrunning the limit.
- **FR-016**: Changing the call budget MUST be possible via configuration (environment), without code changes.

### Key Entities *(no schema changes expected)*

- **Pool standing**: denormalized per-member finalized points + exact-score count used to order the leaderboard. This feature adds a deterministic ordering key to how standings are read; no new columns are required for ordering (a stable tiebreaker can use existing member/user identity and name).
- **Match**: source of live/finished status and scores. Its status transition timing is what creates the finish "limbo"; the fix governs how provisional vs. final points are accounted around that transition. No new columns required.
- **Prediction**: per-user score for a match; its `points` (null while unscored, set when the match is scored) is the natural signal for "provisional vs. finalized".

## Design Notes / Agreed Approach *(non-binding implementation guidance)*

These capture the decisions reached during brainstorming; the implementation plan refines the exact mechanism.

1. **Focus & reconnect refresh** — enable refresh-on-focus and refresh-on-reconnect for live-data queries, with per-query `staleTime` so static data is not refetched on every focus. Safe now because the ranking aggregate is cached (25s) with single-flight, which absorbs focus bursts — the original reason for disabling focus-refetch.
2. **Heartbeat** — a low-frequency (~60–90s) refetch on matches/home sections that runs only while a match is imminent-but-not-live, to catch the kickoff transition.
3. **Live polling** — keep the ~30s live cadence (with jitter), aligned to the backend; pause while hidden (default), resume on focus.
4. **Stats/header** — covered by focus/reconnect refresh; no new always-on intervals. Prediction-submit refetch is removed.
5. **Bug A (tie shuffle)** — add a stable final tiebreaker to the standings read (e.g., participant name then user id) after points and exact-score count; mirror the "already sorted" assumption documented in the ranking domain.
6. **Bug B (finish limbo)** — make the live→finished transition atomic from a reader's perspective by tying "provisional vs final" to the prediction's own scored state (e.g., a match's points keep counting as provisional until its predictions are scored and folded into standings), so the value never lands in a state where it is in neither bucket.
7. **Adaptive, budget-aware live-sync** — choose competitions to poll from the DB; target ~30s when live/imminent, back off when idle; enforce a configurable `calls/min` budget (default 20 → 10 post-Cup) and self-throttle.

## Success Criteria *(measurable)*

- **SC-001**: Returning the app to the foreground refreshes visible live data within ~1–2 seconds, with no manual navigation or restart.
- **SC-002**: A match kicking off appears as "live" automatically within roughly the heartbeat interval while the user is idle on a relevant section.
- **SC-003**: Across repeated ranking refreshes with tied participants, the order is identical every time (zero shuffles).
- **SC-004**: A finishing match never shows a points value lower than both its provisional and its final value at any observed moment (no vanish-then-reappear).
- **SC-005**: Observed live-score staleness during live windows is ≤ ~30s (down from ~60s), when the call budget allows.
- **SC-006**: Football-data calls never exceed the configured per-minute budget, including at the post-World-Cup ceiling of 10/min.
- **SC-007**: No new infrastructure is introduced (no SSE/WebSocket, no Redis); the single-process box's memory/CPU profile is not materially worsened by the change.

## Out of Scope / Non-Goals

- **Real-time push (SSE/WebSocket)** — explicitly deferred; revisit only if smart polling proves insufficient after measurement.
- **Reordering the leaderboard by live/provisional points** — explicitly rejected; the frozen official order with the red `+X` is the intended design.
- **Refetching match/ranking data on prediction submit** — explicitly dropped.
- **Any database schema migration** — none expected; the ordering fix and the finish-transition fix use existing data.
- **New external infrastructure** (Redis, queues, sticky sessions, clustering).

## Constraints & Context

- Production runs on a small single-process box (~3 vCPU / 4 GB); the known scaling limit is ranking re-aggregation under live-polling load.
- football-data.org limit: **20 calls/min now, 10 calls/min after the World Cup**.
- Existing in-process caches: ranking aggregate (25s TTL + single-flight), stats aggregate. The unused `redis` container stays unused.
- All monetary values remain in centavos (BRL). No payment paths are touched.
