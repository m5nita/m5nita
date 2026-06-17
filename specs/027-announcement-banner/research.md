# Phase 0 Research: Global Announcement Banner

**Feature**: `027-announcement-banner` · **Date**: 2026-06-17

All three product-level unknowns (placement, configuration model, dismissal behavior) were resolved during `/speckit.specify` and recorded in the spec's **Clarifications** section. This document captures the remaining *technical* decisions and their rationale. No `NEEDS CLARIFICATION` items remain.

---

## D1 — How is banner content delivered to the app?

**Decision**: Build-time **Vite environment variables** (`import.meta.env.VITE_BANNER_*`), read synchronously by the frontend. No API endpoint, no runtime fetch.

**Rationale**:
- Matches the user's explicit choice: "Config do sistema (deploy) — bem mais simples."
- Mirrors the existing config pattern in the codebase (`VITE_API_URL`, `VITE_TURNSTILE_SITE_KEY`, `VITE_SENTRY_DSN` in `apps/web/src/lib/*`).
- **Zero layout shift / no flash** (Success Criterion SC-005): the config is available at first render, so the banner never "pops in" after a network round-trip. A runtime fetch would either delay the banner or cause CLS unless extra reservation/loading logic were added.
- Smallest possible surface area: no new endpoint, no public route, no caching, and it does **not** engage the API's hexagonal-architecture guardrails (Constitution V, G2/G3).

**Alternatives considered**:
- **Runtime config endpoint on the API** (`GET /api/announcement` reading API env): would let the operator change content with only an API restart (no web rebuild). Rejected for v1 — adds an endpoint, a fetch-on-load, loading/flash handling, and more moving parts, for a banner toggled on/off roughly twice per campaign. Documented as the natural upgrade path if live editing is ever wanted.
- **In-app admin UI + DB-backed config**: explicitly chosen *against* by the user (more work; not needed for occasional announcements). Listed as Out of Scope in the spec.

**Tradeoff accepted**: Changing the message/link requires a **web rebuild + redeploy**. Acceptable given the cadence (one World-Cup-end campaign; occasional reuse). Note for the operator: on the small prod box, schedule the rebuild when it won't compete with other builds.

---

## D2 — How does production receive the env values?

**Decision**: Add `ARG VITE_BANNER_*` lines to the `build` stage of `apps/web/Dockerfile` and set them as **Coolify build-time variables**. Vite/esbuild reads them from the build environment during `vite build` (same mechanism as the existing `ARG VITE_API_URL`).

**Rationale**: Vite only inlines `VITE_*` values that are present in the environment at build time. The Dockerfile already demonstrates the pattern. Without the `ARG` declaration the value is silently dropped from the bundle — this is the one easy-to-miss step, so it is called out explicitly in `quickstart.md`.

**Alternatives considered**: a committed `.env.production` file — rejected; mixing config into source is worse than build args and risks leaking stale campaign copy into git history.

---

## D3 — Where is the banner rendered so it is "app-wide"?

**Decision**: Render `<AnnouncementBanner />` in `apps/web/src/routes/__root.tsx`, between the sticky `<header>` and `<main><Outlet/></main>`.

**Rationale**:
- The root layout wraps **every** route, so one insertion satisfies "em todo o app" (FR-001) for authenticated and unauthenticated users alike — including the landing/home page where logged-out visitors see it.
- Matches the screenshot: the banner sits directly under the "m5nita" header bar, above page content.
- The banner is **non-sticky** (scrolls away with content). The header stays sticky as today; the banner does not compete with it for the sticky slot and never covers content. Simpler and less intrusive than a second sticky element.

**Alternatives considered**:
- Per-route insertion (pool/home/matches separately): rejected — more code, easy to miss a route, and contradicts the "whole app" decision.
- Sticky banner under the header: rejected for v1 — adds layout/stacking complexity (`top` offsets, z-index against the existing sticky header) for no requirement; a top-of-content banner is enough.

---

## D4 — Dismissal: storage and scope

**Decision**: Persist dismissal in **`sessionStorage`** under key `m5nita.banner.dismissed`, storing the **current campaign id**. The banner is hidden only when the stored id equals the active campaign id.

**Rationale**:
- The user chose "fecha, mas volta na sessão" — `sessionStorage` is exactly session-scoped: it survives in-tab navigation and manual reloads, and clears when the tab/browser session ends, so the banner reappears on the next visit (FR-005).
- Keying by campaign id means a **new campaign re-surfaces** even for users who dismissed the previous one (handles the "operator changed the message" edge case cleanly).
- Namespacing under `m5nita.banner.*` is consistent with the theme feature's `m5nita.theme` key.

**Campaign id source**: `VITE_BANNER_ID` if provided; otherwise a short, stable hash derived from `message + link` so each distinct content automatically gets its own dismissal bucket without the operator needing to set an id.

**Alternatives considered**:
- `localStorage` (permanent dismissal): rejected — contradicts the session-scoped decision; the announcement is important enough to re-show next visit.
- In-memory React state only: rejected — would re-show the banner on every manual reload within the same session (too naggy) and lose the per-campaign reset semantics.

**SSR/availability note**: the web app is a client-rendered SPA (static nginx build), so `window.sessionStorage` is always available at render; still, access is guarded defensively (try/catch) so a privacy-mode storage exception degrades to "show the banner" rather than crashing.

---

## D5 — Theming, links, and accessibility

**Decision**:
- **Theming**: style with existing Tailwind `@theme` tokens (e.g., `bg-red`/`text-white` or `bg-black/text-cream`, `border-border`). Because dark mode flips the CSS variables via `[data-theme="dark"]`, the banner adapts automatically with no per-theme code (FR-008).
- **Link handling**: a destination starting with `http://`/`https://` is **external** → rendered as an anchor with `target="_blank" rel="noopener noreferrer"`. A destination starting with `/` is **internal** → rendered via TanStack Router navigation (no full reload). Anything else is invalid → banner hidden (FR-011).
- **Accessibility** (FR-010, Constitution III/WCAG 2.1 AA): banner container uses an appropriate landmark/`role` with an `aria-label`; the whole banner is a single activatable control with a visible "clickable" affordance (e.g., arrow/underline); the dismiss control is a real `<button>` with `aria-label` (e.g., "Fechar aviso"), keyboard-focusable, and its click handler calls `stopPropagation` so dismissing never triggers navigation; color choices meet AA contrast in both themes.

**Rationale**: reuses the design system (no ad-hoc styles, Constitution III), keeps the redirect/dismiss interactions unambiguous, and meets the accessibility bar that is a hard requirement, not an enhancement.

**Alternatives considered**: a single full-width `<a>` wrapping a nested dismiss `<button>` — valid `<button>`-inside-`<a>` is invalid HTML, so instead the banner is a positioned container with the clickable region and the dismiss button as **siblings** (the clickable region is a `<button>`/`<a>` and the dismiss is a separate `<button>`), avoiding nested interactive elements.

---

## Open questions

None. The design is fully specified for `/speckit.tasks`.
