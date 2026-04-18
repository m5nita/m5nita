# Implementation Plan: Dark Mode with Theme Toggle

**Branch**: `015-dark-light-theme` | **Date**: 2026-04-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/015-dark-light-theme/spec.md`

## Summary

Introduce a dark theme alongside the existing warm light theme, with a three-state control (Light / Dark / Follow System) reachable from every page. The user's choice persists per browser via `localStorage`; a new user or someone selecting "Follow System" gets the OS appearance preference via `prefers-color-scheme`, tracked live. The feature is frontend-only (no API or schema changes): Tailwind v4 CSS variables are split into a `light` and `dark` set keyed off a `data-theme` attribute on `<html>`, and an inline script in `index.html` applies the correct theme before React hydrates to avoid any flash. The dark palette is warm charcoal/ink — brand reds and greens preserved, backgrounds near-black with a slight warm undertone — matching the editorial, sports-journalism identity. Third-party embeds (Cloudflare Turnstile) receive a dark-theme prop when available; external payment checkout pages remain in their vendor default as a documented exception.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js ≥ 20
**Primary Dependencies**: React 19, TanStack Router, TanStack Query, Tailwind CSS v4 (with `@theme` inline tokens in `apps/web/src/styles/app.css`). No new runtime dependencies.
**Storage**: Browser `localStorage` (key: `m5nita.theme`). No database changes. No server-side storage, no user-table columns.
**Testing**: Vitest (unit — theme store, resolver, hook) + Playwright (integration — toggle changes `data-theme`, persists across reload, no FOUC).
**Target Platform**: Web PWA (same browsers already supported by the app — modern evergreen mobile + desktop).
**Project Type**: Web application — frontend-only slice of the existing `apps/web` package.
**Performance Goals**: First visual feedback within 100ms of user input on the theme control; full re-render within 300ms on a mid-range mobile device (FR-011 / SC-007). First paint already in correct theme (no FOUC, SC-006). Zero bundle bloat from new dependencies (hard budget: **<2KB gzip** added for the theme module including the inline pre-hydration script; enforced automatically in CI).
**Constraints**: WCAG 2.1 AA contrast (4.5:1 text, 3:1 UI) in both themes (FR-009). Inline pre-hydration script MUST execute synchronously before first paint and MUST be small (<1KB) to stay within the constitution's 1.5s FCP budget. No third-party theming library (keeps bundle lean; we already own Tailwind v4 tokens).
**Scale/Scope**: ~40 existing React route components + ~15 shared UI components will be audited for hard-coded color references and migrated to theme-aware tokens. Single shared context provider at the root.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Code Quality** — PASS.
  - The theme module is small and focused: one `ThemeProvider` context, one `useTheme` hook, one `resolveTheme` pure function. Each export has a single responsibility.
  - No raw primitives representing domain concepts: the preference uses a `ThemePreference = 'light' | 'dark' | 'system'` union (TypeScript literal type, enforceable by the compiler — the constitution's "value object" rule applies to domain primitives in the API; this is a frontend UI concern with a narrow enum).
  - Biome enforcement applies as usual; no new lint suppressions.
- **II. Testing Standards** — PASS.
  - Unit tests for the pure `resolveTheme` function (preference + system → effective theme), the `localStorage` read/write adapter (with a happy-path, a "storage unavailable" fallback, and a malformed-value fallback), and the `prefers-color-scheme` subscription.
  - Integration (Playwright): toggle cycles through 3 states, reload preserves choice, OS preference change with `system` selected updates the rendered theme, no FOUC on cold reload.
  - Coverage on new code MUST be ≥80% per the constitution.
- **III. UX Consistency** — PASS.
  - Dark theme uses the same token names (mapped via CSS variables), so every component that already consumes `bg-cream`, `text-black`, etc. automatically adapts.
  - Any component still hard-coded (found in audit) is migrated to a theme-aware token before merge — no ad-hoc styles.
  - WCAG AA is an explicit FR (FR-009) and a CI audit target.
  - Toggle control communicates current state (FR-012) and uses sun/moon/laptop iconography consistent with the rest of the app's SVG style.
- **IV. Performance Requirements** — PASS.
  - Pre-hydration inline script is <1KB and executes synchronously before the React bundle parses, preserving the 1.5s FCP target.
  - Toggle is a CSS-variable swap (no re-render of subtree via prop drilling, no layout thrash): meets the constitution's <100ms interaction-feedback budget, full re-render completes within 300ms per FR-011 / SC-007.
  - Zero new npm dependencies → zero bundle increase from library adoption.
- **V. Hexagonal Architecture & SOLID** — N/A for this slice.
  - This is a frontend-only feature. The API backend's hexagonal structure is not affected; no domain entities, use cases, or ports are added or modified.
  - On the frontend, the constitution's three-layer mandate does not apply verbatim, but the theme module still follows SRP/DIP in spirit: the `resolveTheme` pure function is separated from the `localStorage` adapter and from the React context that wires them.
  - Documented as a `Pragmatic scope` case per the constitution (§V): "Not every domain needs full hexagonal treatment. Simple … MAY remain as thin services."

**Result**: All applicable gates pass. No entries in Complexity Tracking required.

## Project Structure

### Documentation (this feature)

```text
specs/015-dark-light-theme/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (preference state shape)
├── quickstart.md        # Phase 1 output (how to verify the feature)
├── contracts/
│   └── theme-api.md     # Phase 1 output (ThemeProvider/useTheme contract)
└── checklists/
    └── requirements.md  # Created by /speckit.specify
```

### Source Code (repository root)

```text
apps/web/
├── index.html                              # MODIFY — inline pre-hydration theme script in <head>
├── src/
│   ├── main.tsx                            # MODIFY — wrap app in <ThemeProvider>
│   ├── lib/
│   │   ├── theme/                          # NEW
│   │   │   ├── ThemeProvider.tsx           # React context; subscribes to matchMedia; writes data-theme
│   │   │   ├── useTheme.ts                 # Public hook — returns {preference, effective, setPreference}
│   │   │   ├── resolveTheme.ts             # Pure function: (preference, systemPrefersDark) → 'light' | 'dark'
│   │   │   ├── storage.ts                  # localStorage read/write with fallbacks
│   │   │   └── index.ts                    # Barrel export
│   │   └── __tests__/
│   │       └── theme/                      # NEW — unit tests for resolveTheme, storage, hook
│   ├── components/
│   │   └── ui/
│   │       └── ThemeSwitcher.tsx           # NEW — three-segment control (Light / Dark / System)
│   ├── routes/
│   │   ├── __root.tsx                      # MODIFY — add ThemeSwitcher to user menu AND public header
│   │   └── login.tsx                       # MODIFY — pass resolved theme to Turnstile widget
│   └── styles/
│       └── app.css                         # MODIFY — split tokens into :root (light) + [data-theme="dark"]
apps/web/tests/                              # MODIFY — add Playwright spec for theme toggle + no-FOUC check
```

**Structure Decision**: The feature is a frontend-only slice inside the existing `apps/web` package. A new `src/lib/theme/` module encapsulates all theme logic (separation of concerns per Principle I); the single UI component `ThemeSwitcher` is added under `src/components/ui/`; CSS tokens are reorganized in the existing `src/styles/app.css` (no new stylesheet); the pre-hydration script lives inline in `index.html`. No backend changes. No package-level additions — this fits naturally into the existing web app structure described in CLAUDE.md.

## Complexity Tracking

> No constitutional violations require justification. Table intentionally empty.
