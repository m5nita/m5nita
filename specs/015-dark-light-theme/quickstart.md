# Quickstart: Dark Mode with Theme Toggle

**Feature**: 015-dark-light-theme
**Date**: 2026-04-18

This guide describes how to manually verify the feature once implemented. Follow it top-to-bottom after the implementation tasks are merged into the `015-dark-light-theme` branch.

---

## Prerequisites

```bash
cd /Users/igortullio/Developer/igortullio/m5nita
pnpm install
pnpm dev      # starts API + web (web on http://localhost:5173)
```

Open the web app in Chrome or Safari. Open devtools and navigate to **Application → Local Storage → localhost**.

---

## Verify User Story 1 — Switch between light and dark

1. Clear `localStorage['m5nita.theme']` and reload.
2. Sign in or land on the login page.
3. Open the user menu (logged-in) OR click the theme control in the public header (logged-out).
4. Click **Dark**.
   - ✅ Entire UI switches to the warm charcoal palette instantly (no reload, no flash).
   - ✅ `<html data-theme="dark">` in the elements panel.
   - ✅ iOS status bar / Chrome address bar color follows (check on a real device or mobile emulator).
5. Click **Light**.
   - ✅ UI switches back to cream.

---

## Verify User Story 2 — Persistence

1. With Dark selected, close the tab.
2. Reopen `http://localhost:5173` in the same browser.
   - ✅ App loads directly in dark mode.
   - ✅ No visible flash of light theme during load (watch carefully; throttle to Slow 3G in Network tab and reload 5 times).
3. Hard-reload (Cmd+Shift+R).
   - ✅ Still dark, still no flash.

---

## Verify User Story 3 — Follow system default

1. Clear `localStorage['m5nita.theme']`.
2. In your OS settings, set appearance to **Dark**.
3. Open the app in a fresh tab.
   - ✅ App starts in dark mode.
4. Switch the OS appearance to **Light** while the tab is open.
   - ✅ App immediately switches to light mode (no reload).
5. In the theme control, pick **Light** explicitly.
6. Switch the OS back to **Dark**.
   - ✅ App stays Light — user's explicit choice wins.
7. In the theme control, pick **System**.
   - ✅ App switches back to Dark (matching OS).

---

## Verify edge cases

### No FOUC across reloads

- Throttle network to Slow 3G, dark theme stored.
- Reload 10 times in a row.
- ✅ Zero visible flashes of light cream background.

### Third-party widget — Turnstile

- On the login page, with dark theme active:
  - ✅ Turnstile widget renders with its dark skin.
- Switch to light:
  - ✅ Turnstile switches to its light skin on next render (may require re-mount of the login form — acceptable).

### Third-party surface — payment (documented exception)

- Start a pool creation + payment flow with dark theme.
- On the vendor-hosted payment page:
  - ✅ Page is in vendor default appearance (light). Acceptable per spec FR-008 and clarification Q5.
- Return to the app:
  - ✅ App is still dark.

### Storage unavailable

- Open a private / incognito window where `localStorage` throws.
- Toggle the theme.
  - ✅ Toggling still works within the session (in-memory fallback).
  - ✅ On reload, preference resets to system default — expected.

---

## Verify contrast (WCAG AA)

Run the Playwright accessibility suite:

```bash
pnpm --filter web test:e2e -- theme-accessibility.spec.ts
```

- ✅ Home, matches, pool detail, login, settings each pass axe-core in both light and dark themes.

Spot-check manually in Chrome devtools **Lighthouse → Accessibility** on 2 key pages in dark mode.
- ✅ Score ≥ 95 on both.

---

## Verify performance

### Toggle speed (SC-007)

- Open devtools **Performance** tab, start recording, click the theme switcher, stop recording.
- ✅ First paint of the new theme arrives within **100ms** (initial visual feedback); total scripting + layout + paint completes within **300ms** on a mid-range mobile throttle.

### Bundle size

```bash
pnpm --filter web build
```

- ✅ The automated `size-limit` CI gate (T038) reports the theme module under the **2KB gzip** budget; no regression on the main bundle beyond the configured tolerance. The check runs in CI and blocks merge on regression.

---

## Rollback (if needed)

The feature is self-contained in `apps/web`. Rolling back means reverting the PR — no database migration, no API coordination. The next first-paint after rollback falls back to the current single-theme light rendering.
