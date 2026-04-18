# Feature Specification: Dark Mode with Theme Toggle

**Feature Branch**: `015-dark-light-theme`
**Created**: 2026-04-18
**Status**: Draft
**Input**: User description: "quero criar o tema dark e conseguir trocar em dark/light mode"

## Clarifications

### Session 2026-04-18

- Q: Should the toggle cycle between just Light/Dark, or expose three explicit states (Light / Dark / Follow System)? → A: Three-state control (Light / Dark / System). User can always return to following the OS preference.
- Q: What personality should the dark theme have? → A: Warm charcoal/ink — near-black backgrounds with a slight warm undertone, preserving brand reds/greens and the editorial/sports-journalism identity (not neutral slate, not true black, not sepia-dark).
- Q: Where should the theme control be placed? → A: Inside the user menu / profile dropdown opened from the header — reachable from every page without adding a permanent header icon.
- Q: Should logged-out users also be able to toggle the theme? → A: Yes — a small theme control is available in the public header / auth layout so logged-out users can switch from any public page (login, register, landing), in addition to the user-menu item for signed-in users.
- Q: How strictly should the dark theme apply to embedded third-party surfaces (Turnstile, payment checkouts, etc.)? → A: Best-effort — pass dark-theme params to widgets that support it; surfaces without dark-mode support (e.g., external payment checkout) stay light and this exception is documented.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Switch Between Light and Dark Appearance (Priority: P1)

As a user of the app, I want a visible control to switch between a light appearance and a dark appearance, so I can choose the look that is most comfortable for my eyes and my current environment.

Today the app only offers a single light (warm cream) appearance. Users browsing at night, in low-light environments, or who simply prefer dark interfaces have no way to reduce screen glare.

**Why this priority**: This is the core of the feature — without a way to switch, there is no dark mode product. Everything else (persistence, system preference, polished visuals) assumes the toggle exists.

**Independent Test**: Open the app, locate the theme control in the interface, tap/click it, and confirm that the entire visible UI changes to a dark appearance immediately. Toggle again and the UI returns to the current light appearance.

**Acceptance Scenarios**:

1. **Given** a user is on any page of the app with the light theme active, **When** they activate the theme control, **Then** the entire interface switches to a dark appearance without requiring a page reload.
2. **Given** a user is on any page with the dark theme active, **When** they activate the theme control, **Then** the interface switches back to the light appearance without a page reload.
3. **Given** a user navigates between pages after choosing a theme, **When** any page loads, **Then** that page renders in the currently chosen theme.

---

### User Story 2 - Remember My Theme Choice (Priority: P1)

As a returning user, I want the app to remember the theme I chose last time so I don't have to re-select it on every visit.

**Why this priority**: Without persistence, users re-toggle on every visit and the feature feels broken. This is part of the minimum usable experience.

**Independent Test**: Choose dark mode, close the browser tab, reopen the app — the app should load directly in dark mode with no flash of the light theme.

**Acceptance Scenarios**:

1. **Given** a user has selected dark mode and then closes the app, **When** they reopen the app later in the same browser, **Then** the app loads in dark mode.
2. **Given** a user has selected light mode, **When** they reopen the app later, **Then** the app loads in light mode.
3. **Given** a user reloads the current page, **When** the page renders, **Then** the chosen theme is applied from the first paint — no visible flash of the other theme.

---

### User Story 3 - Follow My Device's Appearance Setting by Default (Priority: P2)

As a new user who has never chosen a theme in this app, I want the app to match the appearance setting of my operating system or browser (light or dark) so it feels at home on my device.

**Why this priority**: A solid default behavior reduces the chance a first-time user lands on an appearance that conflicts with their system preference (e.g., a blinding light screen at night). Still secondary to having the feature work at all.

**Independent Test**: In a browser with no stored theme preference, set the operating system to dark mode, open the app — it should start in dark mode. Switch the OS to light mode and open the app in a new private window — it should start in light mode.

**Acceptance Scenarios**:

1. **Given** a user has never chosen a theme in the app and their OS is set to dark mode, **When** they open the app for the first time, **Then** the app displays in dark mode.
2. **Given** a user has never chosen a theme and their OS is set to light mode, **When** they open the app, **Then** the app displays in light mode.
3. **Given** a user has explicitly chosen a theme, **When** their OS appearance setting later changes, **Then** the app keeps the user's explicit choice and does not override it.

---

### Edge Cases

- **Flash of wrong theme on load**: On first paint, the app must render in the correct theme immediately — users should never briefly see the light theme before it switches to dark (or vice versa).
- **System preference changes mid-session**: If a user has not made an explicit choice and their OS appearance changes while the app is open, the app should follow the new system preference live (no reload needed). If the user has chosen explicitly, the app keeps the explicit choice.
- **Readability of every component**: Every existing surface — cards, inputs, form validation states, modal dialogs, toasts, score highlights, match cards, buttons in every state (hover, disabled, loading), banners, tabs — must remain legible and keep sufficient contrast in both themes.
- **Brand highlights**: Brand accent colors (red and green used for status and calls to action) must still read as the same brand colors in dark mode, adjusted only as needed to stay accessible on a dark background.
- **Images, logos, and illustrations**: Any artwork that assumes a light background must not become unreadable on a dark background.
- **Reset to default**: A user who previously chose Light or Dark can return to Follow System at any time by selecting that option in the three-state control.
- **Printing or screenshots**: Behavior when a user prints a page or takes a screenshot while in dark mode — content should remain legible (printing typically ignores dark backgrounds, which is acceptable).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST support two visual themes: a light theme (matching the current appearance) and a dark theme.
- **FR-002**: The app MUST expose a clearly discoverable control that lets a user choose between three states: Light, Dark, and Follow System (i.e., match the OS/browser appearance preference). For signed-in users, the control MUST live inside the user menu / profile dropdown opened from the header. For logged-out users, an equivalent control MUST be available in the public header / auth layout (login, register, landing, forgot-password) so the theme can be changed without signing in. In both cases the control MUST be reachable from every page via at most one click/tap.
- **FR-003**: Activating the theme control MUST apply the new state to the entire app immediately, without a page reload.
- **FR-004**: The chosen theme MUST persist across page reloads, navigations, and future sessions in the same browser.
- **FR-005**: When a user has not made an explicit choice, the app MUST default to the appearance preference reported by the operating system or browser (light or dark).
- **FR-006**: When the user has made an explicit choice, the app MUST keep that choice even if the system appearance preference changes.
- **FR-007**: The app MUST render in the correct theme on first paint, with no visible flash of the opposite theme on load or reload.
- **FR-008**: Every existing screen, component, and state owned by the app (including forms, empty states, error states, modals, toasts, disabled and loading states) MUST remain legible and visually consistent in both themes. For embedded third-party surfaces (e.g., Cloudflare Turnstile, payment widgets), the app MUST pass a dark-mode parameter when the vendor supports it; surfaces that do not support dark mode (e.g., external payment checkout pages) MAY remain in their default appearance and this exception MUST be documented.
- **FR-009**: Text and meaningful UI elements in both themes MUST meet WCAG 2.1 AA contrast requirements (4.5:1 for normal text, 3:1 for large text and interactive elements).
- **FR-010**: Brand accent colors (status greens and reds used for wins, losses, calls to action, and validation) MUST remain recognizable as the same brand colors in dark mode while meeting contrast requirements.
- **FR-011**: The theme switch MUST give the user first visual feedback within 100ms of their input and complete the full re-render within 300ms on a mid-range mobile device, with no intermediate color states and no flicker.
- **FR-012**: The theme control MUST communicate the currently selected state (Light, Dark, or Follow System) and, when in Follow System, MUST indicate which appearance is currently rendered.
- **FR-013**: When the user selects Follow System, the app MUST adopt the OS/browser appearance preference and keep following live changes to it until the user chooses Light or Dark explicitly.
- **FR-014**: The dark theme MUST use a warm charcoal/ink palette — near-black backgrounds with a slight warm undertone — rather than neutral slate gray, pure black, or sepia-dark. (Brand accent color treatment is specified in FR-010.)

### Key Entities

- **User theme preference**: A per-device setting with three possible values — `light`, `dark`, or `system` (follow OS/browser preference). Defaults to `system` until the user explicitly picks `light` or `dark`. Stored locally in the user's browser; does not require a server account to work.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can switch from light to dark theme (or the reverse) in a single interaction (one tap or click), from any page of the app.
- **SC-002**: A user's chosen theme is preserved across 100% of page reloads and return visits in the same browser.
- **SC-003**: On first visit with no stored preference, the app matches the user's system appearance setting in 100% of cases where the browser exposes that preference.
- **SC-004**: Every existing page renders cleanly in both themes — zero screens with unreadable text, invisible borders, or missing visual elements.
- **SC-005**: Text across both themes meets WCAG 2.1 AA contrast in 100% of spot-checked components (sample includes home, pool list, match list, pool detail, forms, and auth screens).
- **SC-006**: No user-visible flash of the wrong theme on load, confirmed by manual inspection of 10 reloads across slow and fast network conditions.
- **SC-007**: Theme toggle shows first visual feedback within 100ms and the full re-render completes within 300ms from user input on a mid-range mobile device.

## Assumptions

- The app will offer two visual themes only (light and dark) — no additional palettes (e.g., sepia, high contrast, per-user custom colors) are in scope.
- The theme control exposes three states (Light, Dark, Follow System). Follow System is the default until the user explicitly picks Light or Dark, and can always be re-selected from the same control.
- The preference is stored per browser/device. A user logged in on two devices may see different themes on each — cross-device sync is out of scope.
- Signed-in users access the control via the user menu / profile dropdown in the header. Logged-out users access an equivalent control in the public/auth header layout. In neither case is a permanent full-size header icon added on signed-in pages — the control lives inside the menu for authenticated layouts.
- The current light theme remains the baseline. The dark theme is a warm charcoal/ink variant that preserves the same brand identity (editorial, sports-journalism feel) — explicitly not neutral slate gray, pure black, or sepia-dark.
- Existing pages and components will be adjusted to use theme-aware color tokens rather than hard-coded colors. Any deviation where a component must remain fixed (e.g., a photograph, a third-party widget without dark-mode support, an external payment checkout) is acceptable if it stays legible and is documented as a known exception.
- Marketing or landing surfaces (if any) follow the same theme rules as the rest of the app.
- Email content, Telegram messages, and other out-of-app surfaces are out of scope.

## Dependencies

- The current design system and color palette are the baseline for the light theme; the dark theme must be defined as a counterpart that preserves brand identity.
- All existing UI surfaces need a pass to ensure they reference theme-aware tokens and render correctly in both themes.

## Out of Scope

- Additional themes beyond light and dark (e.g., high-contrast, colorblind-specific palettes, user-custom colors).
- Syncing theme preference across devices or storing it on the user's server account.
- Theming for email, push notifications, Telegram messages, or other channels outside the web app.
- Scheduled automatic switching (e.g., "dark after sunset") beyond following the OS preference.
