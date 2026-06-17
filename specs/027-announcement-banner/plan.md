# Implementation Plan: Global Announcement Banner

**Branch**: `027-announcement-banner` | **Date**: 2026-06-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/027-announcement-banner/spec.md`

## Summary

A reusable, system-wide announcement banner rendered at the top of every page (below the global header) that shows a short message and, when activated, sends the user to a configured destination. First use: an end-of-World-Cup message that m5nita will continue with other championships.

**Technical approach**: A **frontend-only** feature. The banner content (enabled flag, message, destination, campaign id) is supplied through **build-time Vite environment variables** (`VITE_BANNER_*`) — the same config mechanism already used for `VITE_API_URL`, `VITE_TURNSTILE_SITE_KEY`, etc. A pure parser validates the config and returns a typed banner descriptor (or `null`). A single presentational component reads it synchronously (so there is **zero layout shift** and no extra network request), renders below the header in `__root.tsx`, and is therefore present on every route. Dismissal is session-scoped via `sessionStorage`, keyed by campaign id so a new campaign re-surfaces even for users who dismissed the previous one. Styling reuses existing theme tokens, so light/dark adaptation is automatic. **No API, database, or backend changes.**

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node.js ≥ 22 (build only); runtime target is the browser  
**Primary Dependencies**: React 19, TanStack Router, Tailwind CSS v4 (`@theme` tokens in `apps/web/src/styles/app.css`). **No new runtime dependencies.**  
**Storage**: Browser `sessionStorage` for per-session dismissal (key `m5nita.banner.dismissed`). Banner content lives in build-time Vite env (`import.meta.env.VITE_BANNER_*`). No database.  
**Testing**: Vitest 3.1 + @testing-library/react + jsdom (existing web test stack). Pure parser gets unit tests; component gets behavior tests.  
**Target Platform**: Web PWA — mobile (~430px) and desktop, light/dark themes, modern evergreen browsers  
**Project Type**: Web application — change is isolated to `apps/web` (frontend-only)  
**Performance Goals**: Zero Cumulative Layout Shift (banner renders in the same pass as the page); interaction (dismiss/activate) < 100ms; no impact on FCP (no extra request)  
**Constraints**: Bundle-size increase < 10KB (Constitution IV); WCAG 2.1 AA (Constitution III); production config injected via Docker `ARG` + Coolify build-time variables (changing content requires a web rebuild + deploy — accepted in the spec)  
**Scale/Scope**: One presentational component, one pure parser module, a one-line integration in the root layout, plus env/Dockerfile config wiring. No NEEDS CLARIFICATION items remain (placement, configuration model, and dismissal behavior were resolved during `/speckit.specify`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Verdict |
|-----------|------------|---------|
| **I. Code Quality** | One component with a single responsibility (render + dismiss); validation extracted into a pure, intention-revealing `parseAnnouncementConfig()` returning a typed descriptor (no raw-primitive leakage into the view). No dead code, no inline TODOs, functions kept small with early returns. | ✅ Pass |
| **II. Testing Standards** | TDD: pure parser unit-tested first (all branches: disabled, missing fields, invalid/valid links, internal vs external — effectively 100% on the pure logic); component behavior tests (renders/hidden, dismiss persists + does not navigate, reappears on new session, external opens new tab). New-code coverage ≥ 80%. | ✅ Pass |
| **III. UX Consistency** | Reuses design-system tokens (`bg-*`, `text-*`, `border-border`) so styling matches and adapts to dark/light automatically; dismiss is a standard labeled control; WCAG 2.1 AA (role/landmark, keyboard, contrast) is a requirement (FR-010). No new ad-hoc styles. Synchronous config → no loading state needed. | ✅ Pass |
| **IV. Performance Requirements** | Build-time config = no extra request, no N+1, no runtime fetch; rendered synchronously → zero layout shift; tiny component well under the 10KB bundle-budget threshold. | ✅ Pass |
| **V. Hexagonal Architecture & SOLID** | Applies to the **API backend**. This feature touches only `apps/web`; no `domain/`/`application/`/`infrastructure/` code, no ports/adapters, no DB. G2 (`check:leaks`) and G3 (`check:arch`) scan the API and are not engaged. | ✅ Pass (N/A to scope) |

**Result**: PASS — no violations. Complexity Tracking section intentionally omitted (nothing to justify).

## Project Structure

### Documentation (this feature)

```text
specs/027-announcement-banner/
├── plan.md              # This file (/speckit.plan)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── configuration.md # VITE_BANNER_* env contract + validation rules
│   └── component.md     # AnnouncementBanner UI/behavior contract
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit.specify)
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
apps/web/
├── src/
│   ├── lib/
│   │   ├── announcement.ts          # NEW — pure parseAnnouncementConfig(env) → AnnouncementBanner | null
│   │   └── announcement.test.ts     # NEW — unit tests for the parser/validator
│   ├── components/
│   │   └── ui/
│   │       ├── AnnouncementBanner.tsx       # NEW — presentational + dismissal component
│   │       ├── AnnouncementBanner.test.tsx  # NEW — component behavior tests
│   │       └── index.ts                     # EDIT — export the new component (barrel)
│   └── routes/
│       └── __root.tsx               # EDIT — render <AnnouncementBanner/> below <header>, above <main>
├── .env.example                     # EDIT — document VITE_BANNER_* vars
├── .env                             # EDIT (local) — dev values for testing
└── Dockerfile                       # EDIT — ARG VITE_BANNER_* so prod build bakes them in
```

**Structure Decision**: Web application, frontend-only. All work lands in `apps/web`. The pure validation logic lives in `apps/web/src/lib/announcement.ts` (testable in isolation, no React), and the view lives in `apps/web/src/components/ui/AnnouncementBanner.tsx`, integrated once in `apps/web/src/routes/__root.tsx` so it appears app-wide. No changes to `apps/api`, `packages/shared`, or the database.

## Phase 0 — Research

See [research.md](./research.md). Key decisions: build-time Vite env over a runtime API/admin UI (simplicity + zero layout shift, matches the user's "config via deploy" choice); `sessionStorage` keyed by campaign id for session-scoped dismissal that resets per campaign; render in the root layout for true app-wide coverage; reuse theme tokens for automatic dark/light; Docker `ARG` wiring for production config injection.

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — the `AnnouncementBanner` descriptor (parsed config) and the `BannerDismissal` client-side session record, with validation/state rules.
- [contracts/configuration.md](./contracts/configuration.md) — the `VITE_BANNER_*` environment contract and validation table.
- [contracts/component.md](./contracts/component.md) — the component's rendering/behavior contract (states, a11y, interaction).
- [quickstart.md](./quickstart.md) — enable it locally, test, and deploy to production via Coolify build args.

## Phase 2 — Next step

`/speckit.tasks` will turn this plan into a dependency-ordered `tasks.md` (TDD order: parser tests → parser → component tests → component → root integration → env/Dockerfile wiring).
