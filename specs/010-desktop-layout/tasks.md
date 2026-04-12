# Tasks: Desktop Layout Optimization

**Input**: Design documents from `/specs/010-desktop-layout/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Tests**: No test tasks included — not explicitly requested.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new project setup needed — this feature modifies existing files only. This phase is intentionally empty.

**Checkpoint**: Ready to proceed directly to Foundational phase.

---

## Phase 2: Foundational (Root Layout Responsive Container)

**Purpose**: Remove the 430px max-width constraint on desktop and establish responsive container. This MUST be complete before any page-level changes.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete — all pages inherit layout from the root.

- [x] T001 Replace `max-w-[430px]` on the header container with responsive classes (`max-w-[430px] lg:max-w-7xl`) and adjust padding in `apps/web/src/routes/__root.tsx`
- [x] T002 Replace `max-w-[430px]` on the main content container with responsive classes (`max-w-[430px] lg:max-w-5xl`) and adjust padding in `apps/web/src/routes/__root.tsx`
- [x] T003 Verify mobile layout (< 768px viewport) renders identically after root layout changes — open all main pages in a mobile viewport and confirm no visual regressions

**Checkpoint**: Root container is responsive — desktop shows wider content area, mobile is unchanged.

---

## Phase 3: User Story 1 - Comfortable Desktop Browsing (Priority: P1) 🎯 MVP

**Goal**: Desktop users see content filling a comfortable width instead of a narrow 430px strip. All pages render correctly at the wider container width.

**Independent Test**: Open the app at 1440px viewport width. Content area should use ~60% of the viewport. No horizontal scrollbar. Smooth transitions when resizing.

### Implementation for User Story 1

- [x] T004 [P] [US1] Replace horizontal overflow scroll pattern (`-mx-5 px-5 overflow-x-auto`) with responsive wrapping (`lg:flex-wrap lg:overflow-visible lg:mx-0 lg:px-0`) for competition tabs in `apps/web/src/routes/matches.tsx`
- [x] T005 [P] [US1] Replace horizontal overflow scroll pattern for stage and group/matchday tabs in `apps/web/src/routes/matches.tsx`
- [x] T006 [P] [US1] Replace horizontal overflow scroll patterns (3 instances) for prediction tab filters in `apps/web/src/routes/pools/$poolId/predictions.tsx`
- [x] T007 [P] [US1] Remove `-mx-5 px-5` break-out pattern on desktop for the predictor list section in `apps/web/src/components/prediction/MatchPredictionsList.tsx`
- [x] T008 [P] [US1] Adjust home page layout — verified: flex-col layout expands naturally with wider container in `apps/web/src/routes/index.tsx`
- [x] T009 [P] [US1] Adjust pool detail page — verified: stats grid and action buttons render correctly at wider width in `apps/web/src/routes/pools/$poolId/index.tsx`
- [x] T010 [P] [US1] Adjust ranking page — verified: ranking rows expand with wider container in `apps/web/src/routes/pools/$poolId/ranking.tsx`
- [x] T011 [P] [US1] Adjust create pool form — verified: grids and form inputs expand naturally in `apps/web/src/routes/pools/create.tsx`
- [x] T012 [P] [US1] Adjust login page — verified: form expands with container width in `apps/web/src/routes/login.tsx`
- [x] T013 [P] [US1] Adjust settings page — verified: layout expands naturally in `apps/web/src/routes/settings.tsx`
- [x] T014 [P] [US1] Adjust how-it-works page — verified: layout expands naturally in `apps/web/src/routes/how-it-works.tsx`
- [x] T015 [P] [US1] Adjust remaining pages — verified: all use flex layouts that expand naturally in `apps/web/src/routes/complete-profile.tsx`, `apps/web/src/routes/invite/$inviteCode.tsx`, `apps/web/src/routes/pools/$poolId/manage.tsx`, `apps/web/src/routes/pools/payment-success.tsx`
- [x] T016 [US1] Build verification passed — all pages use responsive root container

**Checkpoint**: All pages render with wider content on desktop. Mobile unchanged. This is the MVP.

---

## Phase 4: User Story 2 - Improved Content Density on Desktop (Priority: P2)

**Goal**: Content-heavy pages (matches, rankings, home) use multi-column grids on desktop to show more information at a glance.

**Independent Test**: Open matches page and pool ranking at 1024px+ viewport. Match cards should show in 2+ columns. Ranking should use horizontal space effectively.

### Implementation for User Story 2

- [x] T017 [P] [US2] Add multi-column grid for match cards on desktop (`lg:grid lg:grid-cols-2 lg:gap-4`) in `apps/web/src/routes/matches.tsx`
- [x] T018 [P] [US2] Add multi-column grid for pool cards on home page on desktop (`lg:grid lg:grid-cols-2 lg:gap-4`) in `apps/web/src/routes/index.tsx`
- [x] T019 [P] [US2] Add multi-column grid for prediction score inputs on desktop (`lg:grid lg:grid-cols-2 lg:gap-4`) in `apps/web/src/routes/pools/$poolId/predictions.tsx`
- [x] T020 [P] [US2] Expand bracket display from single column to multi-column on desktop (`lg:grid-cols-2`) in `apps/web/src/components/match/Bracket.tsx`
- [x] T021 [P] [US2] Verified: MatchCard flex-1 layout scales naturally in wider grid cells in `apps/web/src/components/match/MatchCard.tsx`
- [x] T022 [P] [US2] Verified: PoolCard flex-1/truncate layout scales naturally in wider grid cells in `apps/web/src/components/pool/PoolCard.tsx`
- [x] T023 [P] [US2] Verified: ScoreInput flex-1 layout scales naturally at wider widths in `apps/web/src/components/prediction/ScoreInput.tsx`
- [x] T024 [US2] Build verification passed — multi-column grids added to matches, home, predictions, bracket

**Checkpoint**: Content pages display multi-column layouts on desktop. Match and pool cards show in grids.

---

## Phase 5: User Story 3 - Desktop-Appropriate Navigation (Priority: P3)

**Goal**: Desktop users see navigation links inline in the header bar instead of a hamburger menu. Mobile hamburger preserved.

**Independent Test**: Open the app at 1024px+ viewport. Navigation links (Home, Jogos, Como Funciona, Configurações) should be visible in the header without clicking a menu icon.

### Implementation for User Story 3

- [x] T025 [US3] Add horizontal desktop navigation links (`hidden lg:flex`) with Home, Jogos, Como Funciona, Configurações in the header area of `apps/web/src/routes/__root.tsx`
- [x] T026 [US3] Hide hamburger menu button on desktop (`lg:hidden`) while preserving mobile menu behavior in `apps/web/src/routes/__root.tsx`
- [x] T027 [US3] Style desktop navigation links to match the design system (font-display, uppercase, tracking, hover states) in `apps/web/src/routes/__root.tsx`
- [x] T028 [US3] Build verification passed — nav links use TanStack Router Link with active state styling
- [x] T029 [US3] Back button also hidden on desktop (`lg:hidden`) — mobile hamburger preserved

**Checkpoint**: Desktop shows horizontal top nav bar. Mobile hamburger menu unchanged.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification across all viewports, edge cases, and build validation.

- [ ] T030 Test all pages at intermediate viewport (768px–1024px) — layout transitions gracefully, no broken elements
- [ ] T031 Test all pages at ultra-wide viewport (2560px) — content capped at max-width, centered
- [ ] T032 Test browser window resize from mobile to desktop and back — smooth transitions, no layout jumps
- [ ] T033 Test with browser zoom at 150% on desktop — layout degrades gracefully
- [x] T034 Run `pnpm biome check --write .` — fixed 1 file, only pre-existing warnings remain
- [x] T035 Run `pnpm build` — production build succeeds with no errors
- [ ] T036 Run quickstart.md verification checklist — all items pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — start immediately. BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2) completion.
- **User Story 2 (Phase 4)**: Depends on User Story 1 (Phase 3) — needs wider container before adding multi-column grids.
- **User Story 3 (Phase 5)**: Depends on Foundational (Phase 2) only — can run in parallel with US1/US2.
- **Polish (Phase 6)**: Depends on all user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Phase 2 only. Core MVP — makes all pages work at wider width.
- **User Story 2 (P2)**: Depends on US1 — multi-column grids need the wider container to make sense.
- **User Story 3 (P3)**: Independent of US1/US2 — only modifies `__root.tsx` header section.

### Within Each User Story

- All tasks marked [P] within a phase can run in parallel.
- Non-[P] verification tasks must run after all implementation tasks in that phase.

### Parallel Opportunities

- T004–T015 (US1 implementation): All [P] — can run in parallel (different files).
- T017–T023 (US2 implementation): All [P] — can run in parallel (different files).
- US3 (Phase 5) can run in parallel with US1/US2 since it only touches `__root.tsx` header.

---

## Parallel Example: User Story 1

```bash
# All page adjustments can run in parallel (different files):
Task: "T004 - Replace overflow scroll in matches.tsx"
Task: "T006 - Replace overflow scroll in predictions.tsx"
Task: "T008 - Adjust home page in index.tsx"
Task: "T009 - Adjust pool detail page"
Task: "T010 - Adjust ranking page"
Task: "T011 - Adjust create pool form"
Task: "T012 - Adjust login page"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (root layout responsive container)
2. Complete Phase 3: User Story 1 (all pages work at wider width)
3. **STOP and VALIDATE**: Test all pages at mobile and desktop viewports
4. This alone delivers the core value — desktop no longer shows a narrow strip

### Incremental Delivery

1. Phase 2 → Root container responsive → Foundation ready
2. Add US1 → All pages render wider → Deploy/Demo (MVP!)
3. Add US2 → Multi-column grids → Deploy/Demo
4. Add US3 → Desktop nav bar → Deploy/Demo
5. Phase 6 → Polish and verify → Final release

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- This feature is CSS-only — no API, database, or business logic changes
- Commit after each phase for easy rollback
- The `-mx-5 px-5 overflow-x-auto` pattern appears 7 times across the codebase — all must be handled
- `max-w-[430px]` appears 2 times in `__root.tsx` — both handled in Phase 2
