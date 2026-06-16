# Feature Specification: Live Match Minute (current minute + injury time)

**Feature Branch**: `025-live-match-minute`
**Created**: 2026-06-16
**Status**: Draft
**Input**: User description: "A API football-data foi atualizada (plano Livescore) e agora expõe `minute`/`injuryTime` via o header `X-Api-Version: v4.1`. Quero mostrar essa informação de minutos quando um jogo estiver ao vivo."

## Context & Problem

While a match is live the app shows a pulsing red **"Ao Vivo"** badge and the current score, but no sense of *when* in the match we are. A user looking at a live `0 x 0` cannot tell if it is the 3rd minute or stoppage time.

football-data.org (our match-data source) added the live elapsed clock to the Livescore plan: the `minute` and `injuryTime` fields are now returned on the match object, but only when the request carries the HTTP header `X-Api-Version: v4.1` (the default `v4` keeps the old, stable response without these fields). We confirmed the shape against the live API:

- `minute`: running clock, **capped at 45 / 90** (a finished match reports `minute: 90`).
- `injuryTime`: stoppage minutes to add, or `null` when there is none (the finished sample reported `injuryTime: null`).

So the canonical football display is `45+2'` during first-half stoppage and `90+4'` in second-half stoppage, `67'` otherwise.

This feature surfaces that clock next to the live indicator the app already shows.

## Clarifications

### Session 2026-06-16

- Q: How much detail should the live clock show? → A: **Minute + injury time.** Show `67'` normally and `45+2'` / `90+N'` during stoppage. Persist both `minute` and `injuryTime`. (Halftime "Intervalo" labelling was considered and explicitly left out — it would require propagating the `PAUSED` status, which today collapses to `live`.)
- Q: Where and how does the minute appear? → A: **Inline, between the "Ao Vivo" indicator and the score, on the same line** (no new line): `• AO VIVO · 67'   0 X 0`.
- Q: In which surfaces? → A: **Both** the prediction screen header (`LiveResultHeader` in `ScoreInput`) **and** the matches-list card (`MatchCard`), with the same `· 67'` format. On the card the minute is appended to the existing "Ao Vivo" badge.
- Q: Should the displayed minute "tick" between syncs? → A: **No.** Show the minute from the last sync; it refreshes on the next poll. Client-side extrapolation is rejected because it breaks at halftime (`PAUSED`→`live`, minute frozen near 45) and during stoppage, and we will not raise the sync frequency (production runs on a small box and live polling is already the scaling limit). Worst-case staleness is ~1–1.5 min — imperceptible for a minute counter and never wrong.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the live minute while a match is in play (Priority: P1)

As someone watching a live match in the pool, I want to see the current match minute next to the "Ao Vivo" indicator so I know how far along the game is.

**Why this priority**: This is the entire feature — the visible payoff the user asked for.

**Independent Test**: With a match in `live` status and a known `minute` value coming from the feed, open the prediction screen and the matches list and confirm the minute renders inline with the "Ao Vivo" indicator in both places.

**Acceptance Scenarios**:

1. **Given** a live match whose feed reports `minute: 67, injuryTime: null`, **When** the user views the prediction header, **Then** it reads `• AO VIVO · 67'   <score>` on one line.
2. **Given** the same live match, **When** the user views it in the matches list (`MatchCard`), **Then** the "Ao Vivo" badge reads `• AO VIVO · 67'`.
3. **Given** a live match in first-half stoppage with `minute: 45, injuryTime: 2`, **When** the user views either surface, **Then** the clock reads `45+2'`.
4. **Given** a live match whose feed reports no minute (`minute: null`), **When** the user views either surface, **Then** the "Ao Vivo" indicator renders exactly as today (no minute, no stray separator).
5. **Given** a finished match, **When** the user views either surface, **Then** no live minute is shown (the existing "Final" / "Resultado oficial" treatment is unchanged), even though a `minute` value may remain stored.

### Edge Cases

- **Halftime**: the feed reports `PAUSED` (mapped to `live`) with the minute frozen near 45 — the app shows `45'` (or `45+N'`); no "Intervalo" label (out of scope).
- **Missing data**: `minute` may be `null` even while `live` — the display degrades gracefully to today's badge.
- **Stale minute across a finish**: when a match finishes the feed reports `minute: 90`; since the minute is only rendered while `status === 'live'`, the stored value is never displayed afterward (no need to clear it).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All requests to football-data.org MUST send the `X-Api-Version: v4.1` header so the `minute`/`injuryTime` fields are returned.
- **FR-002**: The live-score sync MUST capture `minute` and `injuryTime` from each match and persist them.
- **FR-003**: The match read endpoint (`GET /api/matches`) MUST include `minute` and `injuryTime` in its response so the frontend can render them.
- **FR-004**: The frontend MUST render the live clock inline with the "Ao Vivo" indicator, between the indicator and the score, on a single line, in both the prediction header and the matches-list card.
- **FR-005**: The clock format MUST be `{minute}'` normally and `{minute}+{injuryTime}'` when `injuryTime > 0`.
- **FR-006**: The clock MUST render only when the match is `live` and a `minute` value is present; otherwise the existing indicator is unchanged.
- **FR-007**: The displayed minute reflects the last sync and is NOT extrapolated/ticked on the client.

## Key Entities & Data

- **`match` table**: two new nullable integer columns — `minute` and `injuryTime` (`injury_time`). Additive; no backfill needed (null is the correct value for past/non-live matches).
- **Shared `Match` type** (`packages/shared`): add `minute?: number | null` and `injuryTime?: number | null`.
- **Domain note**: `minute`/`injuryTime` are presentational live data, not business rules (they do not affect scoring or ranking). They flow through the persistence/DTO layers and the shared type; they are **not** added to the `Match` domain aggregate. This keeps the architecture guardrails (G2/G3) satisfied — no business rule is being re-derived in an outer layer.

## Technical Design

### Backend
1. **`apps/api/src/infrastructure/external/FootballDataApiAdapter.ts`** — add `'X-Api-Version': 'v4.1'` to the request headers (alongside the existing `X-Auth-Token`) for every call. Harmless for the 6-hour fixture sync; required for the 1-minute live sync.
2. **`apps/api/src/application/ports/FootballDataApi.port.ts`** — extend `ExternalMatch` with `minute?: number | null` and `injuryTime?: number | null`.
3. **`apps/api/src/application/match/SyncLiveScoresUseCase.ts`** — in `toResultUpdate()`, map `m.minute` and `m.injuryTime` into the result update.
4. **`apps/api/src/.../MatchRepository.port.ts`** — add `minute`/`injuryTime` to `MatchData` / `MatchResultUpdate`.
5. **`apps/api/src/infrastructure/.../DrizzleMatchRepository.ts`** — persist `minute`/`injuryTime` in `updateScores()`.
6. **`apps/api/src/db/schema/match.ts`** — add the two nullable integer columns.
7. **New Drizzle migration** (next sequential number) adding the columns. ⚠️ Bump the migration's `when` timestamp in `apps/api/drizzle/meta/_journal.json` above the previous entry, or boot-time migrate silently skips it in production.
8. **`apps/api/src/infrastructure/http/routes/matches.ts`** — add `minute` and `injuryTime` to the `matchColumns` returned by `GET /api/matches`.

### Frontend
1. **`apps/web/src/lib/utils.ts`** — add a pure helper `formatMatchMinute(minute, injuryTime)`:
   - returns `null` when `minute == null`;
   - returns `` `${minute}+${injuryTime}'` `` when `injuryTime` is a positive number;
   - returns `` `${minute}'` `` otherwise.
2. **`apps/web/src/components/prediction/ScoreInput.tsx`** (`LiveResultHeader`) — accept `minute`/`injuryTime` props and, when `matchStatus === 'live'` and a formatted clock exists, render a `<span>· {clock}</span>` **between** the "Ao Vivo" span and the score span (the container is already a single-line flex with `gap-2`). Thread `minute`/`injuryTime` from the match data into `ScoreInput` and down to `LiveResultHeader`.
3. **`apps/web/src/components/match/MatchCard.tsx`** — append `· {clock}` inside the existing live badge span (line ~56–61), keeping the pulsing dot and "Ao Vivo" label.

### Freshness
The minute is written by the existing 1-minute live sync and read by the existing 30-second frontend poll; it is shown as last synced (no client ticking). No change to sync or poll frequency.

## Testing

- **Backend unit**: `SyncLiveScoresUseCase` maps `minute`/`injuryTime` from an `ExternalMatch` into the persisted result update (including the `null`/missing case).
- **Frontend unit**: `formatMatchMinute` returns `67'`, `45+2'`, and `null` for the respective inputs.

## Out of Scope

- A "Intervalo" (halftime) label — would require propagating the `PAUSED` status that currently maps to `live`.
- Client-side ticking/extrapolation of the minute.
- The marketing `DemoPredict` component (static fake data) — left unchanged unless a visual mismatch is later reported.
- Any increase in sync or polling frequency.
