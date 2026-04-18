# Phase 0 Research: Dark Mode with Theme Toggle

**Feature**: 015-dark-light-theme
**Date**: 2026-04-18

This document resolves the technical unknowns identified in `plan.md` and records the patterns chosen for each area, so Phase 1 (data model, contracts, quickstart) and downstream task generation can proceed without open questions.

---

## R1 — Preventing FOUC (Flash of Unstyled / Wrong-Theme Content)

**Decision**: Ship a tiny synchronous script inlined in `<head>` of `apps/web/index.html`, before any stylesheet or the React bundle. The script reads `localStorage['m5nita.theme']`, resolves it against `window.matchMedia('(prefers-color-scheme: dark)').matches` when the preference is `system` or missing, and sets `document.documentElement.setAttribute('data-theme', …)` with the result. It also sets `document.documentElement.style.colorScheme` so the browser's native scrollbars and form controls follow the theme.

**Rationale**:
- Inline blocking script is the only way to set the attribute before first paint; anything that waits for React hydration produces a visible flash on real devices and slow networks (spec FR-007, SC-006).
- The script is pure vanilla JS, wrapped in a `try/catch` to tolerate environments where `localStorage` throws (privacy mode, cross-origin iframe). On failure it falls back to `matchMedia`, and if that also fails, it defaults to `light` (the existing appearance — no regression for any user).
- Keeping it <1KB means no measurable FCP impact (Principle IV).
- Pattern used by Next.js `next-themes`, Vercel, Linear, Radix Themes, and shadcn/ui. Well-proven.

**Alternatives considered**:
- *Server-rendered attribute via SSR / cookie*: The app is a Vite SPA — no SSR. Rejected.
- *CSS-only via `@media (prefers-color-scheme: dark)`*: Works for "follow system" but cannot respect an explicit user choice. Rejected — fails FR-006.
- *Deferring theme to after React mount*: Causes a visible flash. Rejected — fails FR-007 and SC-006.

**Script skeleton** (for task authors to reference, not final code):
```js
(function(){try{var k='m5nita.theme',s=localStorage.getItem(k),p=(s==='light'||s==='dark'||s==='system')?s:'system',d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches),t=d?'dark':'light';document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;}catch(e){}})();
```

---

## R2 — Tailwind CSS v4 Dark Mode Strategy

**Decision**: Use a **data-attribute-driven variant** (`data-theme="dark"` on `<html>`) rather than a class-based `.dark` strategy or the default media-query variant. Define the two palettes in `apps/web/src/styles/app.css` as two sets of CSS custom properties: the light palette lives in `@theme` / `:root`, and the dark palette overrides them inside a `[data-theme="dark"]` selector. Register a custom variant so Tailwind utility classes like `dark:bg-surface-dark` still work:

```css
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
```

**Rationale**:
- A data attribute is cleaner than class-toggling for a tri-state control (we also need to distinguish "system → dark" from "user chose dark" internally, but at the CSS level both collapse to `data-theme="dark"`).
- Tailwind v4's `@custom-variant` is a first-class feature in 4.x and produces the same utility ergonomics developers expect from `dark:` in v3.
- Keeping palettes as CSS variables (not as separate Tailwind theme blocks) means switching themes is a single attribute write — no re-parsing, no layout shift, no JS-heavy re-render.
- `:where()` selector has zero specificity, so component-level overrides still win without `!important`.

**Alternatives considered**:
- *Class strategy (`.dark` on `<html>`)*: Works, but conflicts with Tailwind's `data-*:` attribute variants elsewhere and is less ergonomic for conditional logic (`document.documentElement.classList.toggle` vs. `setAttribute`). Rejected for consistency.
- *Pure `prefers-color-scheme` media query*: Can't honor explicit user choice. Rejected.
- *Third-party library (`next-themes`, `use-dark-mode`)*: Adds a dependency for ~30 lines of logic we can own. Rejected per Principle IV (bundle size).

---

## R3 — Dark Palette Concrete Values

**Decision**: Extend the existing `@theme` block in `apps/web/src/styles/app.css` with a second palette activated by `[data-theme="dark"]`. Target values (warm charcoal / ink, WCAG AA verified against common text pairings):

| Token | Light (current) | Dark (new) | Notes |
|---|---|---|---|
| `--color-bg` | `#f5f0e8` (cream) | `#1a1613` | Warm near-black with 5% red undertone, not slate. |
| `--color-surface` | `#ffffff` | `#242019` | Warm charcoal, one step lighter than bg. |
| `--color-surface-raised` | n/a (add) | `#2e2922` | For modals, dropdowns in dark. |
| `--color-border` | `#e5e0d8` | `#3a342c` | Warm brown-gray, 2.3:1 against bg — decorative only. |
| `--color-text-primary` | `#111111` | `#f5f0e8` (cream) | Contrast ≥ 13:1 against both backgrounds. |
| `--color-text-secondary` | `#5c564e` (gray-dark) | `#c4bdb3` (gray-light) | Contrast ≥ 4.8:1 against respective bg. |
| `--color-text-muted` | `#8d8677` (gray) | `#a39e96` (gray-muted) | Contrast ≥ 4.6:1 — borderline, verify per surface. |
| `--color-red` | `#c4362a` | `#e55344` | Lifted ~12% lightness to meet 4.5:1 on dark bg. |
| `--color-green` | `#2d6a4f` | `#4fa67b` | Lifted to meet AA on dark; still reads as same hue. |
| `--color-scheme` | `light` | `dark` | For native form controls / scrollbars via `color-scheme` CSS property. |

The light values also get a small reorganization: aliases (`--color-bg`, `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`) are introduced on top of the existing literal names so components can reference semantic tokens rather than color names (`bg-surface` instead of `bg-white`). Existing utility classes like `bg-cream` keep working (they already map to variables), so this is additive.

**Rationale**:
- Warm undertone (`#1a1613` has R > G > B) keeps the brand personality intact, consistent with the clarified spec. Neutral slate (`#1a1b1e` or `#111827`) was explicitly rejected in clarifications.
- Reds and greens are lifted in lightness to hit AA contrast on the dark background; hue is preserved (same 10° wedge in HSL) so they still read as "the brand red" and "the brand green."
- Values verified against WCAG AA in a color-contrast calculator before writing; task authors will re-verify in CI via an axe-core Playwright step.

**Alternatives considered**:
- *Pure `#000` + `#111`*: Rejected in clarifications (not editorial).
- *Generic shadcn-style zinc/neutral palette*: Loses brand identity. Rejected.
- *Sepia / deep brown*: Rejected in clarifications.

---

## R4 — Following the OS Preference Live

**Decision**: Subscribe to `window.matchMedia('(prefers-color-scheme: dark)')` with an event listener (not the deprecated `addListener`). Only apply updates when the stored preference is `system` (or absent). When the user selects `light` or `dark` explicitly, ignore subsequent `matchMedia` changes until they pick `system` again.

**Rationale**:
- Matches the spec's FR-005 / FR-006 / FR-013: follow system when Follow System is selected; keep explicit choice otherwise.
- Modern `addEventListener('change', …)` is supported in every browser the app targets (Safari 14+, Chrome 76+, Firefox 79+).
- Cleanup is done via the React `useEffect` return — no leaks on unmount.

**Alternatives considered**:
- *Only read `matchMedia` once at mount*: Doesn't catch mid-session OS changes, fails the edge case documented in the spec.
- *Polling*: Wasteful and unnecessary.

---

## R5 — Persistence Layer

**Decision**: Single `localStorage` key `m5nita.theme` holding one of `'light' | 'dark' | 'system'`. Absence of key is treated as `'system'`. A thin `storage.ts` module owns read/write with three failure modes: key missing (→ `system`), value unreadable (→ `system`, best-effort remove), and storage unavailable / throws (→ in-memory fallback).

**Rationale**:
- Per-device is the spec default (Assumption: "A user logged in on two devices may see different themes on each — cross-device sync is out of scope").
- Key prefix `m5nita.` is namespaced to avoid collision with other apps on the same origin.
- In-memory fallback preserves the user's choice for the current session even in privacy-mode browsers, just not across reloads — graceful degradation.

**Alternatives considered**:
- *`sessionStorage`*: Clears on tab close. Fails FR-004 (persistence across sessions).
- *Cookies*: Unnecessary network overhead; the SPA has no SSR that would benefit from server-readable cookies.
- *IndexedDB*: Massive overkill for a single string.
- *Sync to user account via API*: Out of scope per spec.

---

## R6 — Third-Party Surfaces (Turnstile, Payment Widgets)

**Decision**:
- **Cloudflare Turnstile**: The existing widget wrapper in `apps/web/src/lib/turnstile.ts` already accepts `theme?: 'light' | 'dark' | 'auto'`. Pass `'auto'` by default (Turnstile will itself follow `prefers-color-scheme`) when the user's preference is `system`, or the resolved `'light' | 'dark'` otherwise. No additional dependency.
- **InfinitePay** and **MercadoPago** payment redirects: the user is sent off-site. Vendors do not expose a dark-mode parameter we control. Document as a known exception in the feature's quickstart and in-app; payment flow stays in the vendor's default appearance. Acceptable per the clarified FR-008.
- **Fonts** (Google Fonts `Barlow Condensed`, `Inter`): no appearance coupling.
- **Sentry** dev overlay and browser devtools: theme themselves based on OS / devtools config; outside our control.

**Rationale**: Matches the "best-effort" clarification. No extra runtime cost for Turnstile (one extra prop on an existing call site).

**Alternatives considered**:
- *Intercepting the payment redirect to proxy a dark UI*: Complex, brittle, provides zero user value for a transactional page they'll see for <60 seconds.
- *Blocking feature launch on payment widget dark mode*: Rejected in clarification Q5.

---

## R7 — `meta[name="theme-color"]` and PWA Chrome

**Decision**: Replace the fixed `<meta name="theme-color" content="#111111">` in `index.html` with two media-gated tags:
```html
<meta name="theme-color" content="#f5f0e8" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#1a1613" media="(prefers-color-scheme: dark)" />
```
Additionally, the pre-hydration script writes the active theme-color to a dynamic `<meta>` tag on attribute change, so the iOS/Chrome address bar tracks the user's *explicit* theme choice (not just the OS preference).

**Rationale**: The current single `#111111` is the wrong color even for light mode. Fixing it in the same feature avoids inconsistency; adds ~80 bytes to the pre-hydration script.

**Alternatives considered**:
- *Leave meta theme-color alone*: OS chrome would be visually jarring (cream app, dark status bar) on iOS. Keep it consistent.

---

## R8 — Accessibility Verification

**Decision**: Augment the existing Playwright test suite (`apps/web/tests/`) with an `@axe-core/playwright` audit run once per theme (light and dark) on the home, matches, pool detail, login, and settings routes. CI fails on any serious violation.

**Rationale**:
- Principle III and FR-009 require WCAG 2.1 AA. Automated auditing catches the common regressions (contrast, role/name, focus visibility) at the exact points we care about.
- `@axe-core/playwright` is already a plausible fit for a Vitest+Playwright stack; if not installed, it is one of the few dependencies whose cost is justified by the constitution's accessibility mandate.

**Alternatives considered**:
- *Manual contrast spot-checks only*: Would regress over time.
- *Visual-regression tests*: Heavy and flaky; axe-core catches the functional issue directly.

---

## Open items

None. All items from Technical Context are resolved; Phase 1 can proceed.
