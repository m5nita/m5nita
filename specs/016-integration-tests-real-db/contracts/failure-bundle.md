# Contract: Failure Bundle (CI Artifact)

**Location**: `apps/api/tests/integration/.artifacts/<scenario-slug>.json`
**Spec anchor**: FR-010, Clarification Q5 (Session 2026-04-20)

When a scenario fails, the test suite writes a single JSON file capturing just enough context to diagnose the failure without re-running the suite. In CI, those files are uploaded via `actions/upload-artifact@v4` on job failure and are downloadable from the PR's checks tab.

## JSON schema

```ts
type FailureBundle = {
  scenario: string              // 'pool-lifecycle.test.ts > paid join via InfinitePay'
  failedAt: string              // ISO timestamp (wall clock, not TestClock)
  worker: string                // VITEST_POOL_ID
  clock: { now: string }        // TestClock.now() at the moment of failure
  watchedRows: Record<string, unknown[]>  // { tableName: [row, row] }
  stubCalls: StubCallLog[]      // concatenated, chronological
  lastHttp: {
    request:  { method: string; path: string; headers?: Record<string, string>; body: string | null }
    response: { status: number; headers?: Record<string, string>; body: string | null }
  } | null
  error: {
    message: string
    stack: string
    expected?: unknown
    actual?: unknown
  }
}
```

## Size budget

- Hard ceiling: **50 KB** per bundle. If a bundle would exceed, oversized fields are truncated to their first 2 KB and the field value is suffixed with `"…(truncated, original N bytes)"`.
- Redaction rules (applied before write):
  - Any value on a path matching `/pix|pin|secret|token/i` that is longer than 16 chars → replaced with `"<redacted:N-chars>"`.
  - `Set-Cookie` headers → first 8 chars of value, then `"…"`.
  - Request/response bodies over 4 KB → truncated with a note.

## Opt-in `watch()` per scenario

Scenarios declare the tables their bundle should capture:

```ts
beforeEach(({ task }) => {
  recorder.watch('pool', 'pool_member', 'payment')
})
```

**Why opt-in**: dumping every row of every table on every failure would blow the size budget and make diffing harder. The explicit list also serves as documentation — a reader of the test learns which tables it touches.

## Output location

Default: `apps/api/tests/integration/.artifacts/`. Override via `TEST_ARTIFACTS_DIR` env var (CI sets it to `./test-artifacts`).

Scenario-slug algorithm: `basename(file) + ' > ' + task.name`, sanitized to `[a-z0-9-._]` with `_` replacement. Collisions (same slug) get a `-N` suffix.

## CI wiring

Added to `.github/workflows/ci.yml`:

```yaml
- name: Upload integration-test failure bundles
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: integration-test-failures
    path: apps/api/tests/integration/.artifacts/**
    if-no-files-found: ignore
    retention-days: 7
```

## Failure of the recorder itself

If the recorder throws (e.g. can't read a watched table because the DB was dropped mid-test), it logs to stderr prefixed with `[FailureRecorder]` and exits silently. It NEVER masks, rewrites, or suppresses the original test failure.

## Non-goals

- No global log of every DB write or every query — that's what observability tooling is for.
- No stack-traces for passing tests — bundles only exist on failure.
- No automatic diff against a baseline — the bundle is evidence, not analysis.
