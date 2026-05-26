## Summary

<!-- 1–3 bullets describing what changed and why. -->

## Architecture checklist

- [ ] No new business-rule duplication — financial math, scoring, ranking,
      match lifecycle stay in `apps/api/src/domain/` (see ADR 0001).
- [ ] If a rule changed: only one place was modified.
- [ ] If a use case needed outer-layer info: it goes through a port, not a
      concrete adapter / service / `db/schema` import.
- [ ] Front-end does not compute prize/fee from existing data — consumes
      API-computed values or `computePlatformFee` from `@m5nita/shared`.
- [ ] `pnpm check:leaks` is green (CI runs it).
- [ ] `apps/api/src/_architecture.test.ts` is green (no new entries added to
      `BASELINE_*` allow-lists unless explicitly justified).

## Test plan

- [ ] `pnpm test`
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] Manual smoke (if UI/UX-affecting):
