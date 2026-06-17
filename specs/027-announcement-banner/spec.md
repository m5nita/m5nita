# Feature Specification: Global Announcement Banner

**Feature Branch**: `027-announcement-banner`  
**Created**: 2026-06-17  
**Status**: Draft  
**Input**: User description: "quero deixar criado um mecanismo de banner no sistema para passar uma mensagem e ao ser clicado fazer um redirecionamento. Quero algo tipo aqui: [print: topo da página do bolão, faixa entre o cabeçalho e o título 'BOLÃO']. Esse mecanismo vai servir para quando a copa estiver finalizando eu passar uma mensagem falando que após a copa o m5nita vai continuar com outros campeonatos"

## Summary

A reusable, system-wide announcement banner that appears at the top of the app's main pages, shows a short message, and—when activated—sends the user to a configured destination. The first concrete use is an end-of-World-Cup message telling people that m5nita will keep going with other championships afterward, but the mechanism itself is generic and meant to be reused for future campaigns by changing its configuration.

## Clarifications

### Session 2026-06-17

- Q: Where should the banner appear? → A: Across the whole app (top of all main pages), since the message is a system-wide announcement.
- Q: How is the banner turned on/off and edited (message + link)? → A: Through system configuration; changes take effect via deploy. No in-app admin panel for now.
- Q: Can a user dismiss the banner? → A: Yes, but it reappears on the user's next session/visit (dismissal is session-scoped, not permanent).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See and act on the announcement (Priority: P1)

A visitor or participant opens m5nita and sees a banner at the top of the page carrying a short message (e.g., "A Copa está acabando, mas o m5nita continua — vem aí novos campeonatos!"). Curious, they tap the banner and are taken to the destination the operator chose (for example, a page explaining the upcoming championships).

**Why this priority**: This is the core value of the feature — getting an important message in front of every user and giving them a one-tap path to act on it. Without it, the feature delivers nothing. It is a complete, demonstrable MVP on its own.

**Independent Test**: With a banner configured and enabled, load any main page and confirm the banner shows the configured message; activate it and confirm the user lands on the configured destination.

**Acceptance Scenarios**:

1. **Given** an enabled banner is configured with a message and a destination, **When** a user opens any main page (home, a pool, the matches list), **Then** the banner appears at the top of that page showing the configured message.
2. **Given** the banner is visible, **When** the user clicks/taps it, **Then** they are taken to the configured destination.
3. **Given** the destination is an external page, **When** the user activates the banner, **Then** the destination opens in a new tab and the current app view stays open in the background.
4. **Given** the destination is an internal route, **When** the user activates the banner, **Then** the app navigates to that route without a full page reload.

---

### User Story 2 - Operator controls the announcement (Priority: P2)

The operator wants to launch the end-of-World-Cup message at the right moment, change its wording or link if needed, and retire it cleanly once the campaign is over — all without touching page/layout code, just the banner's configuration.

**Why this priority**: This is what makes it a reusable *mechanism* rather than a one-off hard-coded banner. It also guarantees a clean "off" state so the app looks normal when no campaign is running. It builds on P1 but is independently valuable and testable.

**Independent Test**: Toggle the banner off in configuration and confirm nothing renders (and no empty gap appears); set a message + destination and enable it, deploy, and confirm the new banner shows the updated content app-wide.

**Acceptance Scenarios**:

1. **Given** no banner is configured or it is disabled, **When** a user opens any page, **Then** no banner appears and there is no empty space or layout shift where it would be.
2. **Given** the operator sets a message and destination and enables the banner, **When** the change is deployed and a user loads the app, **Then** the banner appears with the updated content on every main page.
3. **Given** an active banner, **When** the operator disables it after the campaign and deploys, **Then** the banner no longer appears anywhere in the app.

---

### User Story 3 - Dismiss without losing it forever (Priority: P3)

A user who has already seen and read the banner closes it so it stops taking up space while they use the app, but is reminded again next time they come back.

**Why this priority**: A quality-of-life touch that reduces nuisance within a single visit while still keeping the announcement visible enough to matter. The feature is fully usable without it, so it is the lowest priority.

**Independent Test**: With the banner visible, activate its close control and confirm it disappears and stays hidden while navigating within the same session; start a new session and confirm it reappears.

**Acceptance Scenarios**:

1. **Given** the banner is visible, **When** the user activates the close/dismiss control, **Then** the banner disappears and the redirect is **not** triggered.
2. **Given** the user has dismissed the banner, **When** they navigate to other pages within the same session, **Then** the banner stays hidden.
3. **Given** the user has dismissed the banner, **When** they start a new session/visit (e.g., reopen the app later), **Then** the banner appears again.

---

### Edge Cases

- **Enabled but incomplete**: banner is enabled but the message or destination is missing/blank → the banner is treated as not configured and is not shown (no broken or dead-end banner).
- **Invalid destination**: configured destination is not a well-formed internal route or external URL → the banner is hidden instead of producing a broken link.
- **Long message on small screens**: a long message wraps gracefully without overflowing horizontally or breaking the header/layout.
- **Theme switch**: user toggles light/dark while the banner is visible → the banner restyles to match and stays legible.
- **Sticky header interaction**: the banner coexists with the existing sticky header without covering content, breaking scroll, or causing jumpiness.
- **Destination equals current page**: the configured destination is the page the user is already on → activation still resolves without error.
- **Logged-out visitor**: an unauthenticated visitor on the landing/home page also sees the banner.
- **Dismiss then quick navigation**: immediately navigating after dismissing keeps the banner hidden (no flicker/re-show within the session).
- **Scheduled window**: before the start (or after the end) instant the banner is hidden; it appears/disappears on the next render after the boundary (e.g. on navigation or reload). An unparseable start/end value hides the banner rather than guessing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST render at most one announcement banner at a time, positioned at the top of every route/page (directly below the global header) — across the entire app — for both authenticated and unauthenticated users (including the landing/home page).
- **FR-002**: The banner MUST display the configured short message text.
- **FR-003**: When a destination is configured, the banner MUST be activatable by click, tap, and keyboard, and MUST navigate the user to that destination — external URLs opening in a new tab (current view preserved), internal routes navigating within the app.
- **FR-004**: The banner MUST provide a clearly labeled close/dismiss control, and dismissing it MUST NOT trigger the navigation.
- **FR-005**: A dismissal MUST persist for the remainder of the user's current session and the banner MUST reappear on the user's next session/visit.
- **FR-006**: The operator MUST be able to enable/disable the banner and define its message and destination through system configuration, without editing page or layout code.
- **FR-007**: When the banner is disabled or not fully configured (missing message or destination), the system MUST render nothing in that area and MUST NOT cause layout shift or leave an empty gap.
- **FR-008**: The banner MUST adapt to both light and dark themes and maintain legible contrast in each.
- **FR-009**: The banner MUST be responsive across mobile (~430px) and desktop widths, never overflow horizontally, and handle long messages by wrapping gracefully.
- **FR-010**: The banner MUST be accessible — exposed to assistive technology as an announcement/notification, with a keyboard-operable, accessibly-labeled dismiss control and a clear affordance that the banner is clickable.
- **FR-011**: The system MUST validate that the configured destination is a well-formed internal route or external URL; an enabled banner with an invalid destination MUST be hidden rather than render a broken link.
- **FR-012**: The banner MUST be visually consistent with the app's existing design language (typography, colors, spacing) and MUST NOT obscure or break the existing header/navigation behavior.
- **FR-013**: The system MUST support an optional scheduling window with a start and/or end instant. When a window is configured, the banner MUST appear only within it and MUST appear/disappear automatically when a boundary is reached (without requiring a new deploy). An unparseable start/end value MUST hide the banner (fail closed). When no window is configured, the banner is governed solely by the enabled flag.

### Key Entities *(include if feature involves data)*

- **Announcement Banner (configuration)**: the single, system-wide banner definition — whether it is enabled, the short message to display, and the destination (internal route or external URL) users are sent to when they activate it. Managed by the operator via system configuration. May carry a campaign identifier to distinguish one announcement from the next.
- **Banner Dismissal (per user, per session)**: an ephemeral, client-side record that the current user has hidden the banner for this session. Reset when a new session begins; not stored server-side.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When the banner is enabled, it is visible at the top of every main page on first load for 100% of visits (until dismissed), with no page requiring a manual refresh to reveal it.
- **SC-002**: Activating the banner takes the user to the configured destination in 100% of attempts, with zero broken-link or dead-end outcomes across configured campaigns.
- **SC-003**: Dismissing the banner hides it for the rest of the session in 100% of cases, and it reappears on the next session in 100% of cases.
- **SC-004**: An operator can launch, change, or retire an announcement by editing configuration only (no layout/page code changes) and have it live after a single deploy, completing the edit in under 5 minutes.
- **SC-005**: The banner introduces no perceptible load delay and zero layout shift — it appears within the same render as the page — on both mobile and desktop and in light and dark themes.
- **SC-006**: The banner passes accessibility checks: keyboard-operable dismiss, screen-reader announcement, and AA color contrast in both themes.
- **SC-007**: A banner configured with a future start instant is deployed once and then appears automatically at that time (and, if an end is set, disappears automatically) with no further deploy.

## Assumptions

- A single global banner is shown at a time — no stacking, no multiple simultaneous banners, and no per-pool or per-user targeting.
- Banner content (message + destination) and its on/off state are managed through system configuration and take effect on deploy; a live in-app admin/editor is intentionally out of scope for simplicity.
- Dismissal is scoped to the current browsing session and not permanently remembered; the announcement intentionally re-surfaces on the next visit.
- The message is short (a single line/sentence). The destination is typically an external page about the upcoming championships, but internal app routes are also supported.
- The banner is shown to all visitors (authenticated or not), because the announcement is general.
- Click-through analytics/tracking is not required for the first version.
- Date-based scheduling is supported via an optional start/end window: the operator can deploy the banner ahead of time and it appears/disappears automatically at those instants. The window is evaluated against the visitor's browser clock — acceptable for a non-critical announcement (a wrong/manipulated clock could shift it by minutes). Times are ISO 8601; including the timezone offset (e.g. `-03:00`) avoids ambiguity.

## Dependencies

- Relies on the existing global app layout/header and the existing light/dark theming.
- Relies on the existing system-configuration and deploy process to carry the banner's content and enabled flag to all environments.

## Out of Scope

- An admin UI for editing the banner live without a deploy.
- Multiple or segmented banners, and per-pool/per-user targeting.
- Persistent (cross-session) dismissal.
- A/B testing and click-through analytics.
