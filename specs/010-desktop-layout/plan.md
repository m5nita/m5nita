# Implementation Plan: Desktop Layout Optimization

**Branch**: `010-desktop-layout` | **Date**: 2026-04-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-desktop-layout/spec.md`

## Summary

The application currently constrains all content to a fixed 430px-wide column, regardless of viewport size. On desktop screens this wastes ~70% of available space. This plan adds responsive desktop layout support using Tailwind v4 breakpoint prefixes (`md:`, `lg:`, `xl:`), converting the mobile hamburger menu to a horizontal top nav bar on desktop, and adapting page content grids for multi-column display — while preserving the existing mobile layout exactly.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js >= 20)  
**Primary Dependencies**: React 19, TanStack Router, TanStack Query, Tailwind CSS v4  
**Storage**: N/A (no data changes)  
**Testing**: Vitest (unit), Playwright (visual/E2E), manual browser testing  
**Target Platform**: Web (PWA) — desktop browsers ≥ 1024px viewport  
**Project Type**: Web application (monorepo: apps/api + apps/web + packages/shared)  
**Performance Goals**: No layout shifts, smooth resize transitions, no bundle size increase > 2KB  
**Constraints**: Zero visual regressions on mobile (< 768px), CSS-only changes (no JS viewport detection)  
**Scale/Scope**: ~15 files in apps/web/src/ (routes + components + CSS)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | PASS | CSS class additions only, no new abstractions or logic |
| II. Testing Standards | PASS | Visual testing via Playwright + manual browser verification |
| III. UX Consistency | PASS | Desktop layout follows existing design system (colors, typography, spacing tokens unchanged) |
| IV. Performance Requirements | PASS | CSS-only changes, no bundle size impact, no runtime performance impact |

No constitution violations. No complexity tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/010-desktop-layout/
├── plan.md              # This file
├── research.md          # Phase 0 output — breakpoint strategy, file inventory
├── data-model.md        # Phase 1 output — no schema changes
├── quickstart.md        # Phase 1 output — dev setup and verification
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
apps/web/src/
├── styles/
│   └── app.css                          # Base theme (optional responsive utilities)
├── routes/
│   ├── __root.tsx                       # ROOT: max-width, header, nav bar
│   ├── index.tsx                        # Home page
│   ├── login.tsx                        # Login form
│   ├── matches.tsx                      # Matches calendar
│   ├── settings.tsx                     # Settings page
│   ├── how-it-works.tsx                 # Info page
│   ├── complete-profile.tsx             # Profile completion
│   ├── invite/
│   │   └── $inviteCode.tsx              # Invite page
│   └── pools/
│       ├── create.tsx                   # Create pool form
│       ├── payment-success.tsx          # Payment success
│       └── $poolId/
│           ├── index.tsx                # Pool detail
│           ├── ranking.tsx              # Pool ranking
│           ├── predictions.tsx          # Make predictions
│           └── manage.tsx               # Pool management
└── components/
    ├── match/
    │   ├── MatchCard.tsx                # Match card component
    │   └── Bracket.tsx                  # Tournament bracket
    ├── pool/
    │   ├── PoolCard.tsx                 # Pool card component
    │   ├── InviteTicket.tsx             # Invite display
    │   ├── PixKeyInput.tsx              # Pix key input
    │   └── PrizeWithdrawal.tsx          # Prize withdrawal
    └── prediction/
        ├── ScoreInput.tsx               # Score input component
        └── MatchPredictionsList.tsx      # Predictions list
```

**Structure Decision**: No new files or directories needed. All changes are responsive class additions to existing files.

## Implementation Phases

### Phase 1: Foundation — Root Layout & Navigation (Critical Path)

**Goal**: Remove the 430px constraint on desktop and implement horizontal nav bar.

**File**: `apps/web/src/routes/__root.tsx`

**Changes**:
1. **Header container**: Replace `max-w-[430px]` with responsive `max-w-[430px] lg:max-w-7xl` and adjust padding
2. **Navigation**: Add desktop nav links (`hidden lg:flex`) with: Home, Jogos, Como Funciona, Configurações
3. **Hamburger menu**: Add `lg:hidden` to hamburger button, preserve mobile behavior
4. **Main content container**: Replace `max-w-[430px]` with `max-w-[430px] lg:max-w-5xl` for content area
5. **Back button**: Keep on mobile, evaluate visibility on desktop (nav provides context)

**Acceptance**: Desktop viewport shows horizontal nav bar in header; mobile shows unchanged hamburger menu. Content area wider on desktop.

### Phase 2: Content Pages — Multi-Column Grids

**Goal**: Adapt page content to use wider desktop space meaningfully.

#### 2a: Home Page (`routes/index.tsx`)
- Pool cards list: Add `lg:grid lg:grid-cols-2 lg:gap-4` for pool cards
- Upcoming matches: Multi-column grid on desktop
- Create pool / join buttons: Can expand to fill row

#### 2b: Matches Page (`routes/matches.tsx`)
- Tab filters (competition, stage, group): Replace `-mx-5 px-5 overflow-x-auto` with `lg:flex-wrap lg:overflow-visible lg:mx-0 lg:px-0`
- Match card list: Add `lg:grid lg:grid-cols-2 lg:gap-4` for multi-column display

#### 2c: Pool Detail (`routes/pools/$poolId/index.tsx`)
- Stats grid (`grid-cols-3`): Widen cells, adjust spacing for desktop
- Action buttons: Can sit side by side on desktop

#### 2d: Pool Ranking (`routes/pools/$poolId/ranking.tsx`)
- Ranking list: Add more horizontal spacing, wider row items
- Consider showing additional stats visible on desktop

#### 2e: Predictions (`routes/pools/$poolId/predictions.tsx`)
- Tab filters: Same unwrap pattern as matches page
- Score input list: Consider `lg:grid-cols-2` for side-by-side matches

### Phase 3: Forms & Remaining Pages

**Goal**: Ensure all pages render correctly at desktop widths.

#### 3a: Create Pool (`routes/pools/create.tsx`)
- Fee buttons grid: `grid-cols-4` → `lg:grid-cols-6` or `lg:grid-cols-8`
- Matchday inputs: `grid-cols-2` → `lg:grid-cols-4`
- Form expands with container (no special narrow treatment per clarification)

#### 3b: Login (`routes/login.tsx`)
- Form expands with container width per clarification (no special centering)

#### 3c: Other pages
- `settings.tsx`: Form expands naturally
- `how-it-works.tsx`: Content expands, timeline may be side-by-side
- `complete-profile.tsx`: Form expands
- `invite/$inviteCode.tsx`: Content expands
- `pools/manage.tsx`: Member list wider, more spacing
- `pools/payment-success.tsx`: Center expand

### Phase 4: Component Adjustments

**Goal**: Fine-tune shared components for desktop rendering.

- **MatchCard.tsx**: Verify flex proportions work at wider container
- **PoolCard.tsx**: Verify truncation and spacing at wider widths
- **ScoreInput.tsx**: Score input boxes may need slightly larger sizing on desktop
- **MatchPredictionsList.tsx**: Remove `-mx-5 px-5` break-out on desktop
- **Bracket.tsx**: Expand `grid-cols-1` to `lg:grid-cols-2` for knockout bracket
- **InviteTicket.tsx**: Verify centered display works at wider widths

### Phase 5: Polish & Verification

**Goal**: Cross-browser testing, visual regression check, final tweaks.

- Test all pages at 768px, 1024px, 1280px, 1440px, 1920px, 2560px viewports
- Verify mobile (375px, 430px) is pixel-identical to main branch
- Test browser resize transitions for smooth behavior
- Run `pnpm biome check --write .` for linting
- Run `pnpm build` to verify no build errors
- Verify no horizontal scrollbars on any desktop page

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Mobile regression from responsive classes | High | Test every page at mobile widths before/after; `lg:` prefix ensures mobile classes are unchanged |
| Horizontal scroll patterns break on desktop | Medium | Test `-mx-5 px-5` break-out replacement carefully; keep mobile pattern, override on `lg:` only |
| Content looks sparse at ultra-wide | Low | Max-width cap (`max-w-5xl`) prevents infinite stretching |
| Components designed for narrow widths look odd wide | Medium | Phase 4 reviews each component at desktop width |
