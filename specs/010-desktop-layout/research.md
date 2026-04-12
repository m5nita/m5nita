# Research: Desktop Layout Optimization

**Feature**: 010-desktop-layout | **Date**: 2026-04-12

## R1: Current Layout Constraints

**Decision**: The app uses a fixed `max-w-[430px]` constraint on both the header and main content container in `__root.tsx`. This is applied globally regardless of viewport.

**Findings**:
- `max-w-[430px]` appears on the header (line 107) and main content area (line 131) in `__root.tsx`
- Side padding is `px-5` (20px) on all content
- Several components use `-mx-5 px-5 overflow-x-auto` to break out of the container for horizontal scrolling (matches.tsx, predictions.tsx, MatchPredictionsList.tsx)
- No responsive breakpoints or media queries exist anywhere in the frontend

**Rationale**: The app was designed as a mobile PWA first. Desktop was never targeted.

## R2: Responsive Breakpoint Strategy (Tailwind v4)

**Decision**: Use Tailwind v4's built-in responsive prefixes (`md:`, `lg:`, `xl:`) for progressive enhancement.

**Breakpoints**:
- `< 768px` (default): Mobile — current layout preserved exactly
- `md` (≥ 768px): Tablet — transitional, wider container
- `lg` (≥ 1024px): Desktop — full responsive layout, horizontal nav, multi-column grids
- `xl` (≥ 1280px): Large desktop — max-width cap at 1200px

**Rationale**: Tailwind v4 responsive prefixes are the standard approach. Mobile-first means no prefix = mobile, and `lg:` prefix = desktop enhancements. No custom breakpoints needed.

**Alternatives considered**:
- Container queries: Overkill for this scope, adds complexity
- Custom CSS breakpoints in app.css: Unnecessary since Tailwind handles this
- JavaScript-based viewport detection: Unnecessary for CSS-only layout changes

## R3: Maximum Content Width for Desktop

**Decision**: Use `max-w-5xl` (1024px) for content area on desktop, within a `max-w-7xl` (1280px) outer container.

**Rationale**: 
- 1024px content width provides comfortable reading and allows multi-column grids
- 1280px outer container gives room for the header/nav to be wider than content
- Ultra-wide screens (2560px+) center the content with auto margins
- This keeps content density manageable without feeling overly spread

**Alternatives considered**:
- `max-w-6xl` (1152px): Slightly too wide for dense card content
- Full viewport width: Bad for readability, no maximum cap
- `max-w-4xl` (896px): Too narrow, barely improves on mobile

## R4: Navigation Pattern for Desktop

**Decision**: Horizontal top navigation bar with links inline in the existing header area.

**Findings from codebase**:
- Current hamburger menu shows: Home, Matches, How it Works, Settings
- Menu is toggle-based with full-page overlay (`fixed inset-0`)
- Back button is conditionally hidden on home/login pages
- On desktop: show nav links inline in header, hide hamburger icon
- On mobile: preserve current hamburger menu behavior exactly

**Implementation approach**:
- Use `hidden lg:flex` for desktop nav links
- Use `lg:hidden` to hide hamburger on desktop
- Back button can remain for deep pages, or be removed on desktop since nav provides context

## R5: Horizontal Scroll Pattern Replacement

**Decision**: On desktop, replace `-mx-5 px-5 overflow-x-auto` horizontal scroll patterns with flex-wrap or full display.

**Files affected**:
- `matches.tsx` (3 instances): competition tabs, stage tabs, group/matchday tabs
- `predictions.tsx` (3 instances): same tab patterns
- `MatchPredictionsList.tsx` (1 instance): predictor list break-out

**Approach**: Use `lg:flex-wrap lg:overflow-visible lg:mx-0 lg:px-0` to let content wrap naturally on desktop.

## R6: Grid Layout Desktop Adaptations

**Decision**: Expand mobile grids to use more columns on desktop.

**Current → Desktop mappings**:
- `grid-cols-3` (pool stats) → `lg:grid-cols-3` (keep, but with wider cells)
- `grid-cols-4` (fee buttons) → `lg:grid-cols-6` or `lg:grid-cols-8`
- `grid-cols-2` (matchday inputs) → `lg:grid-cols-4`
- `grid-cols-1` (bracket) → `lg:grid-cols-2`
- Match card list (single column) → `lg:grid-cols-2` or `lg:grid-cols-3`
- Pool card list (single column) → `lg:grid-cols-2`

## R7: Files Requiring Modification

**Priority order**:

| Priority | File | Changes |
|----------|------|---------|
| 1 | `__root.tsx` | Remove 430px cap, add responsive max-width, desktop nav |
| 2 | `app.css` | Optional: add any base responsive utilities |
| 3 | `matches.tsx` | Multi-column match cards, unwrap scroll tabs |
| 4 | `predictions.tsx` | Unwrap scroll tabs, wider score inputs |
| 5 | `index.tsx` (home) | Multi-column pool list, wider hero |
| 6 | `pools/$poolId/index.tsx` | Wider stat grid |
| 7 | `pools/$poolId/ranking.tsx` | Wider ranking rows |
| 8 | `pools/create.tsx` | Wider form, more grid columns |
| 9 | `login.tsx` | Wider form layout |
| 10 | `MatchCard.tsx` | Adjust flex proportions for wider container |
| 11 | `PoolCard.tsx` | Adjust proportions |
| 12 | `ScoreInput.tsx` | Wider score input area |
| 13 | `MatchPredictionsList.tsx` | Remove break-out pattern on desktop |
| 14 | `Bracket.tsx` | Multi-column bracket display |
| 15 | Other pages | settings, how-it-works, invite, manage, complete-profile, payment-success |
