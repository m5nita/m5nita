# Desktop Editorial Layout Design

**Date**: 2026-04-12
**Branch**: 010-desktop-layout
**Status**: Approved

## Problem

The app constrains all content to 430px on every viewport. Previous attempt just expanded the container and added `grid-cols-2` — result looked like "stretched mobile", not a real desktop experience.

## Design Decisions

### 1. Layout: Grid Editorial Full-Width

Home page and content pages use a magazine-style editorial grid at `lg:` breakpoint (≥1024px):

- **Pool cards**: Grid of 3 columns with large index number (01, 02...), bold 2px border, white background. Last slot can be a "Criar Bolão" dashed card.
- **Match strip**: Upcoming matches in a horizontal grid of 4 compact cards (team flags, time).
- **Max-width**: 1200px centered (`max-w-7xl` on outer container).
- **Content max-width**: `max-w-6xl` for main content area.
- **Typography scales up**: Headings larger on desktop, more whitespace between sections.

### 2. Navigation: Horizontal Top Bar

Already implemented. Links inline in header: Home, Jogos, Como funciona?, Configurações. Hamburger hidden on desktop. Keep as-is.

### 3. Forms: Centered Card (~500px)

Login, create pool, settings, complete-profile pages:

- Form wrapped in a white card (`bg-surface border border-border`) with padding.
- Card max-width ~500px, centered horizontally.
- Cream background visible around the card.
- On mobile (<lg), no card — same as current mobile layout.

### 4. Content Pages Adaptations

**Matches page**:
- Filter tabs: flex-wrap instead of horizontal scroll on desktop.
- Match cards: grid of 2-3 columns.

**Predictions page**:
- Score inputs: grid of 2 columns.
- Filter tabs: same flex-wrap treatment.

**Ranking page**:
- Wider rows with more horizontal spacing.
- Prize box can be wider.

**Pool detail page**:
- Stats grid (3 cols) with wider cells and more padding.
- Action buttons in a row instead of stacked.

**How it works page**:
- Steps timeline can have more horizontal space.
- Scoring rules in wider layout.

### 5. Pool Card Redesign for Desktop

Current PoolCard is a horizontal list item (index + name + position). On desktop, it becomes a **card** with:
- Large index number (01, 02) in red
- Pool name bold uppercase
- Member count and entry fee
- User position and points
- 2px black border, white background
- Vertical layout inside the card

### 6. Breakpoint Strategy

- `< 1024px`: Current mobile layout exactly (no changes)
- `≥ 1024px` (`lg:`): Desktop editorial layout activates
- All changes use Tailwind `lg:` prefix only

## Pages Summary

| Page | Desktop Treatment |
|------|-------------------|
| Home (auth) | 3-col pool card grid + 4-col match strip |
| Home (unauth) | Centered hero, wider steps |
| Matches | 2-3 col match grid, wrapped filter tabs |
| Predictions | 2-col score inputs, wrapped tabs |
| Ranking | Wider rows, larger prize box |
| Pool Detail | Wider stats, horizontal action buttons |
| Login | Centered card ~500px |
| Create Pool | Centered card ~500px |
| Settings | Centered card ~500px |
| Complete Profile | Centered card ~500px |
| How it Works | Wider content, same structure |
| Invite | Centered card ~500px |
| Manage | Wider content area |
| Payment Success | Centered card ~500px |
