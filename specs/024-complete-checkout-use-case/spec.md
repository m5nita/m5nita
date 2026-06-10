# Feature Specification: CompleteCheckoutUseCase — hexagonal payment-completion path (M3)

**Feature Branch**: `024-complete-checkout-use-case`
**Created**: 2026-06-10
**Status**: Draft
**Input**: Follow-up M3 from the pre-tournament audit (PR #86): move the payment-completion path out of the legacy `services/` layer into a hexagonal use case, with a unit-of-work port for transactional atomicity. **Zero observable behavior change.**

## Context & Problem

`handleCheckoutCompleted()` in `apps/api/src/services/payment.ts` is the function that decides "payment confirmed → user becomes a paying member". It performs three side effects in a single `db.transaction`:

1. **CAS claim**: marks the payment `completed` only if it was not already (`where id = ? and status <> 'completed' ... returning`). Zero rows → duplicate webhook → short-circuit.
2. **`stats_unlock` dispatch**: idempotent `INSERT … ON CONFLICT (user_id, pool_id) DO NOTHING` into `stats_unlock`.
3. **`entry` dispatch**: activates the pool when it is still `pending`, then idempotent `INSERT … ON CONFLICT (pool_id, user_id) DO NOTHING` into `pool_member`.

The code is correct, idempotent and tested — but it is architecture debt:

- It lives in `services/` (legacy layer) and imports `db` + schemas directly, bypassing the ports layer. It only passes guardrail G3 because it sits on the `BASELINE_SERVICES_ROUTES_USING_SCHEMA` allow-list (a tolerated pre-existing offender).
- It re-derives a domain rule that already exists: the inline `status === 'pending' → 'active'` SQL duplicates `Pool.activate()` on the `Pool` aggregate.

Callers: `infrastructure/http/routes/webhooks.ts` (Stripe), `services/infinitepay.ts` (`applyStatus`, reached by both the InfinitePay webhook and the `/payments/infinitepay/confirm` fallback), and `infrastructure/external/MockPaymentGateway.ts` (dev/test).

`handleCheckoutExpired()` in the same file has **no production caller** (only test mocks) — it is dead code.

## Goals

- Move the orchestration into `application/payment/CompleteCheckoutUseCase.ts`, depending only on ports.
- Introduce a **UnitOfWork port** (`application/ports/UnitOfWork.port.ts`) so atomicity is structural: the use case can only reach the repositories *through* the transaction.
- Reuse `Pool.activate()` (domain aggregate) instead of re-deriving the pending→active rule in SQL.
- Delete `services/payment.ts` entirely (completion path moves; expiry handler is dead code) and remove its entry from the G3 baseline.
- Keep every existing test green — the integration scenarios in `tests/integration/scenarios/infinitepay-confirm.test.ts` (real Postgres) are the behavior-parity proof and must pass unchanged.

## Non-Goals

- No change to `services/infinitepay.ts` beyond swapping the `handleCheckoutCompleted` call (its inline expiry update and its own G3 baseline entry stay).
- No separate `PoolMemberRepository`: membership is an operation of the Pool aggregate and `PoolRepository` already owns it (`addMember`, `isMember`, `removeMember`, …). Deliberate deviation from the original M3 sketch.
- No change to `Pool.activate()` semantics (stays unconditional; the "only when pending" guard lives in the use case, as it effectively does today).
- No database schema change, no migration, no frontend change.

## Design

### New files

| File | Content |
| --- | --- |
| `domain/payment/PaymentRepository.port.ts` | `ClaimedPayment` type (`id`, `poolId`, `userId`, `type: 'entry' \| 'stats_unlock' \| 'prize'`) + interface: `claimCompletion(paymentId)` (the CAS; `null` when already completed or missing) and `exists(paymentId)` (distinguishes "record missing" from "already completed" in the null branch) |
| `application/ports/UnitOfWork.port.ts` | `TransactionalRepositories { payments: PaymentRepository; pools: PoolRepository; statsUnlocks: StatsUnlockRepository }` + `UnitOfWork.run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T>`. Implementations MUST run `work` inside a single database transaction and roll back if it throws |
| `application/payment/CompleteCheckoutUseCase.ts` | The orchestration (see flow below), all inside one `unitOfWork.run(...)` |
| `application/payment/CompleteCheckoutUseCase.test.ts` | Unit tests with in-memory fakes (fake UoW = `run(work) => work(fakeRepos)`) |
| `infrastructure/persistence/DrizzlePaymentRepository.ts` | Implements the CAS with the same SQL shape as today: `update payment set status='completed', updated_at=now() where id = ? and status <> 'completed' returning …` |
| `infrastructure/persistence/DrizzleUnitOfWork.ts` | `db.transaction(tx => work({ payments: new DrizzlePaymentRepository(tx), pools: new DrizzlePoolRepository(tx), statsUnlocks: new DrizzleStatsUnlockRepository(tx) }))` |

### Use-case flow (behavior-identical to today)

```ts
await this.unitOfWork.run(async ({ payments, pools, statsUnlocks }) => {
  const claimed = await payments.claimCompletion(paymentId)
  if (!claimed) {
    if (!(await payments.exists(paymentId))) {
      // console.error + Sentry.captureMessage (record not found)
    } else {
      // console.log "already completed, skipping"
    }
    return
  }
  // Sentry.addBreadcrumb + console.log "marked completed"
  if (claimed.type === 'stats_unlock') {
    await statsUnlocks.grant({ userId, poolId, paymentId: claimed.id })
    return
  }
  if (claimed.type !== 'entry') return
  const pool = await pools.findById(claimed.poolId)
  if (pool && pool.status === PoolStatus.Pending) {
    pool.activate() // ← domain rule reused
    await pools.updateStatus(pool.id, pool.status)
  }
  const created = await pools.addMember(claimed.poolId, claimed.userId, claimed.id)
  if (created) {
    // console.log "poolMember created"
  }
})
```

Log lines and the Sentry breadcrumb/captureMessage keep today's exact messages. `console.log` and `@sentry/node` package imports are allowed in `application/` (G3 forbids only relative imports into outer layers; `SyncFixturesUseCase` et al. already log).

### Changes to existing code

- **`db/client.ts`**: export `DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]` and `DbExecutor = typeof db | DbTransaction`. The constructors of `DrizzlePoolRepository`, `DrizzleStatsUnlockRepository` and `DrizzlePaymentRepository` accept `DbExecutor` so the UnitOfWork can bind them to a transaction. (Other repositories are untouched.)
- **`PoolRepository.addMember`** (port + Drizzle impl) changes contract: from plain insert returning `void` (currently **zero production callers** — the only production writer of `pool_member` is the legacy SQL being replaced) to idempotent insert (`onConflictDoNothing` on `(pool_id, user_id)`) returning `Promise<boolean>` — `true` when the membership row was created. Preserves today's conditional "poolMember created" log.
- **`StatsUnlockRepository`** (port + Drizzle impl) gains `grant({ userId, poolId, paymentId }): Promise<void>` — idempotent insert (`onConflictDoNothing` on `(user_id, pool_id)`). The port's doc comment (which references `services/payment.ts`) is updated to point at the use case.
- **`container.ts`**: build `DrizzleUnitOfWork(db)` + `completeCheckoutUseCase = new CompleteCheckoutUseCase(unitOfWork)`; expose it in the container object. `buildPaymentGateway` gains the use case as a parameter and passes it to `MockPaymentGateway`.
- **Caller swaps** (all three):
  - `webhooks.ts` (Stripe): `getContainer().completeCheckoutUseCase.execute({ paymentId })` — the pattern every other route already uses.
  - `services/infinitepay.ts` (`applyStatus`): same call — module-top import of `getContainer`, but *invoked* lazily inside the function (the `lib/telegram.ts` precedent: never hoist `getContainer()` to module scope). No import cycle — `container.ts` does not import `services/infinitepay.ts`.
  - `MockPaymentGateway`: receives `CompleteCheckoutUseCase` via constructor and calls `execute` after inserting the pending payment. Doc comment updated.

### Deletions

- `apps/api/src/services/payment.ts` — deleted. `handleCheckoutCompleted` moves to the use case; `handleCheckoutExpired` is dead code (no production caller).
- `apps/api/src/services/payment.test.ts` — superseded by `CompleteCheckoutUseCase.test.ts` (same scenarios, ports-level fakes instead of Drizzle-chain mocks).
- `'services/payment.ts'` entry in `BASELINE_SERVICES_ROUTES_USING_SCHEMA` (`_architecture.test.ts`) — baseline shrinks by one.
- The now-dangling `vi.mock('.../services/payment')` blocks in `webhooks.test.ts`, `pools.test.ts`, `pools-join.test.ts`, `pools-admin.test.ts` (with the module deleted they would fail resolution). `webhooks.test.ts` mocks the container instead (the `users.test.ts` / `predictions.test.ts` pattern).

## Behavior-parity contract *(acceptance scenarios)*

1. **Given** a `pending` `entry` payment for a `pending` pool, **When** the use case runs, **Then** the payment becomes `completed`, the pool becomes `active`, and one `pool_member` row exists — all committed atomically (any step throwing rolls back all three).
2. **Given** a payment already `completed` (duplicate webhook), **When** the use case runs again, **Then** it short-circuits: no pool read, no member insert, no error (logs "already completed, skipping").
3. **Given** a paymentId that does not exist, **When** the use case runs, **Then** it logs an error and reports to Sentry (`captureMessage`), and performs no writes beyond the no-op CAS.
4. **Given** a `stats_unlock` payment, **When** the use case runs, **Then** a `stats_unlock` entitlement row is granted idempotently and **no** pool activation or membership occurs.
5. **Given** a payment of any other type (e.g. `prize`), **When** the use case runs, **Then** only the CAS happens — no pool read, no member insert.
6. **Given** an `entry` payment for a pool already `active`, **When** the use case runs, **Then** the pool status is not rewritten (no `updateStatus` call) and membership is still created.
7. **Given** the member row already exists (`onConflictDoNothing` returns nothing), **When** the use case runs, **Then** it resolves without error.
8. **Given** the existing integration suite (`infinitepay-confirm.test.ts`: confirm fallback grants completed + active + single member; late webhook after confirm is a no-op), **When** it runs against real Postgres, **Then** it passes **unchanged** — this is the end-to-end parity proof.

## Test plan (TDD)

1. **Red**: write `CompleteCheckoutUseCase.test.ts` covering scenarios 1–7 above with in-memory fakes (the fake UnitOfWork simply invokes `work` with the fakes — atomicity is the adapter's concern). Scenarios 4 and 6 are *new* unit coverage (today's `payment.test.ts` does not exercise the `stats_unlock` branch nor the already-active pool).
2. **Green**: implement ports, use case, adapters, wiring, caller swaps; delete the legacy module and its test; fix the dangling mocks.
3. **Verify**: full unit suite (`pnpm test`), integration suite against Postgres 5433 (`pnpm --filter @m5nita/api test:integration`), guardrails (`pnpm check:leaks`, `pnpm check:arch`), build (`pnpm build`).

## Risks & mitigations

- **Risk**: subtle atomicity loss (e.g. a repo silently using the module-level `db` instead of the bound `tx`). **Mitigation**: the UnitOfWork constructs the transactional repo instances itself from `tx`; the use case has no other path to the database. The integration suite asserts the committed end state on real Postgres.
- **Risk**: `addMember` contract change breaking another caller. **Mitigation**: verified zero production callers today (only the port, its Drizzle impl, and test fakes reference it); the compiler flags the return-type change in any fake.
- **Risk**: deleting `services/payment.ts` breaks test-module resolution. **Mitigation**: all four `vi.mock` sites are enumerated above and updated in the same commit.
