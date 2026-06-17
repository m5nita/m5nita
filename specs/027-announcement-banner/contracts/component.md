# Contract: `AnnouncementBanner` Component

**Feature**: `027-announcement-banner` · **Date**: 2026-06-17
**Location**: `apps/web/src/components/ui/AnnouncementBanner.tsx`

## Public interface

```ts
// No required props — reads config from import.meta.env and dismissal from sessionStorage.
export function AnnouncementBanner(): JSX.Element | null
```

Rendered once in `apps/web/src/routes/__root.tsx`, directly after `</header>` and before `<main>`:

```tsx
</header>
<AnnouncementBanner />
<main className="...">
  <Outlet />
</main>
```

## Rendering states

| State | Condition | Output |
|-------|-----------|--------|
| Hidden (unconfigured) | `parseAnnouncementConfig(import.meta.env) === null` | `null` — no DOM node, no spacing, no layout shift (FR-007) |
| Hidden (dismissed) | configured but `isDismissed(banner.id) === true` | `null` |
| Visible | configured and not dismissed | banner element with message, clickable affordance, and dismiss button |

## Behavior

| # | Behavior | Spec ref |
|---|----------|----------|
| B1 | When visible on any route (home, pool, matches, login, …), the message text is rendered. | FR-001, FR-002 |
| B2 | Activating the banner body (click/Enter/Space) navigates to `href`. External (`isExternal`) → new tab via `target="_blank" rel="noopener noreferrer"`; internal → TanStack Router navigation, no full reload. | FR-003 |
| B3 | The dismiss button hides the banner and writes `sessionStorage[m5nita.banner.dismissed] = banner.id`. Its handler calls `stopPropagation` so dismissing never triggers navigation (B2). | FR-004 |
| B4 | After dismissal, the banner stays hidden across in-session route changes and reloads; it reappears in a new session, or immediately if `banner.id` changes (new campaign). | FR-005 |

## Accessibility (WCAG 2.1 AA — FR-010)

- Container exposes a landmark/`role` with an `aria-label` (e.g., `role="region" aria-label="Aviso"`), announced to assistive tech.
- The activatable region is a real interactive element (`<a>` for external/internal href) — keyboard focusable, with a visible "clickable" affordance (arrow icon / underline) and a visible focus ring.
- Dismiss is a `<button type="button">` with `aria-label` (e.g., "Fechar aviso"), keyboard operable.
- No nested interactive elements: the clickable region and the dismiss button are **siblings**, not one inside the other.
- Text/background contrast meets AA in both light and dark themes.

## Styling

- Uses existing Tailwind `@theme` tokens only (e.g., `bg-red text-white`, `border-border`); adapts to `[data-theme="dark"]` automatically. No ad-hoc colors (Constitution III).
- Full-width within the existing layout container width (`max-w-[430px]` mobile / `lg:max-w-*` desktop), consistent with header/main; long messages wrap or truncate without horizontal overflow (FR-009).

## Test contract (`AnnouncementBanner.test.tsx`)

1. enabled+valid config → message is in the document.
2. disabled / missing message / missing link / invalid link → renders nothing (`container` empty).
3. external link → anchor has `target="_blank"` and `rel` includes `noopener`.
4. internal link → navigates within the router (no `target="_blank"`).
5. clicking dismiss → banner disappears, `sessionStorage` holds the campaign id, and navigation did **not** fire.
6. pre-seeded `sessionStorage` with the current id → renders nothing on mount.
7. pre-seeded `sessionStorage` with a *different* id → banner shows (campaign reset).

> Parser-level rules (enabled/missing/invalid/internal-vs-external) are covered exhaustively by `announcement.test.ts`; the component tests focus on rendering + dismissal + navigation wiring.
