# Feature Specification: Celebrations & Shareable Ranking Image

**Branch:** `feat/029-celebrations-share-ranking`
**Created:** 2026-06-27
**Status:** Draft (awaiting review)

## Summary

Two front-focused engagement features for the m5nita pool PWA:

1. **Celebrations** — the product's three dopamine peaks (cravar o placar exato,
   confirmar o pagamento, ganhar o prêmio) are currently silent. Add confetti +
   haptics so they feel like wins, not bank receipts.
2. **Shareable ranking image** — there is no viral surface in the app
   (`navigator.share` is used nowhere). Replace the redundant "Atualizar ranking"
   button with a **Compartilhar** action that renders the pool ranking as a
   Story-format image and shares it via the native share sheet (WhatsApp,
   Instagram Stories, etc.), carrying `m5nita.com` along as a growth hook.

Both reuse existing infrastructure and add **no new runtime dependencies**.

## Clarifications

### Session 2026-06-27

- **Confetti trigger model:** fire **once per event**, deduplicated in
  `localStorage`, NOT on every page load. If several exact-score results land at
  once, fire a **single** burst, not one per match.
- **Celebration moments:** all three — exact score (predictions screen),
  payment success, prize win (withdrawal).
- **Mata-mata (knockout bracket): OUT OF SCOPE.** The existing "MATA-MATA" filter
  on the predictions screen already lists knockout matches by phase, and
  `ScoreInput`'s `AdvanceResultNote` already shows penalties + who advanced. The
  dead `Bracket.tsx` is not wired in here.
- **Share = replace, not add:** the "Atualizar ranking" button is a manual
  `refetch()` already covered by auto-refresh (on mount, on window focus, and
  live-poll). It is replaced by the share button — no refresh capability is lost.
- **Image rendering:** reuse the server-side `satori` + `@resvg/resvg-js`
  pipeline in `apps/api/src/lib/ogImage.ts` (brand fonts + colors already loaded).
  **No new dependency.**
- **No QR code.**
- **Image format:** Story / vertical, **1080 × 1350** base. Shows **all** pool
  participants; for large pools the rendered height extends below 1350 (width
  stays 1080) so everyone fits while staying vertical.
- **Share privacy:** the ranking is member-only. The image route is
  authenticated and member-gated; the client fetches the PNG blob with
  credentials and shares the **file** — no public URL exposes the standings.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Cravar o placar exato is celebrated (Priority: P1)

A member opens the predictions screen after a match they predicted exactly
(category 10) has finished. The card shows a "🎯 PLACAR EXATO" badge, a single
confetti burst plays once, and the device vibrates briefly. Re-opening the screen
does **not** replay the celebration for that match.

**Acceptance:**
- Confetti + badge + vibration fire exactly once per `(poolId, matchId)`.
- Multiple newly-discovered exact scores in one view produce a single burst.
- With `prefers-reduced-motion`, no animation and no vibration occur (the badge
  still shows).

### User Story 2 — Payment confirmed feels like a welcome (Priority: P2)

After paying the entry, the member lands on the success state. An animated check,
a confetti burst, and warmer copy ("Você está dentro! 🎉") replace the previously
static panel. The CTA still routes back to the pool.

**Acceptance:**
- Celebration plays only on the `completed` success state (never on
  checking / expired / error).
- Reduced-motion users get the warmer copy and CTA, no animation.

### User Story 3 — Winning the prize is glorious (Priority: P2)

A member opens a closed pool they won. Above the withdrawal form, a hero block
"VOCÊ GANHOU 🏆" shows the prize amount large, with a one-time confetti burst.

**Acceptance:**
- Hero + confetti show only when `prize.isWinner` is true.
- Confetti fires once per pool (localStorage dedup); the hero block persists.
- The existing withdrawal form / states are unchanged below the hero.

### User Story 4 — Share the ranking (Priority: P1)

On the ranking tab, the member taps **Compartilhar**. A Story-format image of the
pool ranking is generated and the native share sheet opens (WhatsApp, Stories…).
The shared text includes `m5nita.com`.

**Acceptance:**
- Tapping share generates and shares a 1080-wide vertical PNG of the ranking.
- Non-members receive 403 from the image route; the button only renders for
  members (it lives inside the member-gated ranking tab).
- On browsers without `navigator.canShare({ files })`, a fallback downloads the
  PNG and copies a message with the pool link.

### Edge Cases

- Confetti dedup set in `localStorage` grows unbounded → cap or namespace by key;
  acceptable to keep simple (one short string per celebrated event).
- Pool with 0 graded predictions → no exact-score celebration; ranking image
  renders with the "sem resultados" state still meaningful (positions tied).
- Very large pool (e.g., 50 members) → ranking image height extends; row size
  stays legible (no shrink-to-fit below a readable minimum).
- `localStorage` unavailable (private mode edge) → celebrations may replay;
  degrade gracefully (never throw).
- Share sheet dismissed / `AbortError` → no error surfaced to the user.

## Requirements *(mandatory)*

### Functional Requirements

**Shared celebration primitives**
- **FR-001** A `<Confetti />` component MUST render a brand-colored particle
  burst using only CSS/SVG (no dependency), auto-unmount after the animation, and
  render nothing when `prefers-reduced-motion: reduce` is set.
- **FR-002** A `useCelebrateOnce(key)` hook MUST return whether an event has been
  celebrated and mark it celebrated, persisting keys in `localStorage`, and MUST
  never throw if storage is unavailable.
- **FR-003** A `vibrate(pattern)` helper MUST call `navigator.vibrate` when
  available, be a no-op otherwise, and skip when reduced-motion is set.

**Celebrations**
- **FR-004** On the predictions screen, when a finished match has the viewer's
  prediction graded `category === 10` and not yet celebrated, the app MUST show a
  "PLACAR EXATO" badge on that card, fire one confetti burst, and vibrate — once
  per `(poolId, matchId)`.
- **FR-005** Concurrent newly-discovered exact scores MUST coalesce into a single
  burst.
- **FR-006** The payment-success `completed` state MUST show an animated check +
  confetti + celebratory copy; other states are unchanged.
- **FR-007** `PrizeWithdrawal` MUST show a "VOCÊ GANHOU 🏆" hero (prize amount
  prominent) with a one-time confetti when `isWinner`, above the existing form.

**Shareable ranking image**
- **FR-008** The "Atualizar ranking" button MUST be replaced by a "Compartilhar"
  button on the ranking tab.
- **FR-009** A new authenticated, member-gated API route MUST return a PNG of the
  pool ranking (1080 wide, vertical), rendered via the existing satori/resvg
  pipeline, with a TTL cache keyed so standings changes bust it.
- **FR-010** The image MUST show: header ("RANKING · {pool name}") + competition,
  **all** participants (position · name · points, with 🥇🥈🥉 on the top 3, the
  viewer's row highlighted), the accumulated prize, and a "m5nita.com" footer.
- **FR-011** Tapping share MUST fetch the PNG with credentials and call
  `navigator.share({ files, title, text })` with the pool link in `text`;
  dismissals/`AbortError` MUST be swallowed.
- **FR-012** When file-sharing is unsupported, a fallback MUST download the PNG
  and copy a share message including the pool link.

### Key Entities

- **Celebrated-events set** — client-only, `localStorage`; opaque string keys
  (e.g., `exact:{poolId}:{matchId}`, `win:{poolId}`). No DB.
- **Ranking image** — derived render of existing ranking data; no new table.

**No database schema changes. No new runtime dependencies.**

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** Each celebration fires at most once per event across reloads.
- **SC-002** Zero new runtime dependencies added (verified in `package.json`).
- **SC-003** `prefers-reduced-motion` fully suppresses animation + vibration.
- **SC-004** The ranking image route returns 403 to non-members and a valid PNG
  to members.
- **SC-005** Sharing works on a mobile browser supporting `navigator.share`
  (file), with a graceful fallback elsewhere.
- **SC-006** All existing tests stay green; new logic (dedup, status→celebration
  mapping, route auth) is covered.

## Assumptions

- Bolões are typically small friend groups, so "all participants" fits a vertical
  image; large pools extend height rather than paginate.
- The satori pipeline can be extended with a second template without refactor.
- Sharing a PNG file (not a public URL) is sufficient for virality; the growth
  hook is the `m5nita.com` text + brand on the image.

## Dependencies

- Existing: `satori`, `@resvg/resvg-js`, brand fonts in `apps/api/assets/fonts`,
  the `ogImage.ts` renderer, the ranking read path (`getPoolRanking`), and the
  TTL cache helper.
- No external services, no new packages.

## Out of Scope

- Knockout bracket rendering / wiring `Bracket.tsx` (existing MATA-MATA filter
  suffices).
- Penalty display on the global `/matches` `MatchCard` (separate, optional).
- QR codes.
- A personal "result card" distinct from the ranking image.
- Server push / notifications / recurring league (separate retention bets).
