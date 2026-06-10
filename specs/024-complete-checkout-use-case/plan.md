# CompleteCheckoutUseCase (M3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the payment-completion path (`handleCheckoutCompleted`) from the legacy `services/` layer into a hexagonal `CompleteCheckoutUseCase` with a UnitOfWork port — zero observable behavior change.

**Architecture:** A `UnitOfWork` port in `application/ports/` opens one database transaction and hands the use case three repositories bound to it (`payments`, `pools`, `statsUnlocks`). The use case orchestrates the CAS claim → type dispatch → `Pool.activate()` → idempotent membership insert; the Drizzle adapter (`DrizzleUnitOfWork`) supplies atomicity. All three callers (Stripe webhook, InfinitePay confirm, MockPaymentGateway) switch to the use case, and `services/payment.ts` is deleted (its `handleCheckoutExpired` is dead code).

**Tech Stack:** TypeScript 5 (strict), Hono, Drizzle ORM (postgres-js), Vitest 3, Biome.

**Spec:** `specs/024-complete-checkout-use-case/spec.md` (approved). Branch: `024-complete-checkout-use-case` (already checked out).

---

## Repo facts the executor must know

- **The pre-commit hook runs `biome check`, `pnpm -r typecheck` and the FULL unit test suite on every `git commit`** (~60–90 s). Every commit below is therefore a full verification gate. NEVER use `--no-verify`.
- Run a single test file from the repo root: `pnpm --filter @m5nita/api exec vitest run <path relative to apps/api>`.
- Guardrails: `pnpm check:leaks` (G2), `pnpm check:arch` (G3 dependency-cruiser). The Vitest twin of G3 is `apps/api/src/_architecture.test.ts` (runs with the unit suite).
- Integration tests need the `postgres-test` container (port 5433): `docker compose up -d postgres-test` from the repo root, then
  `DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test pnpm --filter @m5nita/api test:integration`.
- All commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Behavior parity is sacred: log strings and the Sentry breadcrumb message (`'handleCheckoutCompleted claimed'`) are kept byte-identical to today's so dashboards/alerts don't shift.

## File map

| Action | File |
| --- | --- |
| Create | `apps/api/src/domain/payment/PaymentRepository.port.ts` |
| Create | `apps/api/src/application/ports/UnitOfWork.port.ts` |
| Create | `apps/api/src/application/payment/CompleteCheckoutUseCase.ts` + `.test.ts` |
| Create | `apps/api/src/infrastructure/persistence/DrizzlePaymentRepository.ts` + `.test.ts` |
| Create | `apps/api/src/infrastructure/persistence/DrizzleUnitOfWork.ts` + `.test.ts` |
| Create | `apps/api/src/infrastructure/persistence/DrizzleStatsUnlockRepository.test.ts` |
| Modify | `apps/api/src/db/client.ts` (DbTransaction/DbExecutor types) |
| Modify | `apps/api/src/domain/pool/PoolRepository.port.ts` (`addMember` → `Promise<boolean>`) |
| Modify | `apps/api/src/infrastructure/persistence/DrizzlePoolRepository.ts` (+ `.test.ts`) |
| Modify | `apps/api/src/domain/stats/StatsUnlockRepository.port.ts` (+ `grant`) |
| Modify | `apps/api/src/infrastructure/persistence/DrizzleStatsUnlockRepository.ts` |
| Modify | `apps/api/src/container.ts` |
| Modify | `apps/api/src/infrastructure/external/MockPaymentGateway.ts` |
| Modify | `apps/api/src/infrastructure/http/routes/webhooks.ts` (+ `.test.ts`) |
| Modify | `apps/api/src/services/infinitepay.ts` |
| Modify | `apps/api/src/_architecture.test.ts` (remove baseline entry) |
| Modify | `apps/api/src/infrastructure/http/routes/pools.test.ts`, `pools-join.test.ts`, `pools-admin.test.ts` (drop dead `vi.mock`) |
| Delete | `apps/api/src/services/payment.ts`, `apps/api/src/services/payment.test.ts` |

---

### Task 1: Completion-ready repository contracts (idempotent `addMember`, `StatsUnlockRepository.grant`)

`PoolRepository.addMember` today is a plain insert returning `void` and has **zero production callers** (verified: only the port, the Drizzle impl, and `vi.fn()` fakes reference it — the only production writer of `pool_member` is the legacy SQL being replaced). It becomes idempotent and reports whether it created the row. `StatsUnlockRepository` (read-only today) gains the idempotent `grant`.

**Files:**
- Modify: `apps/api/src/infrastructure/persistence/DrizzlePoolRepository.test.ts`
- Create: `apps/api/src/infrastructure/persistence/DrizzleStatsUnlockRepository.test.ts`
- Modify: `apps/api/src/domain/pool/PoolRepository.port.ts:72`
- Modify: `apps/api/src/infrastructure/persistence/DrizzlePoolRepository.ts:173-175`
- Modify: `apps/api/src/domain/stats/StatsUnlockRepository.port.ts`
- Modify: `apps/api/src/infrastructure/persistence/DrizzleStatsUnlockRepository.ts`

- [ ] **Step 1.1: Write the failing tests for `addMember`**

Append to `apps/api/src/infrastructure/persistence/DrizzlePoolRepository.test.ts` (it already imports `describe/expect/it/vi` and `DrizzlePoolRepository`):

```ts
describe('DrizzlePoolRepository.addMember', () => {
  function createInsertDb(returnedRows: Array<{ id: string }>) {
    const returning = vi.fn().mockResolvedValue(returnedRows)
    const onConflictDoNothing = vi.fn(() => ({ returning }))
    const values = vi.fn(() => ({ onConflictDoNothing }))
    const insert = vi.fn(() => ({ values }))
    return { insert, values, onConflictDoNothing }
  }

  it('returns true when the membership row is created', async () => {
    const db = createInsertDb([{ id: 'member-1' }])
    const repo = new DrizzlePoolRepository(db as unknown as never)

    await expect(repo.addMember('pool-1', 'user-1', 'pay-1')).resolves.toBe(true)

    expect(db.values).toHaveBeenCalledWith({
      poolId: 'pool-1',
      userId: 'user-1',
      paymentId: 'pay-1',
    })
    expect(db.onConflictDoNothing).toHaveBeenCalledTimes(1)
  })

  it('returns false when the user is already a member (conflict ignored)', async () => {
    const db = createInsertDb([])
    const repo = new DrizzlePoolRepository(db as unknown as never)

    await expect(repo.addMember('pool-1', 'user-1', 'pay-1')).resolves.toBe(false)
  })
})
```

- [ ] **Step 1.2: Write the failing test for `grant`**

Create `apps/api/src/infrastructure/persistence/DrizzleStatsUnlockRepository.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { DrizzleStatsUnlockRepository } from './DrizzleStatsUnlockRepository'

describe('DrizzleStatsUnlockRepository.grant', () => {
  it('inserts the entitlement idempotently (ON CONFLICT DO NOTHING)', async () => {
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined)
    const values = vi.fn(() => ({ onConflictDoNothing }))
    const insert = vi.fn(() => ({ values }))
    const repo = new DrizzleStatsUnlockRepository({ insert } as unknown as never)

    await repo.grant({ userId: 'user-1', poolId: 'pool-1', paymentId: 'pay-1' })

    expect(values).toHaveBeenCalledWith({
      userId: 'user-1',
      poolId: 'pool-1',
      paymentId: 'pay-1',
    })
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 1.3: Run both files — expect RED**

```bash
pnpm --filter @m5nita/api exec vitest run src/infrastructure/persistence/DrizzlePoolRepository.test.ts src/infrastructure/persistence/DrizzleStatsUnlockRepository.test.ts
```

Expected: `addMember` tests fail (resolves `undefined`, not `true`/`false`); `grant` test fails (`repo.grant is not a function`). The pre-existing `findUserPools` tests still pass.

- [ ] **Step 1.4: Implement — port + Drizzle impl for `addMember`**

In `apps/api/src/domain/pool/PoolRepository.port.ts` replace:

```ts
  addMember(poolId: string, userId: string, paymentId: string): Promise<void>
```

with:

```ts
  /**
   * Idempotent membership insert (`ON CONFLICT (pool_id, user_id) DO NOTHING`).
   * Returns true when the membership row was created, false when the user was
   * already a member.
   */
  addMember(poolId: string, userId: string, paymentId: string): Promise<boolean>
```

In `apps/api/src/infrastructure/persistence/DrizzlePoolRepository.ts` replace:

```ts
  async addMember(poolId: string, userId: string, paymentId: string): Promise<void> {
    await this.db.insert(poolMember).values({ poolId, userId, paymentId })
  }
```

with:

```ts
  async addMember(poolId: string, userId: string, paymentId: string): Promise<boolean> {
    const inserted = await this.db
      .insert(poolMember)
      .values({ poolId, userId, paymentId })
      .onConflictDoNothing({ target: [poolMember.poolId, poolMember.userId] })
      .returning({ id: poolMember.id })
    return inserted.length > 0
  }
```

(`poolMember` is already imported; the unique index `pool_member_pool_id_user_id_idx` on `(pool_id, user_id)` exists in `db/schema/poolMember.ts`.)

- [ ] **Step 1.5: Implement — port + Drizzle impl for `grant`**

Replace the entire content of `apps/api/src/domain/stats/StatsUnlockRepository.port.ts` with:

```ts
/**
 * Entitlement port for the per-pool statistics unlock. Granting happens inside
 * the payment-completion unit of work (`CompleteCheckoutUseCase`) as an
 * idempotent `INSERT … ON CONFLICT (user_id, pool_id) DO NOTHING`, mirroring how
 * pool entry inserts `poolMember` in the same transaction — so it is atomic with
 * the payment CAS.
 */
export interface StatsUnlockRepository {
  /** Server-side gate: has this participant unlocked stats for this pool? */
  isUnlocked(userId: string, poolId: string): Promise<boolean>
  /** Users with an entitlement in the pool (bounded set for match-finish recompute). */
  listUnlockedUsers(poolId: string): Promise<string[]>
  /** Idempotent grant of the entitlement, referencing the completed payment. */
  grant(data: { userId: string; poolId: string; paymentId: string }): Promise<void>
}
```

In `apps/api/src/infrastructure/persistence/DrizzleStatsUnlockRepository.ts` add this method after `listUnlockedUsers`:

```ts
  async grant(data: { userId: string; poolId: string; paymentId: string }): Promise<void> {
    await this.db
      .insert(statsUnlock)
      .values(data)
      .onConflictDoNothing({ target: [statsUnlock.userId, statsUnlock.poolId] })
  }
```

(`statsUnlock` is already imported; unique index `stats_unlock_user_id_pool_id_idx` exists.)

- [ ] **Step 1.6: Run the two files again — expect GREEN**

```bash
pnpm --filter @m5nita/api exec vitest run src/infrastructure/persistence/DrizzlePoolRepository.test.ts src/infrastructure/persistence/DrizzleStatsUnlockRepository.test.ts
```

Expected: all tests pass. (Existing fakes elsewhere use `vi.fn()` + casts, so the signature changes don't break them — verified for `CreatePoolUseCase.test.ts`, `GetPendingPrizesUseCase.test.ts`, `UnlockStatsUseCase.test.ts`.)

- [ ] **Step 1.7: Commit (hook runs lint + typecheck + full suite)**

```bash
git add apps/api/src/domain/pool/PoolRepository.port.ts apps/api/src/infrastructure/persistence/DrizzlePoolRepository.ts apps/api/src/infrastructure/persistence/DrizzlePoolRepository.test.ts apps/api/src/domain/stats/StatsUnlockRepository.port.ts apps/api/src/infrastructure/persistence/DrizzleStatsUnlockRepository.ts apps/api/src/infrastructure/persistence/DrizzleStatsUnlockRepository.test.ts
git commit -m "refactor(persistence): completion-ready repo contracts — idempotent addMember + stats grant

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Ports + `CompleteCheckoutUseCase` (TDD)

**Files:**
- Create: `apps/api/src/domain/payment/PaymentRepository.port.ts`
- Create: `apps/api/src/application/ports/UnitOfWork.port.ts`
- Create: `apps/api/src/application/payment/CompleteCheckoutUseCase.test.ts`
- Create: `apps/api/src/application/payment/CompleteCheckoutUseCase.ts`

- [ ] **Step 2.1: Create the PaymentRepository port**

Create `apps/api/src/domain/payment/PaymentRepository.port.ts`:

```ts
/**
 * Port for the payment aggregate's completion path. The adapter implements
 * claimCompletion as a compare-and-set (`status <> 'completed'` guard) so a
 * duplicate webhook can never claim the same payment twice.
 */
export type ClaimedPayment = {
  id: string
  poolId: string
  userId: string
  type: 'entry' | 'stats_unlock' | 'prize'
}

export interface PaymentRepository {
  /**
   * Atomically marks the payment completed if (and only if) it was not
   * already. Returns the claimed payment, or null when there was nothing to
   * claim — already completed or no such record (disambiguate via exists()).
   */
  claimCompletion(paymentId: string): Promise<ClaimedPayment | null>
  /** Whether a payment row with this id exists at all. */
  exists(paymentId: string): Promise<boolean>
}
```

- [ ] **Step 2.2: Create the UnitOfWork port**

Create `apps/api/src/application/ports/UnitOfWork.port.ts`:

```ts
import type { PaymentRepository } from '../../domain/payment/PaymentRepository.port'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import type { StatsUnlockRepository } from '../../domain/stats/StatsUnlockRepository.port'

export type TransactionalRepositories = {
  payments: PaymentRepository
  pools: PoolRepository
  statsUnlocks: StatsUnlockRepository
}

/**
 * Transactional boundary port. run() executes `work` inside a single database
 * transaction: every repository handed to the callback is bound to that
 * transaction, and any error thrown by `work` rolls back all of its effects.
 */
export interface UnitOfWork {
  run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T>
}
```

- [ ] **Step 2.3: Write the failing use-case tests**

Create `apps/api/src/application/payment/CompleteCheckoutUseCase.test.ts`:

```ts
import * as Sentry from '@sentry/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ClaimedPayment,
  PaymentRepository,
} from '../../domain/payment/PaymentRepository.port'
import { Pool } from '../../domain/pool/Pool'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import { EntryFee } from '../../domain/shared/EntryFee'
import { InviteCode } from '../../domain/shared/InviteCode'
import { PoolScope } from '../../domain/shared/PoolScope'
import { PoolStatus } from '../../domain/shared/PoolStatus'
import type { StatsUnlockRepository } from '../../domain/stats/StatsUnlockRepository.port'
import type { UnitOfWork } from '../ports/UnitOfWork.port'
import { CompleteCheckoutUseCase } from './CompleteCheckoutUseCase'

vi.mock('@sentry/node', () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}))

function makeClaimed(overrides: Partial<ClaimedPayment> = {}): ClaimedPayment {
  return { id: 'pay-1', poolId: 'pool-1', userId: 'user-1', type: 'entry', ...overrides }
}

function makePaymentsRepo(opts: {
  claimed: ClaimedPayment | null
  exists?: boolean
}): PaymentRepository {
  return {
    claimCompletion: vi.fn(async () => opts.claimed),
    exists: vi.fn(async () => opts.exists ?? true),
  }
}

function makePool(status: PoolStatus): Pool {
  return new Pool(
    'pool-1',
    'Test Pool',
    EntryFee.of(5000),
    'owner-1',
    InviteCode.from('ABCD1234'),
    'comp-1',
    PoolScope.wholeCompetition(),
    status,
    true,
    null,
  )
}

function makePoolsRepo(
  pool: Pool | null,
  opts: { memberCreated?: boolean } = {},
): PoolRepository {
  return {
    findById: vi.fn(async () => pool),
    findByIdWithDetails: vi.fn(),
    findByInviteCode: vi.fn(),
    findActiveByCompetition: vi.fn(),
    findAllActive: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
    updateStatus: vi.fn(),
    getMemberCount: vi.fn(),
    isMember: vi.fn(),
    addMember: vi.fn(async () => opts.memberCreated ?? true),
    removeMember: vi.fn(),
    findUserPools: vi.fn(),
    getMembers: vi.fn(),
    getMembersWithContact: vi.fn(),
  } as unknown as PoolRepository
}

function makeStatsUnlocksRepo(): StatsUnlockRepository {
  return {
    isUnlocked: vi.fn(async () => false),
    listUnlockedUsers: vi.fn(async () => []),
    grant: vi.fn(async () => undefined),
  }
}

function makeUseCase(repos: {
  payments: PaymentRepository
  pools: PoolRepository
  statsUnlocks: StatsUnlockRepository
}) {
  const unitOfWork: UnitOfWork = { run: (work) => work(repos) }
  return new CompleteCheckoutUseCase(unitOfWork)
}

describe('CompleteCheckoutUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('claims the payment, activates the pending pool and adds the member on first call', async () => {
    const pool = makePool(PoolStatus.Pending)
    const payments = makePaymentsRepo({ claimed: makeClaimed() })
    const pools = makePoolsRepo(pool)
    const statsUnlocks = makeStatsUnlocksRepo()

    await makeUseCase({ payments, pools, statsUnlocks }).execute({ paymentId: 'pay-1' })

    expect(payments.claimCompletion).toHaveBeenCalledWith('pay-1')
    expect(pool.status).toBe(PoolStatus.Active)
    expect(pools.updateStatus).toHaveBeenCalledWith('pool-1', PoolStatus.Active)
    expect(pools.addMember).toHaveBeenCalledWith('pool-1', 'user-1', 'pay-1')
    expect(statsUnlocks.grant).not.toHaveBeenCalled()
  })

  it('short-circuits on a duplicate webhook (CAS claims nothing, payment exists)', async () => {
    const payments = makePaymentsRepo({ claimed: null, exists: true })
    const pools = makePoolsRepo(makePool(PoolStatus.Active))
    const statsUnlocks = makeStatsUnlocksRepo()

    await makeUseCase({ payments, pools, statsUnlocks }).execute({ paymentId: 'pay-1' })

    expect(pools.findById).not.toHaveBeenCalled()
    expect(pools.addMember).not.toHaveBeenCalled()
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
  })

  it('reports to Sentry when the payment record does not exist', async () => {
    const payments = makePaymentsRepo({ claimed: null, exists: false })
    const pools = makePoolsRepo(null)
    const statsUnlocks = makeStatsUnlocksRepo()

    await makeUseCase({ payments, pools, statsUnlocks }).execute({ paymentId: 'missing' })

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      '[payment] record not found for id=missing',
      'error',
    )
    expect(pools.addMember).not.toHaveBeenCalled()
  })

  it('grants the stats entitlement and never touches pool/membership for stats_unlock', async () => {
    const payments = makePaymentsRepo({ claimed: makeClaimed({ type: 'stats_unlock' }) })
    const pools = makePoolsRepo(makePool(PoolStatus.Active))
    const statsUnlocks = makeStatsUnlocksRepo()

    await makeUseCase({ payments, pools, statsUnlocks }).execute({ paymentId: 'pay-1' })

    expect(statsUnlocks.grant).toHaveBeenCalledWith({
      userId: 'user-1',
      poolId: 'pool-1',
      paymentId: 'pay-1',
    })
    expect(pools.findById).not.toHaveBeenCalled()
    expect(pools.updateStatus).not.toHaveBeenCalled()
    expect(pools.addMember).not.toHaveBeenCalled()
  })

  it('only claims for other payment types (prize)', async () => {
    const payments = makePaymentsRepo({ claimed: makeClaimed({ type: 'prize' }) })
    const pools = makePoolsRepo(makePool(PoolStatus.Active))
    const statsUnlocks = makeStatsUnlocksRepo()

    await makeUseCase({ payments, pools, statsUnlocks }).execute({ paymentId: 'pay-1' })

    expect(statsUnlocks.grant).not.toHaveBeenCalled()
    expect(pools.findById).not.toHaveBeenCalled()
    expect(pools.addMember).not.toHaveBeenCalled()
  })

  it('does not rewrite the status of an already-active pool but still adds the member', async () => {
    const payments = makePaymentsRepo({ claimed: makeClaimed() })
    const pools = makePoolsRepo(makePool(PoolStatus.Active))
    const statsUnlocks = makeStatsUnlocksRepo()

    await makeUseCase({ payments, pools, statsUnlocks }).execute({ paymentId: 'pay-1' })

    expect(pools.updateStatus).not.toHaveBeenCalled()
    expect(pools.addMember).toHaveBeenCalledWith('pool-1', 'user-1', 'pay-1')
  })

  it('still adds the member when the pool row is missing (FK enforces existence)', async () => {
    const payments = makePaymentsRepo({ claimed: makeClaimed() })
    const pools = makePoolsRepo(null)
    const statsUnlocks = makeStatsUnlocksRepo()

    await makeUseCase({ payments, pools, statsUnlocks }).execute({ paymentId: 'pay-1' })

    expect(pools.updateStatus).not.toHaveBeenCalled()
    expect(pools.addMember).toHaveBeenCalledWith('pool-1', 'user-1', 'pay-1')
  })

  it('resolves when the member already exists (idempotent addMember)', async () => {
    const payments = makePaymentsRepo({ claimed: makeClaimed() })
    const pools = makePoolsRepo(makePool(PoolStatus.Active), { memberCreated: false })
    const statsUnlocks = makeStatsUnlocksRepo()

    await expect(
      makeUseCase({ payments, pools, statsUnlocks }).execute({ paymentId: 'pay-1' }),
    ).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2.4: Run it — expect RED**

```bash
pnpm --filter @m5nita/api exec vitest run src/application/payment/CompleteCheckoutUseCase.test.ts
```

Expected: FAIL — `Cannot find module './CompleteCheckoutUseCase'` (or equivalent resolution error).

- [ ] **Step 2.5: Implement the use case**

Create `apps/api/src/application/payment/CompleteCheckoutUseCase.ts`:

```ts
import * as Sentry from '@sentry/node'
import { PoolStatus } from '../../domain/shared/PoolStatus'
import type { UnitOfWork } from '../ports/UnitOfWork.port'

type Input = {
  paymentId: string
}

/**
 * Payment-completion path: turns a confirmed checkout into its entitlements.
 * Everything runs inside one unit of work — the CAS claim, the type dispatch
 * (entry → pool activation + membership; stats_unlock → entitlement grant) and
 * every insert are atomic: a duplicate webhook short-circuits on the CAS, and a
 * failure in any step rolls back all of them (no "paid but not a member"
 * window, no double credit).
 */
export class CompleteCheckoutUseCase {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  async execute(input: Input): Promise<void> {
    const { paymentId } = input
    await this.unitOfWork.run(async ({ payments, pools, statsUnlocks }) => {
      const claimed = await payments.claimCompletion(paymentId)

      if (!claimed) {
        if (await payments.exists(paymentId)) {
          console.log(`[payment] ${paymentId} already completed, skipping`)
        } else {
          const msg = `[payment] record not found for id=${paymentId}`
          console.error(msg)
          Sentry.captureMessage(msg, 'error')
        }
        return
      }

      Sentry.addBreadcrumb({
        category: 'payment',
        message: 'handleCheckoutCompleted claimed',
        level: 'info',
        data: {
          paymentId: claimed.id,
          poolId: claimed.poolId,
          userId: claimed.userId,
          type: claimed.type,
        },
      })

      console.log(
        `[payment] ${claimed.id} marked completed (pool=${claimed.poolId}, type=${claimed.type})`,
      )

      if (claimed.type === 'stats_unlock') {
        await statsUnlocks.grant({
          userId: claimed.userId,
          poolId: claimed.poolId,
          paymentId: claimed.id,
        })
        console.log(`[payment] stats unlocked (pool=${claimed.poolId}, user=${claimed.userId})`)
        return
      }

      if (claimed.type !== 'entry') return

      const pool = await pools.findById(claimed.poolId)
      if (pool && pool.status === PoolStatus.Pending) {
        pool.activate()
        await pools.updateStatus(pool.id, pool.status)
        console.log(`[payment] pool ${claimed.poolId} activated`)
      }

      const created = await pools.addMember(claimed.poolId, claimed.userId, claimed.id)
      if (created) {
        console.log(
          `[payment] poolMember created (pool=${claimed.poolId}, user=${claimed.userId})`,
        )
      }
    })
  }
}
```

Notes for the executor:
- The Sentry breadcrumb message stays `'handleCheckoutCompleted claimed'` on purpose (observability parity — see spec).
- `pool.status === PoolStatus.Pending` is an identity comparison; `PoolStatus` instances are singletons (`PoolStatus.from` returns them; `PoolMapper.poolToDomain` hydrates through `PoolStatus.from`).

- [ ] **Step 2.6: Run it — expect GREEN**

```bash
pnpm --filter @m5nita/api exec vitest run src/application/payment/CompleteCheckoutUseCase.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 2.7: Commit**

```bash
git add apps/api/src/domain/payment apps/api/src/application/ports/UnitOfWork.port.ts apps/api/src/application/payment
git commit -m "feat(application): CompleteCheckoutUseCase + UnitOfWork/PaymentRepository ports

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Drizzle adapters — `DrizzlePaymentRepository`, `DrizzleUnitOfWork`, tx-capable constructors

**Files:**
- Modify: `apps/api/src/db/client.ts`
- Modify: `apps/api/src/infrastructure/persistence/DrizzlePoolRepository.ts:2,29`
- Modify: `apps/api/src/infrastructure/persistence/DrizzleStatsUnlockRepository.ts:2,7`
- Create: `apps/api/src/infrastructure/persistence/DrizzlePaymentRepository.test.ts`
- Create: `apps/api/src/infrastructure/persistence/DrizzlePaymentRepository.ts`
- Create: `apps/api/src/infrastructure/persistence/DrizzleUnitOfWork.test.ts`
- Create: `apps/api/src/infrastructure/persistence/DrizzleUnitOfWork.ts`

- [ ] **Step 3.1: Add the executor types to `db/client.ts`**

Append to `apps/api/src/db/client.ts` (after the `export const db` line):

```ts
/** The transaction client drizzle hands to `db.transaction` callbacks. */
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * What a repository needs to run queries: the root client or a transaction
 * bound to it. `PgTransaction` extends `PgDatabase`, so both expose the same
 * query surface — this is what lets the UnitOfWork hand out tx-bound repos.
 */
export type DbExecutor = typeof db | DbTransaction
```

- [ ] **Step 3.2: Widen the two existing repo constructors**

In `apps/api/src/infrastructure/persistence/DrizzlePoolRepository.ts` replace:

```ts
import type { db as dbClient } from '../../db/client'
```

with:

```ts
import type { DbExecutor } from '../../db/client'
```

and replace:

```ts
  constructor(private readonly db: typeof dbClient) {}
```

with:

```ts
  constructor(private readonly db: DbExecutor) {}
```

In `apps/api/src/infrastructure/persistence/DrizzleStatsUnlockRepository.ts` replace:

```ts
import type { db as DbClient } from '../../db/client'
```

with:

```ts
import type { DbExecutor } from '../../db/client'
```

and replace:

```ts
  constructor(private db: typeof DbClient) {}
```

with:

```ts
  constructor(private db: DbExecutor) {}
```

- [ ] **Step 3.3: Write the failing tests for `DrizzlePaymentRepository`**

Create `apps/api/src/infrastructure/persistence/DrizzlePaymentRepository.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { DrizzlePaymentRepository } from './DrizzlePaymentRepository'

function createMockDb(opts: {
  claimedRows?: Array<Record<string, unknown>>
  foundRow?: Record<string, unknown> | undefined
}) {
  const returning = vi.fn().mockResolvedValue(opts.claimedRows ?? [])
  const where = vi.fn(() => ({ returning }))
  const set = vi.fn(() => ({ where }))
  const update = vi.fn(() => ({ set }))
  const findFirst = vi.fn().mockResolvedValue(opts.foundRow)
  return { db: { update, query: { payment: { findFirst } } }, set, findFirst }
}

describe('DrizzlePaymentRepository', () => {
  it('claimCompletion maps the claimed row to ClaimedPayment', async () => {
    const mock = createMockDb({
      claimedRows: [
        {
          id: 'pay-1',
          poolId: 'pool-1',
          userId: 'user-1',
          type: 'entry',
          status: 'completed',
          amount: 10000,
        },
      ],
    })
    const repo = new DrizzlePaymentRepository(mock.db as unknown as never)

    const claimed = await repo.claimCompletion('pay-1')

    expect(claimed).toEqual({ id: 'pay-1', poolId: 'pool-1', userId: 'user-1', type: 'entry' })
    expect(mock.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', updatedAt: expect.any(Date) }),
    )
  })

  it('claimCompletion returns null when the CAS matches no row', async () => {
    const mock = createMockDb({ claimedRows: [] })
    const repo = new DrizzlePaymentRepository(mock.db as unknown as never)

    await expect(repo.claimCompletion('pay-1')).resolves.toBeNull()
  })

  it('exists reflects whether the payment row is found', async () => {
    const found = createMockDb({ foundRow: { id: 'pay-1' } })
    const missing = createMockDb({ foundRow: undefined })

    await expect(
      new DrizzlePaymentRepository(found.db as unknown as never).exists('pay-1'),
    ).resolves.toBe(true)
    await expect(
      new DrizzlePaymentRepository(missing.db as unknown as never).exists('pay-1'),
    ).resolves.toBe(false)
  })
})
```

- [ ] **Step 3.4: Run it — expect RED**

```bash
pnpm --filter @m5nita/api exec vitest run src/infrastructure/persistence/DrizzlePaymentRepository.test.ts
```

Expected: FAIL — `Cannot find module './DrizzlePaymentRepository'`.

- [ ] **Step 3.5: Implement `DrizzlePaymentRepository`**

Create `apps/api/src/infrastructure/persistence/DrizzlePaymentRepository.ts`:

```ts
import { and, eq, ne } from 'drizzle-orm'
import type { DbExecutor } from '../../db/client'
import { payment } from '../../db/schema/payment'
import type {
  ClaimedPayment,
  PaymentRepository,
} from '../../domain/payment/PaymentRepository.port'

export class DrizzlePaymentRepository implements PaymentRepository {
  constructor(private readonly db: DbExecutor) {}

  async claimCompletion(paymentId: string): Promise<ClaimedPayment | null> {
    const claimed = await this.db
      .update(payment)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(and(eq(payment.id, paymentId), ne(payment.status, 'completed')))
      .returning()

    const row = claimed[0]
    if (!row) return null
    return {
      id: row.id,
      poolId: row.poolId,
      userId: row.userId,
      type: row.type as ClaimedPayment['type'],
    }
  }

  async exists(paymentId: string): Promise<boolean> {
    const row = await this.db.query.payment.findFirst({
      where: eq(payment.id, paymentId),
      columns: { id: true },
    })
    return row !== undefined
  }
}
```

- [ ] **Step 3.6: Write the failing tests for `DrizzleUnitOfWork`**

Create `apps/api/src/infrastructure/persistence/DrizzleUnitOfWork.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import type { db as DbClient } from '../../db/client'
import { DrizzlePaymentRepository } from './DrizzlePaymentRepository'
import { DrizzlePoolRepository } from './DrizzlePoolRepository'
import { DrizzleStatsUnlockRepository } from './DrizzleStatsUnlockRepository'
import { DrizzleUnitOfWork } from './DrizzleUnitOfWork'

function makeDb() {
  const tx = { tag: 'tx' }
  const transaction = vi.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx))
  return { db: { transaction } as unknown as typeof DbClient, tx, transaction }
}

describe('DrizzleUnitOfWork', () => {
  it('runs work inside db.transaction with all repos bound to the SAME tx', async () => {
    const { db, tx, transaction } = makeDb()
    const uow = new DrizzleUnitOfWork(db)

    const result = await uow.run(async (repos) => {
      expect(repos.payments).toBeInstanceOf(DrizzlePaymentRepository)
      expect(repos.pools).toBeInstanceOf(DrizzlePoolRepository)
      expect(repos.statsUnlocks).toBeInstanceOf(DrizzleStatsUnlockRepository)
      // the binding is the atomicity guarantee — every repo must hold the tx,
      // not the root client
      expect((repos.payments as unknown as { db: unknown }).db).toBe(tx)
      expect((repos.pools as unknown as { db: unknown }).db).toBe(tx)
      expect((repos.statsUnlocks as unknown as { db: unknown }).db).toBe(tx)
      return 'done'
    })

    expect(result).toBe('done')
    expect(transaction).toHaveBeenCalledTimes(1)
  })

  it('propagates errors from work (transaction rollback path)', async () => {
    const { db } = makeDb()
    const uow = new DrizzleUnitOfWork(db)

    await expect(
      uow.run(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
  })
})
```

- [ ] **Step 3.7: Run it — expect RED**

```bash
pnpm --filter @m5nita/api exec vitest run src/infrastructure/persistence/DrizzleUnitOfWork.test.ts
```

Expected: FAIL — `Cannot find module './DrizzleUnitOfWork'`.

- [ ] **Step 3.8: Implement `DrizzleUnitOfWork`**

Create `apps/api/src/infrastructure/persistence/DrizzleUnitOfWork.ts`:

```ts
import type { TransactionalRepositories, UnitOfWork } from '../../application/ports/UnitOfWork.port'
import type { db as DbClient } from '../../db/client'
import { DrizzlePaymentRepository } from './DrizzlePaymentRepository'
import { DrizzlePoolRepository } from './DrizzlePoolRepository'
import { DrizzleStatsUnlockRepository } from './DrizzleStatsUnlockRepository'

/**
 * Drizzle adapter for the UnitOfWork port: opens one transaction and hands the
 * use case repositories bound to it. A throw inside `work` rolls the whole
 * transaction back.
 */
export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(private readonly db: typeof DbClient) {}

  run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) =>
      work({
        payments: new DrizzlePaymentRepository(tx),
        pools: new DrizzlePoolRepository(tx),
        statsUnlocks: new DrizzleStatsUnlockRepository(tx),
      }),
    )
  }
}
```

- [ ] **Step 3.9: Run all persistence tests — expect GREEN**

```bash
pnpm --filter @m5nita/api exec vitest run src/infrastructure/persistence
```

Expected: all pass (PoolRepository, StatsUnlock, Payment, UnitOfWork, PrizeWithdrawal, Match, mappers).

- [ ] **Step 3.10: Commit**

```bash
git add apps/api/src/db/client.ts apps/api/src/infrastructure/persistence
git commit -m "feat(persistence): DrizzlePaymentRepository + DrizzleUnitOfWork with tx-bound repos

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Wire the container; `MockPaymentGateway` uses the use case

**Files:**
- Modify: `apps/api/src/container.ts`
- Modify: `apps/api/src/infrastructure/external/MockPaymentGateway.ts`

- [ ] **Step 4.1: Container — imports**

In `apps/api/src/container.ts`, add before the line `import { CreatePoolUseCase } from './application/pool/CreatePoolUseCase'`:

```ts
import { CompleteCheckoutUseCase } from './application/payment/CompleteCheckoutUseCase'
```

and after the line `import { DrizzleStatsUnlockRepository } from './infrastructure/persistence/DrizzleStatsUnlockRepository'`:

```ts
import { DrizzleUnitOfWork } from './infrastructure/persistence/DrizzleUnitOfWork'
```

- [ ] **Step 4.2: Container — `buildPaymentGateway` signature**

Replace:

```ts
function buildPaymentGateway(db: Db): PaymentGateway {
  const provider = process.env.PAYMENT_GATEWAY
  const isProd = process.env.NODE_ENV === 'production'

  if (!provider && !isProd) return new MockPaymentGateway(db)
```

with:

```ts
function buildPaymentGateway(
  db: Db,
  completeCheckoutUseCase: CompleteCheckoutUseCase,
): PaymentGateway {
  const provider = process.env.PAYMENT_GATEWAY
  const isProd = process.env.NODE_ENV === 'production'

  if (!provider && !isProd) return new MockPaymentGateway(db, completeCheckoutUseCase)
```

and (end of the same function) replace:

```ts
  if (isProd) throw new Error(spec.missingEnvError)
  console.warn(spec.mockReason)
  return new MockPaymentGateway(db)
}
```

with:

```ts
  if (isProd) throw new Error(spec.missingEnvError)
  console.warn(spec.mockReason)
  return new MockPaymentGateway(db, completeCheckoutUseCase)
}
```

- [ ] **Step 4.3: Container — build and expose the use case**

Replace:

```ts
  const statsRepo = new DrizzleStatsRepository(db)
```

with:

```ts
  const statsRepo = new DrizzleStatsRepository(db)
  const unitOfWork = new DrizzleUnitOfWork(db)
```

Replace:

```ts
  const paymentGateway = overrides.paymentGateway ?? buildPaymentGateway(db)
```

with:

```ts
  const completeCheckoutUseCase = new CompleteCheckoutUseCase(unitOfWork)
  const paymentGateway =
    overrides.paymentGateway ?? buildPaymentGateway(db, completeCheckoutUseCase)
```

Replace (in the returned object):

```ts
    notificationService,
    paymentGateway,

    createPoolUseCase: new CreatePoolUseCase(
```

with:

```ts
    notificationService,
    paymentGateway,

    completeCheckoutUseCase,
    createPoolUseCase: new CreatePoolUseCase(
```

- [ ] **Step 4.4: `MockPaymentGateway` — inject the use case**

Replace the entire content of `apps/api/src/infrastructure/external/MockPaymentGateway.ts` with:

```ts
import type { CompleteCheckoutUseCase } from '../../application/payment/CompleteCheckoutUseCase'
import type {
  CheckoutParams,
  CheckoutResult,
  PaymentGateway,
} from '../../application/ports/PaymentGateway.port'
import type { db as DbClient } from '../../db/client'
import { payment } from '../../db/schema/payment'

/**
 * Dev/test gateway: no real provider. Inserts a pending payment with the
 * requested type, then runs the SAME completion path as a real webhook
 * (CompleteCheckoutUseCase) so the dispatch (entry → activate + member;
 * stats_unlock → grant) is exercised once, with no duplicated logic.
 */
export class MockPaymentGateway implements PaymentGateway {
  constructor(
    private db: typeof DbClient,
    private readonly completeCheckout: CompleteCheckoutUseCase,
  ) {}

  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    const { userId, poolId, amount, platformFee } = params
    const type = params.type ?? 'entry'

    console.log(`[DEV] Mock payment: ${amount / 100} BRL for pool ${poolId} (${type})`)

    const [paymentRecord] = await this.db
      .insert(payment)
      .values({
        userId,
        poolId,
        amount,
        platformFee,
        externalPaymentId: `mock_pi_${crypto.randomUUID()}`,
        status: 'pending',
        type,
      })
      .returning()

    if (!paymentRecord) {
      throw new Error('Failed to create payment record')
    }

    await this.completeCheckout.execute({ paymentId: paymentRecord.id })

    return {
      payment: paymentRecord,
      checkoutUrl: null,
    }
  }

  isConfigured(): boolean {
    return false
  }
}
```

- [ ] **Step 4.5: Typecheck + commit**

```bash
pnpm --filter @m5nita/api exec tsc --noEmit
git add apps/api/src/container.ts apps/api/src/infrastructure/external/MockPaymentGateway.ts
git commit -m "feat(container): wire CompleteCheckoutUseCase; MockPaymentGateway runs it instead of the legacy service

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: typecheck clean; hook green. (`services/payment.ts` still exists, so the legacy mocks in the pools tests still resolve.)

---

### Task 5: Swap the HTTP callers (Stripe webhook + InfinitePay confirm) and their tests

**Files:**
- Modify: `apps/api/src/infrastructure/http/routes/webhooks.ts:4-5,53`
- Modify: `apps/api/src/services/infinitepay.ts:6,77`
- Modify: `apps/api/src/infrastructure/http/routes/webhooks.test.ts`

- [ ] **Step 5.1: Update `webhooks.test.ts` first (RED)**

In `apps/api/src/infrastructure/http/routes/webhooks.test.ts` replace:

```ts
const mockHandleCheckoutCompleted = vi.fn()

vi.mock('../../../services/payment', () => ({
  handleCheckoutCompleted: (...args: unknown[]) => mockHandleCheckoutCompleted(...args),
}))
```

with:

```ts
const mockCompleteCheckout = vi.fn()

vi.mock('../../../container', () => ({
  getContainer: () => ({
    completeCheckoutUseCase: {
      execute: (...args: unknown[]) => mockCompleteCheckout(...args),
    },
  }),
}))
```

Then rename every remaining `mockHandleCheckoutCompleted` to `mockCompleteCheckout` (replace-all; ~10 assertion sites).

Then fix the three positive assertions to the new input shape:

- `expect(mockCompleteCheckout).toHaveBeenCalledWith('payment-uuid-456')` → `expect(mockCompleteCheckout).toHaveBeenCalledWith({ paymentId: 'payment-uuid-456' })`
- `expect(mockCompleteCheckout).toHaveBeenCalledWith(PAYMENT_UUID)` → `expect(mockCompleteCheckout).toHaveBeenCalledWith({ paymentId: PAYMENT_UUID })` (occurs **twice** — replace both)

And update the stale comment:

```ts
    // handleCheckoutCompleted is still called but is itself idempotent (verified in services/payment.ts)
```

→

```ts
    // The completion use case is still invoked but is itself idempotent (CAS short-circuit)
```

- [ ] **Step 5.2: Run it — expect RED**

```bash
pnpm --filter @m5nita/api exec vitest run src/infrastructure/http/routes/webhooks.test.ts
```

Expected: the `checkoutCompleted_callsHandleCheckoutCompleted`, `marksPaymentCompletedAndActivatesPoolWhenPaymentCheckReturnsPaid` and `isIdempotentForDuplicateWebhookOnAlreadyCompletedPayment` tests FAIL (the routes still call the legacy function, so `mockCompleteCheckout` is never invoked).

- [ ] **Step 5.3: Swap the Stripe webhook caller**

In `apps/api/src/infrastructure/http/routes/webhooks.ts` replace:

```ts
import { Hono } from 'hono'
import type Stripe from 'stripe'
import { stripe } from '../../../lib/stripe'
import { confirmInfinitePayPayment, PaymentCheckFailedError } from '../../../services/infinitepay'
import { handleCheckoutCompleted } from '../../../services/payment'
```

with:

```ts
import { Hono } from 'hono'
import type Stripe from 'stripe'
import { getContainer } from '../../../container'
import { stripe } from '../../../lib/stripe'
import { confirmInfinitePayPayment, PaymentCheckFailedError } from '../../../services/infinitepay'
```

and replace:

```ts
    if (paymentId) {
      await handleCheckoutCompleted(paymentId)
    }
```

with:

```ts
    if (paymentId) {
      await getContainer().completeCheckoutUseCase.execute({ paymentId })
    }
```

- [ ] **Step 5.4: Swap the InfinitePay caller**

In `apps/api/src/services/infinitepay.ts` replace:

```ts
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { payment } from '../db/schema/payment'
import { infinitePayConfig } from '../lib/infinitepay'
import { handleCheckoutCompleted } from './payment'
```

with:

```ts
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getContainer } from '../container'
import { db } from '../db/client'
import { payment } from '../db/schema/payment'
import { infinitePayConfig } from '../lib/infinitepay'
```

and replace:

```ts
  if (upstreamStatus === 'paid' || upstreamStatus === 'approved') {
    await handleCheckoutCompleted(orderNsu)
    return 'completed'
  }
```

with:

```ts
  if (upstreamStatus === 'paid' || upstreamStatus === 'approved') {
    // getContainer() stays inside the function (lib/telegram.ts precedent):
    // hoisting it to module scope would build the container at import time.
    await getContainer().completeCheckoutUseCase.execute({ paymentId: orderNsu })
    return 'completed'
  }
```

- [ ] **Step 5.5: Run it — expect GREEN**

```bash
pnpm --filter @m5nita/api exec vitest run src/infrastructure/http/routes/webhooks.test.ts
```

Expected: all 19 tests pass.

- [ ] **Step 5.6: Commit**

```bash
git add apps/api/src/infrastructure/http/routes/webhooks.ts apps/api/src/infrastructure/http/routes/webhooks.test.ts apps/api/src/services/infinitepay.ts
git commit -m "refactor(payments): route Stripe webhook + InfinitePay confirm through CompleteCheckoutUseCase

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Delete the legacy module; shrink the G3 baseline

**Files:**
- Delete: `apps/api/src/services/payment.ts`, `apps/api/src/services/payment.test.ts`
- Modify: `apps/api/src/_architecture.test.ts:98`
- Modify: `apps/api/src/infrastructure/http/routes/pools.test.ts`, `pools-join.test.ts`, `pools-admin.test.ts`

- [ ] **Step 6.1: Delete the legacy service and its test**

```bash
git rm apps/api/src/services/payment.ts apps/api/src/services/payment.test.ts
```

(`handleCheckoutCompleted` now lives in the use case; `handleCheckoutExpired` had zero production callers — dead code. The 5 scenarios of `payment.test.ts` are superseded by `CompleteCheckoutUseCase.test.ts`, which also added the `stats_unlock` and already-active-pool branches.)

- [ ] **Step 6.2: Remove the dangling `vi.mock` blocks**

In each of `apps/api/src/infrastructure/http/routes/pools.test.ts`, `pools-join.test.ts` and `pools-admin.test.ts`, delete this exact block (the module no longer exists; the factory would fail resolution):

```ts
vi.mock('../../../services/payment', () => ({
  handleCheckoutCompleted: vi.fn(),
  handleCheckoutExpired: vi.fn(),
}))

```

- [ ] **Step 6.3: Shrink the G3 baseline**

In `apps/api/src/_architecture.test.ts` replace:

```ts
  'services/infinitepay.ts',
  'services/payment.ts',
  'services/pool.ts',
```

with:

```ts
  'services/infinitepay.ts',
  'services/pool.ts',
```

- [ ] **Step 6.4: Run the affected suites — expect GREEN**

```bash
pnpm --filter @m5nita/api exec vitest run src/_architecture.test.ts src/infrastructure/http/routes/pools.test.ts src/infrastructure/http/routes/pools-join.test.ts src/infrastructure/http/routes/pools-admin.test.ts
```

Expected: all pass — nothing imports `services/payment` anymore and the architecture test enforces the shrunk baseline.

- [ ] **Step 6.5: Commit**

```bash
git add -A apps/api/src
git commit -m "refactor(services): delete legacy payment service; shrink G3 baseline

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Full verification (guardrails, integration on real Postgres, build)

- [ ] **Step 7.1: Guardrails**

```bash
pnpm check:leaks
pnpm check:arch
```

Expected: both exit 0 (no new leak patterns; layer boundaries respected).

- [ ] **Step 7.2: Integration suite against real Postgres (the behavior-parity proof)**

```bash
docker compose up -d postgres-test
DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test pnpm --filter @m5nita/api test:integration
```

Expected: ALL scenarios pass **unchanged** — in particular `scenarios/infinitepay-confirm.test.ts` (confirm grants completed + active pool + single member; late webhook after confirm is a no-op; 404 for unknown order). These tests exercise the new use case end-to-end through the real routes and real SQL.

- [ ] **Step 7.3: Build + final sanity**

```bash
pnpm build
git diff main --stat
```

Expected: build succeeds; the diff touches only the files in the File map (plus `specs/024-complete-checkout-use-case/`).

- [ ] **Step 7.4: Mark plan complete**

No commit expected in this task (verification only). If any step failed, fix forward within the relevant task's files and re-run from the failing step.

---

## Out of scope (do NOT do)

- Do not touch `services/infinitepay.ts` beyond the single import/call swap in Task 5 (its inline expiry update and baseline entry stay).
- Do not change `Pool.activate()` semantics or add new domain methods.
- Do not create a `PoolMemberRepository` port.
- Do not modify migrations, schemas, or anything under `apps/web`.
