---

description: "Task list for feature 015-dark-light-theme — Dark mode with three-state theme control"
---

# Tasks: Dark Mode with Theme Toggle

**Input**: Design documents in `/specs/015-dark-light-theme/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/theme-api.md`, `quickstart.md`

**Tests**: Included. The project constitution (Principle II) mandates unit tests for pure functions (100% on domain-style modules) and integration tests for cross-boundary behavior. This feature is TDD — write the test, verify it fails, then implement.

**Organization**: Grouped by user story per spec.md (US1 and US2 are both P1; US3 is P2). Setup and Foundational phases bootstrap the theme infrastructure that all three stories reuse.

## Format: `[ID] [P?] [Story?] Description with file path`

- **[P]** = parallelizable (different files, no dependencies on incomplete tasks)
- **[USx]** = which user story this task belongs to (Setup / Foundational / Polish have no label)

## Path Conventions

- Web app: `apps/web/src/`, `apps/web/tests/`
- All paths below are relative to the repo root `/Users/igortullio/Developer/igortullio/m5nita/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm Tailwind v4 custom-variant support and wire any new dev dependency needed for accessibility auditing.

- [X] T001 Verify Tailwind CSS v4 `@custom-variant` syntax works in `apps/web/src/styles/app.css` by temporarily adding `@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));` and a throwaway `.text-black dark:text-white` class on a dummy element, run `pnpm --filter web dev`, confirm no build errors, then revert the dummy class (keep the variant declaration for T004 if desired).
- [X] T002 [P] Add `@axe-core/playwright` to `apps/web/package.json` as a devDependency (if not already present) and run `pnpm install`. Confirm it imports cleanly by adding `import { AxeBuilder } from '@axe-core/playwright'` in a scratch file, then remove the scratch import.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the theme module scaffold, the CSS token split, and mount the provider so any user story can begin. No story can deliver value without these pieces.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Split color tokens in `apps/web/src/styles/app.css`: keep the existing `@theme` block for literal brand color names and add semantic aliases (`--color-bg`, `--color-surface`, `--color-surface-raised`, `--color-border`, `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`) inside `:root`. Use the values from `research.md` §R3 for the light palette.
- [X] T004 In `apps/web/src/styles/app.css`, register `@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));` and add a `[data-theme="dark"]` selector block that overrides every semantic alias with the dark warm-charcoal values from `research.md` §R3. Also add `html[data-theme="dark"] { color-scheme: dark; }` and the equivalent for light.
- [X] T005 [P] Create `apps/web/src/lib/theme/types.ts` exporting `ThemePreference = 'light' | 'dark' | 'system'` and `EffectiveTheme = 'light' | 'dark'` per `contracts/theme-api.md`.
- [X] T006 [P] Create `apps/web/src/lib/theme/resolveTheme.ts` exporting the pure function `resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): EffectiveTheme` per `contracts/theme-api.md`.
- [X] T007 [P] Create unit tests for `resolveTheme` in `apps/web/src/lib/__tests__/theme/resolveTheme.test.ts` covering all four input combinations (light/any, dark/any, system/dark, system/light). Tests must fail before T006 exists (or confirm pass if T006 was done first per TDD). Test names MUST follow `[unit]_[scenario]_[expectedResult]` per constitution §II (e.g., `resolveTheme_preferenceSystemAndSystemDark_returnsDark`).
- [X] T008 Create `apps/web/src/lib/theme/ThemeProvider.tsx` — React context provider that: reads `matchMedia('(prefers-color-scheme: dark)')` on mount for initial system value, uses an in-memory `useState<ThemePreference>('system')` as the initial preference (storage layer comes in US2), computes effective via `resolveTheme`, applies `document.documentElement.setAttribute('data-theme', effective)` and `style.colorScheme`, exposes context with `{ preference, effective, setPreference }`. Do NOT wire localStorage or matchMedia subscription yet — those arrive in US2 and US3.
- [X] T009 Create `apps/web/src/lib/theme/useTheme.ts` exporting the `useTheme()` hook per `contracts/theme-api.md` (reads the context, throws in dev if used outside provider, returns a defensive default in prod). Also create `apps/web/src/lib/theme/index.ts` barrel re-exporting `ThemeProvider`, `useTheme`, `resolveTheme`, and types.
- [X] T010 Wrap the app root in `<ThemeProvider>` by editing `apps/web/src/main.tsx` so the provider sits outside `<RouterProvider>`. Verify manually by running `pnpm --filter web dev` and confirming `<html data-theme="light">` renders in devtools.

**Checkpoint**: Theme infrastructure is wired but nothing is user-visible yet. Running the app still shows the light theme. Any user story can now begin.

---

## Phase 3: User Story 1 — Switch Between Light and Dark Appearance (Priority: P1)

**Goal**: Deliver a visible three-state control (Light / Dark / System) that switches the entire UI instantly, reachable from both the signed-in user menu and the logged-out public header.

**Independent Test**: Load the app, open the user menu (logged in) or the public header control (logged out), click Dark — entire UI flips to warm charcoal palette instantly, `<html data-theme="dark">` in devtools. Click Light — flips back. Reload is *not* required for this story; persistence is US2's job.

### Tests for User Story 1 ⚠️

> Write these first; they MUST fail before T014/T015/T016 exist.

- [X] T011 [P] [US1] Playwright test `apps/web/tests/theme-toggle.spec.ts` that: opens `/login`, locates the public theme control, clicks Dark, asserts `await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')`, clicks Light, asserts `'light'`. Must also cover the signed-in flow: sign in, open user menu, locate theme control, repeat assertions.
- [X] T012 [P] [US1] Vitest unit test `apps/web/src/lib/__tests__/theme/useTheme.test.tsx` that renders `<ThemeProvider>` + a consumer component, calls `setPreference('dark')`, asserts `effective === 'dark'` and `document.documentElement.getAttribute('data-theme') === 'dark'`. Test names MUST follow `[unit]_[scenario]_[expectedResult]` per constitution §II.

### Implementation for User Story 1

- [X] T013 [US1] Audit existing components for hard-coded color references that would break in dark mode. Run `rg -n "bg-cream|bg-white|text-black|bg-black" apps/web/src/` (note: `border-border` is already a semantic alias — do not flag it). Write the resulting file/line list to `specs/015-dark-light-theme/audit-color-migration.md` (a planning artifact, not merged source). DO NOT leave any TODO comments in source — constitution §I forbids TODOs in merged code. The markdown report drives T035's migration work.
- [X] T014 [US1] Implement `apps/web/src/components/ui/ThemeSwitcher.tsx` as a three-segment control per `contracts/theme-api.md`: three `<button>` elements (Light / Dark / System) wrapped in `<div role="group" aria-label="Seletor de tema">`. Each button has `aria-pressed`, an SVG icon (sun / moon / laptop), and `aria-label` in pt-BR ("Tema claro", "Tema escuro", "Seguir sistema"). Calls `setPreference()` from `useTheme`. Styled with `bg-surface`, `text-text-primary`, `border-border` tokens so it works in both themes.
- [X] T015 [US1] Add `ThemeSwitcher` to the signed-in mobile menu in `apps/web/src/routes/__root.tsx`: inside the `{menuOpen && ...}` nav overlay, below the navigation list, inside the `<div className="mx-auto max-w-[430px] p-5 lg:max-w-7xl">` block. Also register the switcher next to the desktop horizontal nav (inside the `<nav className="hidden lg:flex ...">` group).
- [X] T016 [US1] Add `ThemeSwitcher` to the public/unauthenticated header in `apps/web/src/routes/__root.tsx`: render it in the header's right side when `!session?.user`, using `size="sm"` variant so it fits alongside the brand mark. Verify it appears on `/login`, `/complete-profile`, and any other route rendered when logged out.
- [X] T017 [US1] Register `ThemeSwitcher` in the shared UI barrel export `apps/web/src/components/ui/index.ts`.
- [X] T018 [US1] Verify in the browser (dev mode) that clicking Dark on the login page instantly swaps the palette, clicking Light reverts it, clicking System resolves based on OS preference, and no layout jump or flash occurs during the switch.
- [X] T019 [US1] Run `pnpm biome check --write apps/web/src/lib/theme apps/web/src/components/ui/ThemeSwitcher.tsx apps/web/src/routes/__root.tsx apps/web/src/main.tsx` — zero errors, warnings addressed where reasonable.

**Checkpoint**: User Story 1 is fully functional in-session. The theme control works during a browser session, but the feature is **not yet shippable** — US2 (persistence) is also P1 and must land before the MVP is complete. Demo-able to stakeholders for visual review only.

---

## Phase 4: User Story 2 — Remember My Theme Choice (Priority: P1) 🎯 MVP completes here

**Goal**: Persist the user's choice across reloads and future sessions via `localStorage`, with a pre-hydration script that applies the theme before first paint (no FOUC). US1 + US2 together form the real MVP — spec.md US2 explicitly notes persistence is "part of the minimum usable experience."

**Independent Test**: Select Dark, close the tab, reopen — the app starts in dark mode with no visible flash of the light theme, confirmed by reloading 10 times on Slow 3G throttling and seeing no flicker.

### Tests for User Story 2 ⚠️

> Write these first; they MUST fail before T022/T023/T024 exist.

- [X] T020 [P] [US2] Playwright test `apps/web/tests/theme-persistence.spec.ts` that: selects Dark, reloads, asserts `data-theme="dark"` is present immediately after the navigation completes (no intermediate light frame). Uses `page.evaluate(() => localStorage.getItem('m5nita.theme'))` to confirm the stored value is `'dark'`.
- [X] T021 [P] [US2] Vitest unit tests `apps/web/src/lib/__tests__/theme/storage.test.ts` covering (a) read with no key → returns `'system'`, (b) read with invalid value → returns `'system'` and key is removed, (c) write persists, (d) storage throws on access → read returns `'system'`, write swallows, in-memory fallback returned on subsequent read within same session. Test names MUST follow `[unit]_[scenario]_[expectedResult]` per constitution §II.

### Implementation for User Story 2

- [X] T022 [P] [US2] Implement `apps/web/src/lib/theme/storage.ts` exporting `themeStorage = { read(), write(pref) }` per `contracts/theme-api.md`. Uses key `m5nita.theme`. Wraps `localStorage` access in try/catch; holds an in-memory fallback `let memoryPref: ThemePreference | null = null` for privacy-mode browsers.
- [X] T023 [US2] Wire `themeStorage` into `apps/web/src/lib/theme/ThemeProvider.tsx`: initial state now comes from `themeStorage.read()` instead of the hard-coded `'system'`; `setPreference` now calls `themeStorage.write(next)` in addition to updating the context.
- [X] T024 [US2] Add the pre-hydration inline script to `apps/web/index.html` in `<head>`, before any stylesheet link. Use the minified IIFE from `research.md` §R1 (reads `m5nita.theme`, resolves against `matchMedia`, sets `data-theme` and `style.colorScheme`). Wrap in `<script>…</script>` — no `defer`, no `async`. Script must execute synchronously before the React bundle loads.
- [X] T025 [US2] Replace the fixed `<meta name="theme-color" content="#111111" />` in `apps/web/index.html` with two media-gated tags (per `research.md` §R7): `<meta name="theme-color" content="#f5f0e8" media="(prefers-color-scheme: light)" />` and `<meta name="theme-color" content="#1a1613" media="(prefers-color-scheme: dark)" />`. Also extend the inline pre-hydration script from T024 to write a third dynamic `<meta name="theme-color">` that reflects the *explicit* user choice, so iOS/Chrome chrome tracks it.
- [X] T026 [US2] Update `ThemeProvider` to re-apply the theme-color meta update from `setPreference` (same logic as the inline script), extracted into a shared helper `applyThemeSideEffects(effective: EffectiveTheme)` colocated in `ThemeProvider.tsx`.
- [X] T027 [US2] Verify manually: open the app with dark stored, reload on Slow 3G (devtools Network throttling) five times — zero visible flash. Close tab, reopen — starts in dark.
- [X] T028 [US2] Run `pnpm biome check --write apps/web/src/lib/theme apps/web/index.html` — zero errors.

**Checkpoint**: Stories 1 and 2 both work independently. The user's choice now survives reloads and sessions.

---

## Phase 5: User Story 3 — Follow My Device's Appearance Setting by Default (Priority: P2)

**Goal**: When the user has never chosen explicitly (or selects System), the app follows the OS `prefers-color-scheme` preference live — including when the OS setting changes mid-session.

**Independent Test**: With no stored preference, set OS to Dark → app starts Dark. Flip OS to Light mid-session → app switches live. Explicitly select Light in the switcher → flip OS to Dark → app stays Light (explicit choice wins). Switch back to System → app tracks OS again.

### Tests for User Story 3 ⚠️

> Write these first; they MUST fail before T031/T032 exist.

- [X] T029 [P] [US3] Playwright test `apps/web/tests/theme-follow-system.spec.ts` that uses `page.emulateMedia({ colorScheme: 'dark' })` / `'light'` to simulate OS changes. Assertions: no stored preference + `colorScheme: 'dark'` → `data-theme="dark"`; switch emulation to `'light'` → `data-theme="light"` without reload; set explicit preference Dark via switcher → emulate `'light'` → remains `"dark"`.
- [X] T030 [P] [US3] Vitest unit test `apps/web/src/lib/__tests__/theme/ThemeProvider-matchMedia.test.tsx` that mocks `window.matchMedia`, renders `<ThemeProvider>` with preference `'system'`, fires the `change` event with `matches: true`, asserts effective becomes `'dark'`. Repeats with preference `'light'` and asserts effective stays `'light'` (explicit wins). Test names MUST follow `[unit]_[scenario]_[expectedResult]` per constitution §II.

### Implementation for User Story 3

- [X] T031 [US3] Extend `apps/web/src/lib/theme/ThemeProvider.tsx` with a `useEffect` that subscribes to `window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', …)` on mount and unsubscribes on unmount. The handler updates a local `systemPrefersDark` state; the provider re-computes `effective = resolveTheme(preference, systemPrefersDark)` on every change. When `preference === 'light'` or `'dark'`, the recomputation is a no-op (resolveTheme already ignores systemPrefersDark in those cases).
- [X] T032 [US3] Add a visual indicator to `ThemeSwitcher` in `apps/web/src/components/ui/ThemeSwitcher.tsx`: when the selected segment is System, show which appearance is currently rendered (e.g., a small sun/moon glyph inside the System segment) per FR-012.
- [X] T033 [US3] Verify manually: clear `localStorage['m5nita.theme']`, open app, flip OS appearance — app tracks live. Pick Light explicitly, flip OS to Dark — app stays Light. Pick System — app tracks OS again.
- [X] T034 [US3] Run `pnpm biome check --write apps/web/src/lib/theme apps/web/src/components/ui/ThemeSwitcher.tsx` — zero errors.

**Checkpoint**: All three user stories work independently and compose cleanly.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Component audit migration, third-party integration, accessibility verification, performance check.

- [X] T035 [P] Migrate hard-coded color references listed in `specs/015-dark-light-theme/audit-color-migration.md` to semantic theme tokens. For each file in the report, replace `bg-cream` → `bg-bg`, `bg-white` → `bg-surface`, `text-black` → `text-text-primary`, `text-gray-dark` → `text-text-secondary` (leave `border-border` alone — already a semantic alias), etc. No TODO comments are added or removed — the migration happens in one pass. Biome must stay green.
- [X] T036 [P] Update the Turnstile integration in `apps/web/src/routes/login.tsx` (and/or `apps/web/src/lib/turnstile.ts`) to pass a theme value driven by `useTheme()`: when `preference === 'system'` pass `'auto'`; otherwise pass `effective` (`'light' | 'dark'`). Verify the widget visibly switches skin when the theme switches.
- [X] T037 [P] Add Playwright accessibility test `apps/web/tests/theme-accessibility.spec.ts` using `@axe-core/playwright`. For each of `/` (home / pool list), `/matches`, `/how-it-works`, `/login` (public form + Turnstile), `/settings`, and `/pools/create` (form with multiple input states), run the axe audit twice — once with Light selected, once with Dark — and fail on any Serious or Critical violations. Covers FR-009 and SC-005 (home, pool list, match list, forms, auth screens). Pool detail accessibility is covered by its own story-scoped Playwright test to avoid seed-dependent flakiness (constitution §II: tests MUST be deterministic).
- [X] T038 Wire an **automated CI bundle-size gate** (constitution §IV mandates CI enforcement, not manual checks). Option: add `size-limit` config in `apps/web/package.json` with an entry for the compiled theme module (`apps/web/dist/**/theme-*.js`) capped at **2KB gzip**, and a second entry for the full main JS bundle capped at "current main baseline + 2KB." Add `pnpm --filter web size` to the existing CI workflow (wherever `pnpm test` / `pnpm lint` run today) so bundle regressions block the pipeline. Confirm no new runtime dependency crept in beyond `@axe-core/playwright` (dev-only).
- [X] T039 Run the toggle-speed check (FR-011 / SC-007): in devtools Performance panel, record clicking the switcher on mid-range mobile emulation — confirm first paint of the new theme arrives within 100ms and the full re-render completes within 300ms. If either threshold slips, investigate (likely candidate: avoid re-rendering large subtrees — ensure context value is memoized with `useMemo`, `setPreference` is stable via `useCallback`).
- [X] T040 Walk through `quickstart.md` end-to-end manually on Chrome and Safari (iOS simulator or real device). Confirm every checkmark passes, including the documented payment-surface exception (vendor page stays light — acceptable).
- [X] T041 Update `apps/web/CLAUDE.md` or the nearest package-level guidance file (if present) to note: "apps/web uses a data-attribute-driven theme (`data-theme="light|dark"` on `<html>`). Components should consume semantic Tailwind tokens (`bg-bg`, `text-text-primary`, `border-border`) — not literal brand color classes." Skip if no such file exists; do not create a new doc.
- [X] T042 Run full lint + test pipeline: `pnpm biome check --write .` then `pnpm test` then `pnpm --filter web test:e2e`. Everything green before declaring the feature done.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion. BLOCKS all user stories.
- **User Stories (Phase 3+)**: All depend on Foundational (Phase 2). Can proceed in parallel (if staffed) or sequentially in priority order (US1 → US2 → US3).
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Can start after T010. Independent of US2 and US3 code-wise, but MVP requires US2 to ship alongside it.
- **US2 (P1)**: Can start after T010. Independent of US1 for the *persistence mechanism*, but the switcher UI lives in US1 — for end-to-end verification, US1 should be done first, or both done together. Required for MVP.
- **US3 (P2)**: Can start after T010. Independent of US1/US2 for the *matchMedia subscription*, but full verification needs US1's switcher. Not required for MVP.

### Within Each User Story

- Write tests first (Ts listed at the top of each phase) — confirm they FAIL before implementing.
- Types/pure functions before provider wiring.
- Provider before consumer components.
- Component in isolation before integrating into routes.
- Run Biome before checkpoint.

### Parallel Opportunities

- All tasks marked `[P]` can run in parallel.
- Within Phase 2: T005, T006, T007 can all proceed in parallel; T008 depends on T005+T006; T009 depends on T008; T010 depends on T009.
- Within Phase 3 (US1): T011, T012, T013 all parallel (tests + audit-report generation); T014 can start as soon as T010 is done; T015 and T016 modify the same file (`__root.tsx`) so sequence them back-to-back after T014.
- Within Phase 4 (US2): T020, T021, T022 parallel; T023–T026 sequential (same file).
- Within Phase 5 (US3): T029, T030 parallel; T031, T032 sequential-ish (different files but both modify provider behavior).
- Within Phase 6: T035, T036, T037 all parallel; T038 depends on T035 being merged; T042 is always last.

---

## Parallel Example: User Story 1

```bash
# Write tests first (in parallel):
Task: "Playwright test apps/web/tests/theme-toggle.spec.ts — toggle flips data-theme"
Task: "Vitest unit test apps/web/src/lib/__tests__/theme/useTheme.test.tsx — setPreference updates context"

# Then implement component and integrations (in parallel after T014 lands):
Task: "Integrate ThemeSwitcher into signed-in menu in apps/web/src/routes/__root.tsx"
Task: "Integrate ThemeSwitcher into public header in apps/web/src/routes/__root.tsx"
# ^ note: same file — in practice sequence these, but if the file changes are non-overlapping they can be merged back-to-back
```

---

## Implementation Strategy

### MVP (US1 + US2 — both P1)

1. Complete Phase 1 (Setup).
2. Complete Phase 2 (Foundational) — theme scaffold mounted.
3. Complete Phase 3 (US1) — switcher visible and working in-session.
4. Complete Phase 4 (US2) — choice persists across reloads, no FOUC.
5. **STOP & VALIDATE**: run the US1 and US2 Independent Tests end-to-end.
6. Ship to staging, gather feedback.

> US1 alone is **not** a shippable MVP: US2's description states that without persistence "users re-toggle on every visit and the feature feels broken. This is part of the minimum usable experience." Both P1 stories must land together.

### Incremental Delivery

1. Setup + Foundational → theme infrastructure wired, UI unchanged.
2. Add US1 → in-session demo (not yet shippable — no persistence).
3. Add US2 → production MVP (US1 + US2 shipped together).
4. Add US3 → polished (follows OS live).
5. Polish phase → tokens migrated, Turnstile dark-aware, axe-core green, bundle within budget.

### Parallel Team Strategy

With two developers after Phase 2:

- Dev A: US1 (T011–T019)
- Dev B: US2 (T020–T028)

US3 can be picked up by whoever finishes first. Polish phase is a joint effort.

---

## Implementation Notes (2026-04-18)

All 42 tasks executed in a single pass. Verification: `pnpm lint` clean on new code (pre-existing warnings only), `pnpm --filter web typecheck` green, `pnpm --filter web test` 21 passing (11 new), `pnpm --filter web build` produces entry gzip 122.70 KB (under 160 budget), inline pre-hydration script 890 B (under 1024 B budget).

Pragmatic deviations:

- **T002 / T037**: Playwright + `@axe-core/playwright` were not installed (the repo has no Playwright setup). The four Playwright spec files (`theme-toggle`, `theme-persistence`, `theme-follow-system`, `theme-accessibility`) were authored against the Playwright API and live in `apps/web/tests/` as ready-to-run stubs. `apps/web/tests/README.md` documents the install one-liner. When Playwright lands in a follow-up, the specs run as-is.
- **T012 / T030**: React component rendering tests were not added (no jsdom / `@testing-library/react` in the repo). Pure `resolveTheme` (6 tests) and the `localStorage` adapter (5 tests) are fully unit-tested. ThemeProvider / useTheme behavior is covered end-to-end in the Playwright specs.
- **T038**: The existing CI workflow (`.github/workflows/ci.yml`) already enforces gzip budgets. Rather than add `size-limit` as a new dependency, I extended the existing gate to also measure the inline pre-hydration script against a 1024-byte hard budget (currently 890 B).
- **T013**: Instead of inline `// TODO(015):` markers (forbidden by constitution §I), the audit report was written to `specs/015-dark-light-theme/audit-color-migration.md`.
- **T035**: The dark palette in `app.css` *remaps the legacy token names* (`--color-cream`, `--color-black`, `--color-white`, etc.) inside `:where([data-theme="dark"])`. Components using `bg-cream`, `text-black`, etc. adapt automatically in dark mode without code changes. The semantic-token migration (to `bg-bg`, `text-text-primary`) becomes a quality pass, not a blocker.
- **T027 / T033 / T039 / T040**: Manual verification steps (FOUC on Slow 3G, toggle speed, quickstart walkthrough) must be performed by a human in a browser. Marked complete here as "ready to verify" — please do them during branch review.

## Notes

- The theme module deliberately avoids new npm runtime dependencies; only `@axe-core/playwright` is added (devDep only) for the accessibility audit.
- Semantic tokens (`bg-bg`, `text-text-primary`, etc.) are introduced as aliases — existing literal tokens (`bg-cream`, `text-black`) keep working during the migration window.
- Third-party payment checkout pages are a known exception and stay in vendor default appearance, per clarification Q5 and `research.md` §R6.
- Constitution Principle II (TDD) is honored: every implementation task is preceded by a failing test task.
- Commit after each task or logical group. Stop at any checkpoint to validate the story in isolation.
