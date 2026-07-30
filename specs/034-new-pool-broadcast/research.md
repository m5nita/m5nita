# Phase 0 Research: "Novo bolão" broadcast + notification preferences

No `NEEDS CLARIFICATION` markers survived the spec. This file records the
decisions that shaped the plan, the evidence behind them, and what was rejected.

## Production baseline (measured, 2026-07-29)

Read from the production database before designing, because every sizing decision
depends on it:

| Fact | Value |
|---|---|
| Registered users | 58 |
| Users with ≥1 push subscription | 6 (7 subscriptions) |
| Linked Telegram chats | 12 |
| Pools: whole-competition / range / single-match | 3 / 21 / 5 |

**Consequence**: a broadcast reaches at most ~16 people today. Anything shaped for
thousands of recipients (queue, batching, worker) would be pure ceremony.

## Decision 1 — Announce after the payment commits, inside `CompleteCheckoutUseCase`

**Decision**: the announcement is triggered from `CompleteCheckoutUseCase`, after
`unitOfWork.run(...)` resolves, only when that call actually activated a pool.

**Rationale**:
- A pool is `pending` until its entry payment is confirmed. Announcing earlier
  would invite people into pools that may never exist (FR-003).
- It is the single convergence point for all three payment paths —
  `InfinitePayPaymentGateway` (via `services/infinitepay.ts`), the Stripe webhook
  (`routes/webhooks.ts`) and `MockPaymentGateway` — so one seam covers dev and
  production without three call sites.
- At-most-once falls out of the existing `payments.claimCompletion` CAS: only the
  caller that wins the claim reaches the post-commit step, so a duplicated webhook
  cannot announce twice (FR-004) and **no `announced_at` marker is needed**.
- Running *after* the commit is essential: inside the transaction, a later
  rollback would leave notifications sent for a pool that does not exist.

**Alternatives rejected**:
- *Flag + cron sweeper*: retryable and crash-safe, but adds a scheduled job to a
  3 vCPU box, an extra control column, and up to a minute of delay — for ~16
  recipients. Rejected as unjustified complexity; a lost announcement is a
  tolerable failure mode here (FR-010).
- *Announce at pool creation*: violates FR-003.
- *Fire from each of the three gateway call sites*: triplicated logic, guaranteed
  to drift.

## Decision 2 — Recipients resolved in the use case, channel and preference in the router

**Decision**: `AnnounceNewPoolUseCase` decides *who* (all users except the
creator) and *what* (copy inputs). `CompositeNotificationService` decides *how*
(push → Telegram) **and** applies the preference check.

**Rationale**: FR-017 demands one place for the preference rule. The composite is
already the only component that routes a notification to a channel for a given
user, so gating there automatically covers reminders, per-match points and the
winner notification without touching `reminderJob`, `calcPoints` or
`closePoolsJob`. Putting the filter in the use case as well would create the
second copy FR-017 exists to prevent.

**Alternatives rejected**:
- *Filter recipients in SQL inside the audience query*: one query fewer, but the
  rule would then live in SQL for the broadcast and in TypeScript for the other
  three types.
- *Filter in each job*: four copies, four chances to forget.

## Decision 3 — Catalog table + one override row per `(user, type)`

**Decision**: `notification_type` (catalog) + `notification_preference`
(overrides), with absence of a row meaning "use the catalog default".

**Rationale**:
- A boolean column per type means DDL for every future toggle. The catalog makes
  adding a type an `INSERT` (FR-020) — that was the explicit requirement.
- Storing only divergences means no backfill for the 58 existing users (FR-014),
  and "default on" changes behaviour for everyone by editing one catalog row.
- The catalog carries the user-facing label and description, so the settings screen
  can render a type it has never heard of.

**Alternatives rejected**:
- *Column per type*: rejected by the requester for exactly the DDL reason above.
- *JSONB blob on `user`*: no referential integrity, no way to list available types,
  and the `user` table belongs to Better Auth.
- *Codes-only catalog with labels in a TypeScript map*: keeps copy edits out of
  SQL, but then a new type still needs a front-end deploy, breaking FR-020.

## Decision 4 — The "cannot be turned off" invariant lives in the domain, not the data

**Decision**: `notification_type.opt_outable` is *data*; the enforcement is a
method on the `NotificationType` value object:
`resolveEnabled(override) => optOutable ? (override ?? defaultEnabled) : true`.

**Rationale**: the constitution puts business rules in the domain. A stale
`enabled = false` row — left behind if a type is ever made non-opt-outable — must
not silence a prize notification (spec US2 scenario 5). Encoding the rule in the VO
makes that impossible regardless of what the table holds, and makes it unit
testable without a database.

## Decision 5 — In-process cache for the catalog, one batched query for overrides

**Decision**: the Drizzle adapter caches `listTypes()` in a module-level `Map`
(same approach as the existing ranking and stats caches). Overrides for a whole
broadcast are fetched with a single `user_id = ANY(...)` query.

**Rationale**: the catalog is read on every notification and changes approximately
never. Without the cache, a broadcast would issue one catalog read per recipient.
With it, a broadcast costs 2 queries total (audience + overrides) regardless of
recipient count — which is what keeps SC-001 comfortable on a 3 vCPU box.

## Decision 6 — Scope wording comes from `PoolScope.label(fixture?)`

**Decision**: a new method on the existing `PoolScope` value object returns
`Campeonato completo`, `Rodada {N}`, `Rodadas {N} a {M}`, or `{Casa} x {Visitante}`
when a fixture is supplied, falling back to `Jogo único`.

**Rationale**: the repository's `check:leaks` guardrail (G2) specifically hunts
scope-branching outside the domain, and the front end already duplicates this
wording in `PoolHub.matchdayLabel`. Putting it on the VO gives the notification
copy a single source and makes the fixture-missing fallback (spec edge case) a
tested branch rather than an `if` in a message builder.

**Alternative rejected**: building the string in the notification adapter — it
would be the third copy of the same wording rule.

## Decision 7 — No email for this notification, no per-creator cap

Both are direct product decisions from the requester, recorded here so a future
reader does not "fix" them: email is deliberately excluded from the channel chain
for the announcement (FR-006), and any creator may announce any number of pools
(FR-011). The per-pool at-most-once guarantee is the only limit.

## Decision 8 — Optimistic toggle in the settings UI

**Decision**: the switch flips immediately, the request goes out, and a failure
rolls the switch back with an inline pt-BR message.

**Rationale**: constitution III requires visible feedback under 200 ms for any
interaction; a round trip to toggle a checkbox would otherwise feel broken. The
authoritative state is re-fetched on invalidation, so a rollback cannot leave the
screen lying.
