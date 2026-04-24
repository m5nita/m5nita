# Prize Withdrawal UX — Design

**Date:** 2026-04-23
**Status:** Draft for review
**Related code:**
- `apps/api/src/infrastructure/http/routes/pools.ts` — `GET /api/pools/:poolId/prize`, `POST /api/pools/:poolId/prize/withdraw`
- `apps/api/src/application/pool/GetPrizeInfoUseCase.ts`
- `apps/api/src/infrastructure/external/TelegramNotificationService.ts`
- `apps/web/src/components/pool/PrizeWithdrawal.tsx`
- `apps/web/src/routes/pools/$poolId/ranking.tsx`
- `apps/web/src/routes/index.tsx`
- `apps/web/src/routes/pools/$poolId/index.tsx` (pool home)

## Problem

Today the prize-withdrawal CTA lives inside `/pools/:poolId/ranking` and the Telegram notification to the winner does not include a link to the app. Two concrete gaps:

1. Winners have no direct path from Telegram back to the withdrawal form.
2. Winners have to navigate to the ranking tab to find the form. It should surface prominently from the pool home and the app home, and the result of the pool (who won, how much) should be visible to every member from the pool home.

A secondary wish: Telegram's in-app browser intercepts links by default. We cannot force the system browser from the bot side, but we can prefer link formats that give the user the option to "open externally."

## Goals

- Winners discover and act on the withdrawal flow without digging.
- The pool result (winner + prize) is public to all members on the pool home once the pool closes.
- Telegram messages include the app URL in a format that gives users the best chance of opening it in their system browser.
- No schema changes. Single new endpoint. Existing form logic is reused, not duplicated.

## Non-goals

- Forcing Telegram to open external browser (not controllable from the bot).
- Changing the withdrawal approval flow (admin-marks-paid callback stays as-is).
- Redesigning the ranking page beyond removing the withdrawal block.

## Design

### API

**New endpoint:** `GET /api/me/pending-prizes`

Returns pools where the authenticated user is a winner of a `closed` pool and has not yet submitted a withdrawal request.

Response shape:
```ts
{
  items: Array<{
    poolId: string;
    poolName: string;
    amount: number;       // in centavos, per-winner share
    winnersCount: number; // for future display; may be unused initially
  }>;
}
```

Implementation reuses `GetPrizeInfoUseCase` logic: iterate the user's memberships of `closed` pools, compute winners from ranking, include only pools where the user is a winner AND `prizeWithdrawalRepo.findByPoolAndUser` returns null.

**Existing endpoints — behavior changes:**
- `GET /api/pools/:poolId/prize` — if access is currently restricted to winners only, relax to any member of the pool. Response already carries `winners[]` and `prize` fields needed to render the public "pool result" block. The `alreadyRequested`/withdrawal-status field remains populated only when the requester is a winner (or is computed relative to the requester; non-winners don't need it).
- `POST /api/pools/:poolId/prize/withdraw` — unchanged. Authorization stays restricted to winners.

### Web

**Remove** the `<PrizeWithdrawal>` render from `apps/web/src/routes/pools/$poolId/ranking.tsx`. The ranking page becomes ranking-only.

**Refactor:** extract a presentational `PrizeWithdrawalForm` component (inputs + submit + `useMutation` to `POST /prize/withdraw`) from the current `PrizeWithdrawal.tsx`. Props: `poolId`, optional `onSuccess`. The container decides which queries to invalidate via `onSuccess`.

**Pool home (`apps/web/src/routes/pools/$poolId/index.tsx`) — new "Pool result" block**

Rendered when `pool.status === 'closed'`. Public to all pool members. Shows:
- Title: "Bolão finalizado"
- Winner(s) with name and per-winner prize amount
- For the logged-in user, if they are a winner:
  - If no withdrawal yet → `PrizeWithdrawalForm` inline (invalidates `/me/pending-prizes` and `/pools/:id/prize` on success)
  - If withdrawal exists → status line ("Retirada solicitada" / "Paga") inline in the same block
- Non-winners see only winners + amounts

Reuses `GET /api/pools/:poolId/prize`. Keeps `PrizeWithdrawal.tsx` as the container living on the pool home (moved, not duplicated).

**App home (`apps/web/src/routes/index.tsx`) — new "Prêmios a retirar" section**

At the top of the home, above the active/finished pool lists. Rendered only when `GET /api/me/pending-prizes` returns at least one item. One card per item: pool name, prize amount, inline `PrizeWithdrawalForm`. On successful submit, invalidates `/me/pending-prizes` → card disappears.

If the list is empty, the section is not rendered (no placeholder, no header).

### Telegram

**Winner notification** (`TelegramNotificationService.notifyWinners`) — new body:
```
🏆 *Parabéns, {name}!*
Você venceu o bolão *{poolName}*!
Seu prêmio: *{formattedPrize}*

Acesse para solicitar a retirada:
{APP_URL}
```

Notes:
- URL is bare text, not a Markdown `[label](url)` link. Goal: give clients the chance to present "Open in browser."
- Standardize the existing prediction-reminder message to the same bare-URL pattern (audit what it does today; adjust only if it wraps the URL in a Markdown link).
- If `APP_URL` is missing at runtime, log an error and send the message without the final two lines rather than throwing.

No other Telegram content is in scope.

## User-visible flows

**Winner, via Telegram:**
1. Receives message with bare URL to `APP_URL`.
2. Opens app → app home shows "Prêmios a retirar" section with a card for this pool.
3. Fills PIX key inline, submits. Card disappears. Status "Retirada solicitada" visible from pool home.

**Winner, via direct app access:**
1. Opens pool home → "Bolão finalizado" block with inline form.
2. OR opens app home → same outcome via top-of-home section.
3. Either surface submits to the same endpoint; both invalidate both queries.

**Non-winner member:**
1. Opens pool home → "Bolão finalizado" block lists winner(s) and amount(s). No form, no status of other people's withdrawals.

## Seed data (local dev)

Extend `apps/api/src/db/seed.ts` with a new "Prize scenarios" section that creates additional closed pools so every branch of the new UI can be exercised against a local database. All scenarios use the existing seed users (Igor = `user-1`, Maria = `user-2`, Pedro = `user-3`).

Scenarios to seed:

1. **Igor won, no withdrawal yet.** Closed pool, Igor is sole winner. No `prize_withdrawal` row. Exercises: `/me/pending-prizes` returns this pool; pool home shows inline form; app home shows card.
2. **Igor won, withdrawal pending.** Closed pool, Igor is sole winner. `prize_withdrawal` row exists with status `pending`. Exercises: `/me/pending-prizes` excludes this pool; pool home shows "Retirada solicitada" status; app home has no card for it.
3. **Maria won, Igor did not.** Closed pool with all three members. Maria is sole winner. Exercises: non-winner view on pool home (Igor sees result but no form); no card on Igor's app home.
4. **Tie between Igor and Pedro.** Closed pool, two winners split the prize, no withdrawals yet. Exercises: multi-winner rendering on pool home and app home; prize-split math.

Scenarios 1 and 4 together mean Igor has ≥2 pending prizes, which is what's needed to exercise the "multiple cards" layout on the app home.

Each seeded closed pool requires: `pool.status = 'closed'`, a competition (reuse the existing one or add lightweight new ones), matches all with `status = 'finished'` and final scores, predictions per member that produce the intended ranking, and an entry `payment` + `poolMember` per member. Keep each scenario minimal (1–2 matches is enough to drive the ranking).

Seed script remains non-idempotent, same as today — developers re-running the seed hit duplicate-key errors (out of scope to fix here).

## Testing

**API**
- `GET /api/me/pending-prizes`: no closed pools → empty; one closed pool won, no request → 1 item; already requested → 0 items; multiple pools with mix of states → only unsettled ones.
- `GET /api/pools/:poolId/prize` readable by non-winner member (if authorization changed).

**Telegram**
- Unit test on `notifyWinners`: rendered message contains `APP_URL` on its own line, no Markdown brackets.
- Unit test: missing `APP_URL` does not throw; message is still sent.

**Web**
- Smoke test that `PrizeWithdrawalForm` success calls `onSuccess` and submit is wired.
- Existing tests for `PrizeWithdrawal` (if any) updated to its new home on the pool page.

## Out of scope

- Changes to the admin-side payment callback.
- Email or WhatsApp notifications.
- Visual overhaul of the ranking page beyond removal of the withdrawal block.
- A "dismiss" action on home cards (cards disappear automatically post-submit).

## Risks / open questions

- Authorization relaxation on `GET /pools/:poolId/prize` needs verification — if the endpoint currently leaks any private info (e.g., a specific winner's withdrawal status for other members), the response must be shaped to expose only public fields (winners[] + prize + optional status-for-requester).
- `APP_URL` env presence in staging/production must be verified before release; otherwise the new Telegram message degrades to the pre-change content.
