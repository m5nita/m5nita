---
description: "Task list for 027-announcement-banner"
---

# Tasks: Global Announcement Banner

**Input**: Design documents from `/specs/027-announcement-banner/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: INCLUDED — the project Constitution mandates TDD (write test first, Red→Green→Refactor) and the plan specifies it. Test tasks precede their implementation in every phase.

**Organization**: Tasks are grouped by user story (P1 → P2 → P3) so each is an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (Setup, Foundational, and Polish carry no story label)

## Path Conventions

Frontend-only feature; all paths are under `apps/web/` (React PWA). No `apps/api`, `packages/shared`, or database changes.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Make the banner config exist and runnable locally so any story can be exercised.

- [x] T001 [P] Add the `VITE_BANNER_*` config block to `apps/web/.env.example` (documented, disabled-by-default: `VITE_BANNER_ENABLED=false`, empty `VITE_BANNER_MESSAGE`/`VITE_BANNER_LINK`/`VITE_BANNER_ID`) and add live dev values to local `apps/web/.env` (`VITE_BANNER_ENABLED=true`, a sample message, `VITE_BANNER_LINK=/how-it-works`, `VITE_BANNER_ID=copa-2026-fim`) per `contracts/configuration.md`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure config parser that all three stories depend on (produces the banner descriptor or `null`).

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

- [x] T002 Write failing unit tests for the parser in `apps/web/src/lib/announcement.test.ts` covering every rule in `data-model.md`: disabled (`VITE_BANNER_ENABLED` ≠ `true`) → `null`; missing/blank message → `null`; missing/blank link → `null`; invalid link (not `http(s)://…` and not `/…`) → `null`; valid internal `/path` → `{ isExternal: false }`; valid external `https://…` → `{ isExternal: true }`; `id` taken from `VITE_BANNER_ID` when set, else a stable hash of `message + link`; message/link are trimmed. Run and confirm they FAIL.
- [x] T003 Implement the `AnnouncementBanner` type and pure `parseAnnouncementConfig(env)` in `apps/web/src/lib/announcement.ts` to make T002 pass. Pure function only — no React, no `sessionStorage`, no globals. (depends on T002)

**Checkpoint**: Parser is green and reusable — user stories can begin.

---

## Phase 3: User Story 1 - See and act on the announcement (Priority: P1) 🎯 MVP

**Goal**: A valid, enabled banner appears at the top of every page and clicking it sends the user to the destination (internal in-app, external in a new tab).

**Independent Test**: With valid `VITE_BANNER_*` set, load home, a pool, and `/matches` → the message is visible at the top; click it → it navigates (external opens a new tab, internal navigates in-app without reload).

### Tests for User Story 1 (write first, must FAIL) ⚠️

- [x] T004 [US1] Write failing component tests in `apps/web/src/components/ui/AnnouncementBanner.test.tsx` for display + navigation: renders the configured message; an external link renders an anchor with `target="_blank"` and `rel` containing `noopener noreferrer`; an internal link renders in-app navigation (no `target="_blank"`); the banner exposes a landmark `role` with an `aria-label`. (mock `import.meta.env` / the parser input)

### Implementation for User Story 1

- [x] T005 [US1] Create `apps/web/src/components/ui/AnnouncementBanner.tsx`: call `parseAnnouncementConfig(import.meta.env)`; return `null` when it is `null`; otherwise render the banner — message + a single clickable region (anchor for external with `target="_blank" rel="noopener noreferrer"`, TanStack Router `Link`/navigation for internal `/…`) with a visible "clickable" affordance, `role="region"` + `aria-label`. Style with existing Tailwind `@theme` tokens only (e.g., `bg-red text-white`, `border-border`) so it adapts to `[data-theme="dark"]`; full layout-container width; long messages wrap without horizontal overflow. Keep the render function small — extract any non-trivial logic to module-scope helpers (Constitution I). Makes T004 pass. (depends on T003, T004)
- [x] T006 [P] [US1] Render the banner app-wide in `apps/web/src/routes/__root.tsx`: import `AnnouncementBanner` via direct path (matching the existing `ThemeSwitcher`/`TopProgressBar` imports) and place `<AnnouncementBanner />` between `</header>` and `<main>`. Add a render test (`apps/web/src/routes/__root.test.tsx`, following the existing root-test harness) asserting the banner mounts inside the root layout, so the app-wide integration point is regression-covered. (depends on T005)
- [x] T007 [P] [US1] Re-export `AnnouncementBanner` from `apps/web/src/components/ui/index.ts` for consistency with the other re-exported ui components. (depends on T005)

**Checkpoint**: MVP — the banner shows on every route and is clickable. Deployable/demoable.

---

## Phase 4: User Story 2 - Operator controls the announcement (Priority: P2)

**Goal**: The operator can turn the banner on/off and set its message/link via config (effective on deploy); when disabled or not fully/validly configured, nothing renders and there is no layout shift.

**Independent Test**: Flip `VITE_BANNER_ENABLED` false→true (dev restart / rebuild) → banner appears/disappears; set an invalid `VITE_BANNER_LINK` → banner hidden; disabled → no empty gap where it would be.

### Tests for User Story 2 (write first, must FAIL) ⚠️

- [x] T008 [US2] Add failing component tests to `apps/web/src/components/ui/AnnouncementBanner.test.tsx` for the off/degraded states: disabled config → renders nothing (empty container, no placeholder node); missing message → nothing; missing link → nothing; invalid link → nothing. (depends on T005)

### Implementation for User Story 2

- [x] T009 [US2] Wire production config injection: in the `build` stage of `apps/web/Dockerfile` add `ARG VITE_BANNER_ENABLED`, `ARG VITE_BANNER_MESSAGE`, `ARG VITE_BANNER_LINK`, `ARG VITE_BANNER_ID` (next to `ARG VITE_API_URL`) so `vite build` inlines them; document the matching Coolify build-time variables per `quickstart.md`. Confirm `AnnouncementBanner.tsx` emits NO wrapper/spacer when the parser returns `null` (makes T008 pass). (depends on T005)

**Checkpoint**: Banner can be launched, changed, and cleanly retired via config + deploy; off-state is invisible.

---

## Phase 5: User Story 3 - Dismiss without losing it forever (Priority: P3)

**Goal**: The user can dismiss the banner; it stays hidden for the session and reappears next session (or immediately when the campaign id changes); dismissing never navigates.

**Independent Test**: With the banner visible, click "×" → it disappears and does NOT navigate; reload the same tab → still hidden; start a new session (clear `sessionStorage`) → it shows again; change `VITE_BANNER_ID` → it shows again.

### Tests for User Story 3 (write first, must FAIL) ⚠️

- [x] T010 [US3] Add failing component tests to `apps/web/src/components/ui/AnnouncementBanner.test.tsx` for dismissal: clicking the dismiss control hides the banner, writes `sessionStorage['m5nita.banner.dismissed'] = banner.id`, and does NOT trigger navigation; pre-seeding `sessionStorage` with the current id → renders nothing on mount; pre-seeding with a DIFFERENT id → banner shows. (depends on T005)

### Implementation for User Story 3

- [x] T011 [US3] Extend `apps/web/src/components/ui/AnnouncementBanner.tsx`: add `isDismissed(id)` / `dismiss(id)` as module-scope helper functions (keep the component render small — Constitution I) wrapping `window.sessionStorage` (key `m5nita.banner.dismissed`, value = campaign id) in try/catch (fail open → show on storage error); add a `<button type="button" aria-label="Fechar aviso">` "×" as a SIBLING of the clickable region (no nested interactive elements) whose handler calls `stopPropagation()`, persists the dismissal, and hides via local state; gate visibility on `banner && !isDismissed(banner.id)`. Makes T010 pass. (depends on T005, T010)

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify quality bars that span the stories (theming, responsiveness, a11y, performance budget).

- [x] T012 Run the web test suite with coverage (`pnpm --filter @m5nita/web exec vitest run --coverage`; add `@vitest/coverage-v8` if not already present) and confirm new-code coverage ≥ 80% (Constitution II); run `pnpm biome check --write apps/web`; fix any failures/lint so the whole web suite and formatter are green.
- [x] T013 [P] Manual quickstart validation (`quickstart.md`): banner on home/pool/`matches` in both auth states; light & dark themes; mobile (~430px) & desktop; long-message wrap; disabled → no layout shift (FR-008, FR-009).
- [x] T014 [P] Accessibility pass (FR-010 / WCAG 2.1 AA): keyboard-activate the banner link and the dismiss button; verify the landmark role + `aria-label`s are announced; check AA contrast in both themes; confirm there are no nested interactive elements.
- [x] T015 [P] Confirm the bundle-size impact is within budget (< 10KB, Constitution IV) by comparing the `apps/web` production build size with and without the component.

---

## Dependencies & Execution Order

### Phase order

- **Setup (Phase 1)** → **Foundational (Phase 2)** blocks everything → **US1 (P1)** → **US2 (P2)** → **US3 (P3)** → **Polish (Phase 6)**.

### Task dependencies

- T001 — none.
- T002 — none (parser tests). · T003 — T002.
- T004 — none (after T003 is available to import). · T005 — T003, T004. · T006 — T005. · T007 — T005.
- T008 — T005. · T009 — T005 (Dockerfile edit itself has no code dependency, but its T008 acceptance does).
- T010 — T005. · T011 — T005, T010.
- T012 — all implementation (through T011). · T013/T014 — T006 + T011 (integrated, dismissible). · T015 — T006 (builds).

### Cross-story note

US1, US2, and US3 all extend the same file (`AnnouncementBanner.tsx` / its test). They are sequenced by priority rather than fully parallel. Each story's *behavior* is independently testable once present (display, off-state, dismiss).

### Parallel opportunities

- **Within US1**: after T005, run T006 (`__root.tsx`) and T007 (`index.ts`) in parallel — different files.
- **Polish**: T013, T014, T015 are independent and run in parallel.
- T009 (Dockerfile) can be prepared any time after Setup; it only needs T008 for its acceptance check.

---

## Parallel Example: User Story 1

```bash
# After T005 (component exists), these touch different files and run in parallel:
Task: "T006 Render <AnnouncementBanner/> in apps/web/src/routes/__root.tsx"
Task: "T007 Re-export AnnouncementBanner from apps/web/src/components/ui/index.ts"
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1 Setup (T001) → 2. Phase 2 Foundational (T002–T003) → 3. Phase 3 US1 (T004–T007).
4. **STOP and validate**: set the dev env, load the app, see the banner on every page, click it through. This is a shippable MVP.

### Incremental delivery

1. Setup + Foundational → parser ready.
2. + US1 → banner visible & clickable (MVP) → demo.
3. + US2 → operator on/off + production deploy path + clean off-state → demo.
4. + US3 → session-scoped dismiss → demo.
5. Polish → theming/a11y/perf verified.

---

## Notes

- [P] = different files, no incomplete-task dependency.
- TDD: write each test task, watch it FAIL, then implement to green; commit after each task or logical group.
- The parser (`announcement.ts`) stays pure — all `sessionStorage` lives in the component (US3).
- Single source of truth for "show?": `parseAnnouncementConfig(import.meta.env) !== null && !isDismissed(id)`.
- Build-time gotcha (from research): every new `VITE_BANNER_*` var needs its `ARG` line in `apps/web/Dockerfile` or Vite drops it from the bundle.
