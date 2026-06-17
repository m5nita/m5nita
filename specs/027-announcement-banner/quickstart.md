# Quickstart: Global Announcement Banner

**Feature**: `027-announcement-banner` · **Date**: 2026-06-17

How to build, test, and ship the banner. Frontend-only — everything is in `apps/web`.

## 1. Try it locally

Add to `apps/web/.env` (dev values):

```dotenv
VITE_BANNER_ENABLED=true
VITE_BANNER_MESSAGE=A Copa está acabando, mas o m5nita continua — vem aí novos campeonatos!
VITE_BANNER_LINK=/how-it-works
VITE_BANNER_ID=copa-2026-fim
```

```bash
pnpm dev            # API + Web
# open the web app → the banner shows below the header on every page
```

Quick manual checks:
- Banner visible on home, a pool, and `/matches`.
- Click the banner → navigates to the link (external opens a new tab).
- Click the "×" → banner disappears and does **not** navigate; reload (same tab) → stays hidden; open a new tab/session → shows again.
- Toggle theme → banner restyles for dark/light.
- Set `VITE_BANNER_ENABLED=false` and restart dev → no banner, no empty gap.

## 2. Run the tests

```bash
# pure parser (fast, no DOM)
pnpm --filter @m5nita/web exec vitest run src/lib/announcement.test.ts
# component behavior
pnpm --filter @m5nita/web exec vitest run src/components/ui/AnnouncementBanner.test.tsx
# everything + lint
pnpm --filter @m5nita/web test
pnpm biome check --write apps/web
```

## 3. Ship to production (Coolify)

1. **Dockerfile** — add the args to the `build` stage of `apps/web/Dockerfile` (next to `ARG VITE_API_URL`):

   ```dockerfile
   ARG VITE_BANNER_ENABLED
   ARG VITE_BANNER_MESSAGE
   ARG VITE_BANNER_LINK
   ARG VITE_BANNER_ID
   ```

2. **Coolify** — on the web service, add **build-time variables** with the real campaign content:

   ```
   VITE_BANNER_ENABLED=true
   VITE_BANNER_MESSAGE=A Copa acabou, mas o m5nita continua! Vem pros próximos campeonatos.
   VITE_BANNER_LINK=https://...
   VITE_BANNER_ID=copa-2026-fim
   ```

3. **Redeploy** the web service (a rebuild is required — Vite inlines `VITE_*` at build time). The banner goes live app-wide.

### Scheduling (deploy now, appears later)

Set an optional window — the dates are baked at build time but compared against the visitor's clock at runtime, so the banner appears/disappears on its own with **no extra deploy**:

```
VITE_BANNER_START=2026-07-10T00:00:00-03:00   # hidden before this
VITE_BANNER_END=2026-08-01T00:00:00-03:00     # hidden after this (optional)
```

Use the full ISO 8601 form with the `-03:00` offset for Brazil. Either bound is optional; leave both empty for "show now while enabled". An unparseable value hides the banner (so a typo fails safe, not silently-wrong).

### Turning it off / changing it later

- **Off**: set `VITE_BANNER_ENABLED=false` (or clear it) → redeploy.
- **New message/campaign**: update the text/link **and bump `VITE_BANNER_ID`** so users who dismissed the previous one see the new one → redeploy.

> ⚠️ Build-time gotcha: if you change a value but forget to redeploy, nothing changes. And if you add a new `VITE_BANNER_*` var but forget its `ARG` line in the Dockerfile, it is silently omitted from the bundle.

## Definition of done

- [ ] `parseAnnouncementConfig` unit tests pass (disabled / missing / invalid / internal / external).
- [ ] `AnnouncementBanner` component tests pass (render / hidden / dismiss-no-navigate / session reset).
- [ ] Banner renders below the header on every route, both auth states.
- [ ] Dismiss is session-scoped; reappears next session / on new `VITE_BANNER_ID`.
- [ ] Works in light & dark, mobile & desktop; no layout shift when disabled.
- [ ] `.env.example`, `Dockerfile` ARGs, and `biome check` all updated/clean.
