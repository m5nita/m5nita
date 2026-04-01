# Feature Specification: Multi-Competition Support

**Feature Branch**: `006-multi-competition`
**Created**: 2026-03-24
**Status**: Implemented
**Input**: User description: "Multi-competicao permanente para o app de bolao m5nita. Refatorar o sistema hardcoded para Copa do Mundo para suportar multiplas competicoes (La Liga, Copa, etc). Cada bolao e vinculado a uma competicao. Novo stage 'league' para jogos de liga. Sync de partidas multi-competicao via football-data.org. Teste end-to-end com 1 rodada do campeonato espanhol (La Liga) usando Stripe real com R$1."

## Clarifications

### Session 2026-03-24

- Q: Como lidar com matches e pools existentes sem competitionId? → A: Auto-migrar. Criar registro "Copa do Mundo 2026" e associar todos os matches/pools existentes a ele.
- Q: O filtro de matchday fica armazenado onde? → A: No pool. Cada pool escolhe quais rodadas quer cobrir (matchdayFrom/matchdayTo).
- Q: Como o admin registra novas competicoes? → A: Via comandos do Telegram bot, seguindo o padrao ja usado para cupons.

### Session 2026-03-31

- Q: Como controlar quais competicoes aparecem na home e pagina de jogos? → A: Campo `featured` (boolean) na competicao. Admin controla via `/competicao_destacar`. Competicoes nao featured continuam ativas para boloes mas nao poluem as telas publicas.
- Q: Season display mostra "2025" mas deveria ser "2025/2026" para ligas → A: API calcula `seasonDisplay` a partir das datas dos jogos. Se cruzam anos diferentes, mostra "YYYY/YYYY".
- Q: Palpites de liga em lista unica fica confuso com muitas rodadas → A: Palpites de liga usam abas por rodada (30ª, 31ª, etc.). Mata-mata de copa usa abas por fase (32-avos, Oitavas, Quartas, etc.).
- Q: Se so uma competicao featured, deve vir selecionada automaticamente → A: Sim, auto-seleciona na pagina de jogos quando so 1 featured.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin Registers a Competition via Telegram (Priority: P1)

An administrator registers a new competition via Telegram bot commands (e.g., `/competicao_criar PD "La Liga" 2025 league`), following the same pattern already used for coupon management. The system creates the competition record and begins syncing match fixtures from the external data provider.

**Why this priority**: Without a competition entity, no other feature can work. This is the foundation that matches, pools, and predictions depend on.

**Independent Test**: Can be tested by sending the Telegram command and verifying that match data is automatically fetched and stored with the correct competition association.

**Acceptance Scenarios**:

1. **Given** an admin in the Telegram bot, **When** they send `/competicao_criar PD "La Liga" 2025 league`, **Then** the competition is created and match fixtures are synced within the next sync cycle.
2. **Given** an existing competition with code "PD" and season "2025", **When** an admin tries to register the same competition again, **Then** the bot responds with a clear duplicate error message.
3. **Given** a registered league competition, **When** matches are synced, **Then** each match is assigned stage "league" and the correct matchday number.
4. **Given** an admin in the Telegram bot, **When** they send `/competicao_listar`, **Then** the bot lists all registered competitions with their status.

---

### User Story 2 - Pool Owner Creates a Pool with Competition and Matchday Selection (Priority: P1)

A pool owner creates a new bolao, selects which competition it belongs to, and optionally chooses a matchday range to cover. Only active competitions with upcoming matches are available. The pool shows only the matches within its selected competition and matchday range.

**Why this priority**: Pools are the core product. Linking them to competitions with matchday filtering is essential for the multi-competition model and for testing with a single La Liga round.

**Independent Test**: Can be tested by creating a pool, selecting a competition with a specific matchday range, and verifying that only those matches appear for predictions.

**Acceptance Scenarios**:

1. **Given** a user on the pool creation screen, **When** they see the competition selector, **Then** only active competitions with future matches are listed.
2. **Given** a user creating a pool for La Liga, **When** they select matchday range 30-30 (single round), **Then** the pool only shows matches from matchday 30.
3. **Given** a pool linked to La Liga matchday 30, **When** a member views available matches to predict, **Then** they see only La Liga matchday 30 matches (~10 games).
4. **Given** a pool with no matchday range specified (cup competition), **When** a member views matches, **Then** they see all matches from that competition.

---

### User Story 3 - Match Sync for Multiple Competitions (Priority: P1)

The system periodically syncs match fixtures and live scores for all active competitions, not just a single hardcoded one. Each competition's matches are fetched independently and stored with their competition association.

**Why this priority**: Real-time match data is critical for the prediction and scoring flow. Multi-competition sync enables the entire feature.

**Independent Test**: Can be tested by registering two competitions and verifying that matches from both are synced independently with correct competition associations.

**Acceptance Scenarios**:

1. **Given** two active competitions (La Liga and World Cup), **When** the fixture sync runs, **Then** matches for both competitions are fetched and stored with correct competition IDs.
2. **Given** a league competition, **When** matches are synced, **Then** matches have stage "league" and their matchday number preserved.
3. **Given** an active competition with live matches, **When** the live score sync runs, **Then** scores are updated and points are calculated only for predictions in pools linked to that competition.

---

### User Story 4 - Pool Closes When Its Matches Finish (Priority: P2)

A pool automatically closes when all matches within its scope (competition + matchday range) are finished. The winner is determined, notifications are sent, and prize withdrawal becomes available. Pools linked to different competitions or matchday ranges close independently.

**Why this priority**: Automatic pool closing and prize distribution are essential for the complete flow, but depend on match sync and pool-competition linking being in place first.

**Independent Test**: Can be tested by simulating all matches within a pool's scope finishing and verifying the pool closes, rankings are finalized, and the winner is notified.

**Acceptance Scenarios**:

1. **Given** a pool linked to La Liga matchday 30 with 10 matches, **When** all 10 matches finish, **Then** the pool status changes to "closed" and rankings are finalized.
2. **Given** two pools linked to different matchdays, **When** matchday 30 finishes but matchday 31 is still in progress, **Then** only the matchday 30 pool closes.
3. **Given** a closed pool with a winner, **When** the pool closes, **Then** the winner receives a notification via Telegram with the prize amount.

---

### User Story 5 - Data Migration for Existing Records (Priority: P1)

When the feature is deployed, existing matches and pools (created before multi-competition support) are automatically migrated to a "World Cup 2026" competition record. No manual intervention is needed and no data is lost.

**Why this priority**: Without migration, existing records would be orphaned and the system would be in an inconsistent state.

**Independent Test**: Can be tested by running the migration on a database with existing records and verifying all matches and pools are associated with the auto-created World Cup competition.

**Acceptance Scenarios**:

1. **Given** existing matches with no competition association, **When** the migration runs, **Then** a "Copa do Mundo 2026" competition record is created with code "WC", season "2026", type "cup".
2. **Given** existing pools with no competition association, **When** the migration runs, **Then** all pools are linked to the "Copa do Mundo 2026" competition.
3. **Given** the migration has completed, **When** the system operates normally, **Then** all existing functionality continues to work identically.

---

### User Story 6 - End-to-End Test with La Liga Round (Priority: P2)

A complete end-to-end test using a real La Liga round: register the competition via Telegram, sync all fixtures, create a pool with R$1 entry fee and a single matchday filter via real Stripe, invite participants, make predictions, wait for real match results, verify scoring, ranking, pool closure, and prize withdrawal via PIX.

**Why this priority**: This validates the entire system works with real data and real money before the World Cup launches.

**Independent Test**: Can be tested by executing the full flow with a small group of real users on a specific La Liga matchday.

**Acceptance Scenarios**:

1. **Given** La Liga competition registered via Telegram, **When** fixtures sync, **Then** all La Liga matches are imported.
2. **Given** a pool with R$1 entry fee and matchday 30 filter, **When** a user joins via Stripe, **Then** payment is processed with real money and the user becomes a pool member seeing only matchday 30 games.
3. **Given** all matchday 30 games have finished, **When** the system syncs final scores, **Then** points are calculated, rankings updated, pool closed, and the winner can withdraw their prize via PIX.

---

### Edge Cases

- What happens when a competition has no upcoming matches? The competition should not appear in the pool creation selector.
- What happens when a match is postponed or cancelled in a league competition? The pool should not close until postponed matches are rescheduled and completed, or cancelled matches are excluded from the pool's match count.
- What happens when the external data provider rate-limits requests due to multiple competition syncs? The system should handle rate limiting gracefully by spacing requests and retrying with backoff.
- What happens when a pool is created for a competition that later becomes inactive? The pool remains active but no new matches are synced. Existing matches continue to be scored normally.
- What happens when all members of a pool have already predicted all matches? Reminder notifications should not be sent for that pool.
- What happens when a pool has a matchday range but matches are added to that matchday after the pool was created? The pool should pick up newly synced matches within its range automatically.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support registering multiple competitions, each identified by a unique external code and season combination.
- **FR-002**: System MUST distinguish between competition types: "cup" (tournament with stages like group, quarterfinal, final) and "league" (round-robin with matchdays).
- **FR-003**: System MUST assign stage "league" to all matches belonging to league-type competitions, preserving the matchday number.
- **FR-004**: Each pool MUST be linked to exactly one competition at creation time.
- **FR-005**: Each pool MAY specify a matchday range (matchdayFrom/matchdayTo) to filter which matches within the competition are covered. If no range is specified, all competition matches are included.
- **FR-006**: Members of a pool MUST only see and predict on matches belonging to that pool's competition and within its matchday range.
- **FR-007**: System MUST sync match fixtures and live scores for all active competitions independently.
- **FR-008**: A pool MUST automatically close when all matches within its scope (competition + matchday range) are finished.
- **FR-009**: Pools linked to different competitions or matchday ranges MUST close independently of each other.
- **FR-010**: System MUST handle external data provider rate limiting by spacing requests across competitions.
- **FR-011**: Competition selector on pool creation MUST only show active competitions with future matches.
- **FR-012**: System MUST support real payment processing (Stripe) with minimum entry fees for test pools.
- **FR-013**: Existing scoring rules (10/7/5/3/0 points) MUST apply identically across all competition types.
- **FR-014**: Prize calculation and PIX withdrawal MUST work identically regardless of competition type.
- **FR-015**: Competition registration MUST be available via Telegram bot admin commands, following the same pattern as coupon management.
- **FR-016**: On deployment, system MUST auto-migrate existing matches and pools to a "Copa do Mundo 2026" competition record (code "WC", season "2026", type "cup").
- **FR-017**: Each competition MUST have a `featured` flag (boolean, default false). Only featured competitions appear in the home page "Proximos Jogos" and the matches listing page. Non-featured competitions remain active for pools and predictions.
- **FR-018**: Admin MUST be able to toggle a competition's featured status via Telegram bot command (`/competicao_destacar`).
- **FR-019**: Season display MUST show the correct format: "YYYY/YYYY" for leagues spanning two calendar years, "YYYY" for single-year competitions.
- **FR-020**: Predictions page for league competitions MUST show matches organized in tabs by matchday (30ª, 31ª, etc.).
- **FR-021**: Predictions page for cup competitions MUST show knockout matches organized in tabs by stage (32-avos, Oitavas, Quartas, Semi, 3o Lugar, Final).
- **FR-022**: When only one competition is featured, it MUST be auto-selected in the matches page without requiring user interaction.

### Key Entities

- **Competition**: Represents a football competition (e.g., La Liga 2025/26, World Cup 2026). Has a unique external code + season, a type (cup/league), a status (active/finished), a name, and a `featured` flag to control visibility on public pages.
- **Match**: Extended with a competition association. League matches use stage "league" with matchday numbers.
- **Pool**: Extended with a competition association and optional matchday range (matchdayFrom/matchdayTo). Its lifecycle is tied to the completion of matches within its scope (competition + matchday range).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create pools for any active competition and complete the full prediction flow (create pool, join, predict, view results) within the same time as current World Cup pools.
- **SC-002**: Match data for a newly registered competition is available for predictions within one sync cycle (6 hours for fixtures, 5 minutes for live scores).
- **SC-003**: A complete end-to-end test with a real La Liga round succeeds: pool creation with R$1 real payment, predictions, automatic scoring after matches finish, pool closure, and prize withdrawal via PIX.
- **SC-004**: Pools linked to one competition are completely isolated from another competition's matches and lifecycle events.
- **SC-005**: The system handles at least 5 concurrent active competitions without sync delays or data provider rate-limit failures.
- **SC-006**: Existing matches and pools are successfully migrated to the auto-created World Cup competition with zero data loss.

## Assumptions

- The football-data.org API supports La Liga (code "PD") with the same response format as the World Cup (code "WC").
- The free tier of football-data.org allows enough API calls to sync multiple competitions (may need to space requests).
- For the La Liga test, a specific upcoming matchday will be selected manually after the feature is deployed.
- Competition registration is done via Telegram bot admin commands, following the same pattern as coupon management.
- The existing scoring system (exact match, goal difference, winner, draw) applies equally well to league matches as to cup matches.
- Existing data in production is limited to World Cup 2026 matches and related pools.
