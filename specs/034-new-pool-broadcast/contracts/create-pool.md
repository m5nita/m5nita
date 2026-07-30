# Contract delta: `POST /api/pools` — `notifyEveryone`

The only change to an existing endpoint. Everything else about
`POST /api/pools` (name, entry fee, competition, scope, coupon) is untouched.

## Request body — added field

```jsonc
{
  "name": "Bolão da firma",
  "entryFee": 5000,
  "competitionId": "…uuid…",
  "matchdayFrom": 5,
  "matchdayTo": 8,
  "notifyEveryone": true      // NEW — optional, defaults to false
}
```

`createPoolSchema` in `packages/shared/src/schemas/index.ts` gains:

```ts
notifyEveryone: z.boolean().optional().default(false),
```

- **Optional and defaulting to `false`** so every existing client — and every
  existing test — keeps working unchanged, and so a pool is never announced by
  accident (FR-001).
- No new refinement: the field is orthogonal to the existing "single match XOR
  matchday range" rule.

## Behaviour

- Persisted as `pool.notify_on_create` by `CreatePoolUseCase` (FR-002). It is
  written in the same insert as the rest of the pool, so it survives the checkout
  round-trip without any session or cache state.
- **Nothing is sent at this point.** The pool is created `pending`; the
  announcement happens only when the entry payment is confirmed and the pool is
  activated (FR-003).
- The response shape is unchanged — the front end does not need the flag back.

## Announcement trigger (internal, no HTTP surface)

For completeness, since no endpoint exposes it:

```text
payment confirmed (any gateway)
  └─ CompleteCheckoutUseCase.execute({ paymentId })
       ├─ unitOfWork.run(...)  → CAS claim, activate pool, add member   [transaction]
       │     returns the id of the pool it activated, or null
       └─ after commit: if an id came back → onPoolActivated(poolId)     [best effort]
             └─ AnnounceNewPoolUseCase.execute({ poolId })
                  ├─ pool detail; return early unless notifyOnCreate
                  ├─ scope wording via PoolScope.label(fixture?)
                  ├─ audience: every user except pool.ownerId
                  └─ NotificationService.notifyNewPool(...)
                       └─ per recipient: preference gate → push, else Telegram
```

- `onPoolActivated` is an optional `(poolId: string) => Promise<void>` constructor
  hook on `CompleteCheckoutUseCase`, wired in `container.ts`. The application layer
  therefore never imports a notification adapter.
- The call is wrapped in `try/catch`: a failure is logged and swallowed, never
  propagated to the webhook (FR-010, SC-006).
- Because it runs only for the caller that won the CAS claim, a duplicated webhook
  cannot announce twice (FR-004).

## Notification payloads

**Push** (`PushPayload`, consumed by the existing service worker):

```jsonc
{
  "title": "Novo bolão no m5nita",
  "body": "Igor criou \"Bolão da firma\" — Brasileirão Série A · Rodadas 5 a 8 · entrada R$ 50,00",
  "url": "/invite/ABC123",
  "tag": "new-pool-<poolId>"
}
```

**Telegram**: the same sentence, followed by the absolute invite URL built from the
web origin the other Telegram messages already use.

- Only the creator's **first name** appears (FR-012).
- `tag` keeps a device from stacking duplicates of the same pool.
- Scope wording comes from `PoolScope.label(fixture?)`: `Campeonato completo`,
  `Rodada 5`, `Rodadas 5 a 8`, `Flamengo x Palmeiras`, or `Jogo único` when a
  single-match pool's fixture cannot be loaded.
