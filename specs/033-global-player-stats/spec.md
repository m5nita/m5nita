# Feature Specification: "Meu desempenho" — global bettor overview

**Feature Branch**: `033-global-player-stats`
**Created**: 2026-07-24
**Status**: Draft
**Input**: User description: "quero criar uma espécie de visualização geral de estatística dos bolões para os usuários, ou seja, uma forma de cada usuário conseguir visualizar quantos bolões já participou, quantos ganhou, quantos perdeu, quanto de dinheiro gastou/ganhou. Não sei ao certo onde deve ficar isso e como deve ser visualmente, me ajude a pensar"

## Overview

Today the app only shows statistics **inside** a single pool (the paid per-pool
"Estatísticas" feature — palpite quality and comparison against the other
participants). There is no place where a user can step back and see their
**whole life as a bettor across every pool**: how many pools they have joined,
how many they won or lost, and whether they are up or down on money.

This feature adds **"Meu desempenho"** — a free, global, per-user overview that
aggregates the user's history across all their pools into a single glanceable
screen, plus a compact summary on the home screen. It is read-only reporting: it
reuses the same winner/prize/payment truth the rest of the app already uses and
never changes how anything is calculated.

> Design direction approved during brainstorming: **"Carteira"** — a headline
> **saldo** (net career profit/loss), a **career evolution curve**, an
> **aproveitamento** (win-rate) dial, money tiles, and an optional **shareable
> card**. Interactive mockup (3 explored directions, light/dark):
> https://claude.ai/code/artifact/fc45cf54-9257-4d59-a625-24cb34c6881a

## Clarifications (resolved during brainstorming)

- **Placement**: a dedicated screen reachable from the primary navigation, **plus**
  a compact summary card on the home screen. (Not buried inside settings.)
- **"Money earned" semantics**: **prize entitlement** — everything the user is
  owed for winning (finishing 1st), counted whether or not it has been withdrawn,
  with the not-yet-withdrawn part highlighted as "a sacar".
- **Gating**: **free** for every authenticated user. No unlock, no payment. This
  is deliberately different from the paid per-pool "Estatísticas".
- **Name**: **"Meu desempenho"** (menu item + screen title), chosen to avoid
  confusion with the paid per-pool "Estatísticas".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See my overall performance (Priority: P1)

As a logged-in user, I open **"Meu desempenho"** and, in one glance across **all**
the pools I have ever joined, I see whether I am up or down on money (**saldo**),
how many pools I joined, my win/loss record, my win rate (**aproveitamento**), how
much I spent, how much I won in prizes, how much I still have to withdraw, and how
my saldo has evolved over my betting history.

**Why this priority**: This is the core value the user asked for and a complete,
shippable MVP on its own — it answers "quantos participei, quantos ganhei/perdi,
quanto gastei/ganhei" in a single screen without any of the secondary surfaces.

**Independent Test**: Seed a user with a mix of closed, active, and cancelled
pools plus their entry payments, prizes, and withdrawals; open the screen; verify
every displayed number matches the definitions in the Requirements section.

**Acceptance Scenarios**:

1. **Given** a user who joined 17 non-cancelled pools (6 closed as 1st place, 9
   closed not-1st, 2 still open), spent R$ 255,00 in entries and is entitled to
   R$ 612,00 in prizes, **When** they open "Meu desempenho", **Then** they see
   saldo **+R$ 357,00** (positive, visually marked as profit), participei **17**,
   vitórias **6**, derrotas **9**, em andamento **2**, aproveitamento **40%**,
   gastei **R$ 255,00**, prêmios **R$ 612,00**.
2. **Given** that same user has withdrawn R$ 522,00 of their prizes, **When** they
   open the screen, **Then** "a sacar" shows **R$ 90,00** with a clear path to
   withdraw, and saldo is unchanged (still counts the full entitlement).
3. **Given** a user whose only pools are still in progress (none closed yet),
   **When** they open the screen, **Then** vitórias and derrotas are **0**,
   aproveitamento shows an "sem dados ainda" indicator (not "0%" and not an error),
   and saldo reflects only what they have spent (negative until a pool pays out).
4. **Given** a brand-new user who has never joined a pool, **When** they open the
   screen, **Then** they see an inviting empty state that points them to join or
   create a pool (never a blank screen or an error).
5. **Given** a user who is down overall (spent more than they have won), **When**
   they open the screen, **Then** saldo is shown as a negative value marked as
   prejuízo (visually distinct from a positive saldo).

---

### User Story 2 - Glance at my performance from the home screen (Priority: P2)

As a logged-in user on the home screen, I see a compact card at the top with my
**saldo** and my **win/loss record**, and a link that takes me to the full
"Meu desempenho" screen.

**Why this priority**: Drives discovery and repeat engagement with the P1 screen;
valuable but depends on P1 existing.

**Independent Test**: Log in, land on home, confirm the summary card shows saldo +
record and links to the full view; log out and confirm the card is absent.

**Acceptance Scenarios**:

1. **Given** a logged-in user on the home screen, **When** the page loads, **Then**
   a "Meu desempenho" summary card shows their saldo and win/loss record and links
   to the full view.
2. **Given** a signed-out visitor, **When** they view the home/landing screen,
   **Then** the summary card is not shown.

---

### User Story 3 - Share my bettor card (Priority: P3)

As a user proud (or infamous) for my record, I can share a visual **card** that
summarizes my career (saldo, record, aproveitamento, prizes) with friends.

**Why this priority**: A viral/retention lever borrowed from the "Cartela"
direction; a nice-to-have that sits on top of the P1 data.

**Independent Test**: Open the screen, trigger "Compartilhar", confirm a shareable
visual summary of the current user's stats is produced.

**Acceptance Scenarios**:

1. **Given** the "Meu desempenho" screen, **When** the user taps "Compartilhar",
   **Then** a visual card summarizing their current career stats is generated for
   sharing.

---

### Edge Cases

- **No pools**: user has never joined → actionable empty state (US1 #4).
- **Only in-progress pools**: no decided pools → aproveitamento undefined, shown as
  "sem dados ainda"; record is 0–0 (US1 #3).
- **Tie for 1st place**: co-winners each count as a **vitória**, and each is
  entitled to their split of the prize.
- **Free pools** (entry fee = 0): count toward participei and toward the win/loss
  record, but contribute R$ 0 to gasto, prêmios, and saldo.
- **Cancelled pools**: excluded from every count and from all money totals.
- **Prize won but never withdrawn**: counted in prêmios conquistados and in saldo,
  and surfaced as "a sacar".
- **Abandoned/failed entry checkout**: a pending or failed payment is **not**
  counted as spend; only completed entry payments count.
- **Non-entry payments**: purchases of the paid per-pool "Estatísticas" (or any
  non-entry payment) are **not** counted in gasto.
- **Never won a prize**: "maior prêmio" is hidden or shown as "—".
- **Many pools**: a user with a large history still gets a fast, complete summary
  (see Success Criteria).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide each authenticated user a global
  "Meu desempenho" view that aggregates statistics across **all** pools they have
  joined — distinct from, and never confused with, the per-pool "Estatísticas".
- **FR-002**: The view MUST be **free** to every authenticated user; it MUST NOT be
  gated behind any unlock or payment.
- **FR-003**: The view MUST be **read-only reporting**. It MUST NOT change how
  winners, prizes, platform fees, rankings, or withdrawals are computed anywhere
  in the app.
- **FR-004**: The system MUST show **participei** — the count of distinct pools the
  user has joined, excluding cancelled pools.
- **FR-005**: The system MUST show **vitórias** — the count of the user's **closed**
  pools in which they finished **1st** in the final ranking; a tie for 1st counts
  as a vitória for every co-winner.
- **FR-006**: The system MUST show **derrotas** — the count of the user's **closed**
  pools in which they did **not** finish 1st.
- **FR-007**: The system MUST show **em andamento** — the count of the user's joined
  pools that are not yet closed and not cancelled; these count as neither vitória
  nor derrota.
- **FR-008**: The system MUST show **aproveitamento** = vitórias ÷ (vitórias +
  derrotas), presented as a percentage. When the user has no decided (closed)
  pools, it MUST show an explicit "no data yet" indicator instead of 0% or an
  error.
- **FR-009**: The system MUST show **gastei** = the sum of the user's **completed
  entry payments**, net of any coupon discount, excluding non-entry payments and
  excluding pending/failed payments.
- **FR-010**: The system MUST show **prêmios conquistados** = the total prize the
  user is entitled to from pools they won (derived from each closed pool's final
  ranking and prize split), counted **whether or not** the prize has been
  withdrawn.
- **FR-011**: The system MUST show **saldo** = prêmios conquistados − gastei as the
  primary headline number, visually distinguishing a positive saldo (lucro) from a
  negative saldo (prejuízo).
- **FR-012**: The system MUST show **a sacar** = the portion of prêmios conquistados
  for which the user has not yet requested a withdrawal, and MUST offer a path to
  withdraw when this amount is greater than zero. Because "a sacar" is an aggregate
  while withdrawals happen **per pool**, this path MUST route to the **existing**
  pending-prizes / per-pool withdrawal surface — it does **not** introduce a new
  aggregate withdrawal flow.
- **FR-013**: The system MUST show the user's **maior prêmio** (largest single prize
  won), and MUST hide it or show a neutral placeholder when the user has never won.
- **FR-014**: The system MUST present the **evolution of the user's saldo** across
  their pool history, so the user can see whether they are trending up or down.
- **FR-015**: The system MUST present an **empty state** for users with no
  (non-cancelled) pools that invites them to join or create a pool.
- **FR-016**: The system MUST surface a **compact summary on the home screen**
  (at minimum saldo and win/loss record) that links to the full "Meu desempenho"
  view, shown only to authenticated users.
- **FR-017**: Users MUST be able to reach "Meu desempenho" from the app's **primary
  navigation**.
- **FR-018**: All monetary values MUST be presented in **BRL**.
- **FR-019**: The displayed values MUST reflect the user's **current** data at view
  time and MUST reconcile with per-pool truth — specifically, saldo MUST equal the
  sum over the user's non-cancelled pools of (prize entitlement − entry paid), so
  the global view never contradicts what an individual pool shows.
- **FR-020** *(P3)*: Users MUST be able to **share a visual card** summarizing their
  career (saldo, record, aproveitamento, prizes) from the view.

### Key Entities *(include if feature involves data)*

- **Participation**: the fact that a user joined a specific pool; the basis for
  "participei" and the set of pools every other number is computed over.
- **Pool**: a bolão with a lifecycle state (em andamento vs. encerrado vs.
  cancelado) whose **final ranking** determines the winner(s) when it closes.
- **Entry payment**: money the user paid to join a pool (net of discount); the
  basis for "gastei".
- **Prize entitlement / vitória**: derived from a closed pool's ranking (1st place)
  and the pool's prize split; the basis for vitórias, prêmios conquistados, saldo,
  and maior prêmio.
- **Withdrawal**: a prize the user has requested to cash out; used to derive
  "a sacar" (entitlement minus what has been requested/withdrawn).
- **Performance summary** (computed, not stored as new truth): the aggregate the
  screen renders — saldo, participei, vitórias, derrotas, em andamento,
  aproveitamento, gastei, prêmios conquistados, a sacar, maior prêmio, and the
  saldo evolution.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can reach "Meu desempenho" from the home screen in **at most 2
  taps**.
- **SC-002**: On opening the screen, a user can tell **within 5 seconds** whether
  their career is in the positive or the negative (saldo is the single dominant
  element).
- **SC-003**: **100%** of displayed numbers reconcile with the underlying pools —
  in particular saldo equals the sum of (prize entitlement − entry paid) across the
  user's non-cancelled pools — verified by automated tests over seeded data.
- **SC-004**: A user with up to **50 pools** in their history sees their complete
  performance summary in **under 2 seconds**.
- **SC-005**: For **every** classification, vitórias + derrotas equals the number of
  the user's closed non-cancelled pools, and every pool where the user tied or held
  1st is counted as a vitória — verified by automated tests.
- **SC-006**: A user with an un-withdrawn prize **always** sees a non-zero "a sacar"
  amount together with a withdrawal path.
- **SC-007**: A user with no pools **always** sees an actionable empty state — never
  a blank screen, a spinner that never resolves, or an error.
- **SC-008**: **100%** of authenticated users can open the view (no paywall, no
  unlock step).

## Assumptions

- **"Decided" = closed**: a pool contributes to vitórias/derrotas only once it has
  reached the closed/encerrado state; open pools are "em andamento".
- **Winner is derived from ranking** (1st place), consistent with how the app
  already determines winners and pays prizes; there is no separately stored
  "winner" concept to introduce.
- **"A sacar" excludes prizes already in a withdrawal flow**: once a withdrawal has
  been requested for a won pool, that prize is no longer counted as "a sacar" (it is
  in progress), though it still counts in prêmios conquistados and saldo.
- **Saldo counts entitlement, not cash-in-hand**: saldo reflects what the user is
  owed minus what they paid, independent of whether prizes were actually withdrawn
  — matching the approved "prize entitlement" semantics.
- **Free pools count for record but not money**: a zero-entry pool can still be won
  or lost (affecting the record) but adds R$ 0 to gastei/prêmios/saldo.
- **The evolution curve** orders the user's pools by when they were settled/closed;
  precise time-bucketing (per pool vs. per day/month) is a design detail for the
  planning phase and does not change the final saldo.
- **No new monetary rules**: prize, fee, and winner math are reused as-is from the
  existing domain; this feature only reads and aggregates them.

## Out of Scope

- Cross-pool **palpite/accuracy** analytics or comparison against other users —
  that belongs to the per-pool "Estatísticas" (021) and is explicitly not what this
  feature is.
- Leaderboards ranking users **against each other** globally.
- Any change to withdrawal, prize, fee, or ranking calculation or to payment flows.
- Historical **charts of other users'** performance; this view is strictly the
  current user's own data.
- Data export (CSV/PDF) of the performance history.

## Dependencies

- Existing pool lifecycle (pending/active/closed/cancelled) and the moment a pool
  closes and its winners are determined.
- Existing entry-payment records (with coupon-adjusted amounts and completed/pending
  status) and the existing prize/withdrawal concepts.
- Existing authentication (the view is per-authenticated-user) and the home screen /
  primary navigation surfaces where the entry points live.
