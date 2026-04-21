# Contract: `Clock` Port

**Location**: `apps/api/src/domain/shared/Clock.ts`
**Layer**: Domain (interface) + Infrastructure (`SystemClock` adapter) + Test Support (`TestClock` adapter)
**Status**: New — introduced by feature 016

## Interface

```ts
// apps/api/src/domain/shared/Clock.ts
export interface Clock {
  /**
   * Returns the current instant.
   * Production callers MUST use this instead of `new Date()` / `Date.now()`
   * when the resulting value gates a business rule.
   */
  now(): Date
}
```

## Production adapter

```ts
// apps/api/src/infrastructure/clock/SystemClock.ts
import type { Clock } from '../../domain/shared/Clock'

export class SystemClock implements Clock {
  now(): Date {
    return new Date()
  }
}
```

**Constraints**:

- No internal state; safe to share as a singleton.
- Never reads from any non-OS source.

## Test adapter

```ts
// apps/api/tests/integration/support/TestClock.ts
import type { Clock } from '../../../src/domain/shared/Clock'

export class TestClock implements Clock {
  private current: Date

  constructor(initial: Date | string = '2026-06-11T12:00:00.000Z') {
    this.current = new Date(initial)
  }

  now(): Date {
    return new Date(this.current)
  }

  setNow(d: Date | string): void {
    const next = new Date(d)
    if (Number.isNaN(next.getTime())) {
      throw new Error(`TestClock.setNow: invalid date ${d}`)
    }
    this.current = next
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms)
  }
}
```

## Container wiring

```ts
// apps/api/src/container.ts (illustrative)
type ContainerOverrides = Partial<{
  clock: Clock
  paymentGateway: PaymentGateway
  notificationService: NotificationService
  // ...
}>

function buildContainer(overrides: ContainerOverrides = {}) {
  const clock = overrides.clock ?? new SystemClock()
  // ...pass `clock` into use cases and jobs that need it
}
```

## Call sites migrated on day one

Only call sites gating covered journeys. Everything else keeps `new Date()`.

| File | Original | Migrated |
|---|---|---|
| `domain/prediction/Prediction.ts` | `isLockedAt(matchDate: Date, now = new Date())` | `isLockedAt(matchDate: Date, now: Date)` — caller passes `clock.now()` |
| `jobs/reminderJob.ts` | `const now = new Date()` | `const now = clock.now()` (clock from container) |
| `jobs/closePoolsJob.ts` | `new Date()` filters | `clock.now()` |
| `services/match.ts` (kickoff-gating queries only) | `new Date()` | `clock.now()` |
| `services/prediction.ts` | `new Date()` lock filter | `clock.now()` |

Audit-column writes (`createdAt = new Date()`, `updatedAt = new Date()`) are **not** migrated. Drift of a few microseconds on those columns does not change any test assertion, and the migration cost is not justified.

## Acceptance checks

- Grep for `new Date(` / `Date.now(` in each of the files above returns only audit-column usages or comments after migration.
- `Prediction.test.ts` (unit) continues to pass with the new signature (tests already pass a `now` parameter).
- An integration scenario that calls `testClock.setNow('2026-06-11T17:59:00Z')` then POSTs a prediction, then calls `testClock.setNow('2026-06-11T18:01:00Z')` then attempts to edit the same prediction, correctly observes the edit being rejected.
