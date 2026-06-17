# Contract: Banner Configuration (Environment)

**Feature**: `027-announcement-banner` · **Date**: 2026-06-17

The banner is configured entirely through build-time Vite environment variables. This is the operator-facing contract: set these, rebuild, deploy.

## Variables

| Variable | Required | Example | Meaning |
|----------|----------|---------|---------|
| `VITE_BANNER_ENABLED` | yes (to show) | `true` | Master switch. The banner renders **only** when this equals `true` (case-insensitive, trimmed). Any other value, or unset, ⇒ no banner. |
| `VITE_BANNER_MESSAGE` | yes (to show) | `A Copa está acabando, mas o m5nita continua — vem aí novos campeonatos!` | The short message shown in the banner. Trimmed; must be non-empty. |
| `VITE_BANNER_LINK` | yes (to show) | `https://m5nita.com/proximos-campeonatos` | Destination when the banner is activated. Absolute `http(s)` URL (opens in a new tab) **or** an internal path like `/how-it-works` (in-app navigation). |
| `VITE_BANNER_ID` | optional | `copa-2026-fim` | Campaign id used as the dismissal key. If omitted, a stable hash of message+link is used. Set/bump it to force a re-show after changing content. |

## Validation rules (enforced by `parseAnnouncementConfig`)

| # | Condition | Result |
|---|-----------|--------|
| 1 | `VITE_BANNER_ENABLED` ≠ `true` | banner hidden |
| 2 | `VITE_BANNER_MESSAGE` empty/absent | banner hidden |
| 3 | `VITE_BANNER_LINK` empty/absent | banner hidden |
| 4 | `VITE_BANNER_LINK` not `http(s)://…` and not `/…` | banner hidden (FR-011) |
| 5 | all valid | banner shown; `isExternal = /^https?:\/\//.test(link)` |

## `.env.example` additions (documentation block)

```dotenv
# Announcement banner (optional, global). Leave VITE_BANNER_ENABLED unset/false to hide.
# Changing these requires a web rebuild + redeploy (build-time config).
VITE_BANNER_ENABLED=false
VITE_BANNER_MESSAGE=
VITE_BANNER_LINK=
# Optional campaign id; bump to re-show the banner to users who dismissed a previous one.
VITE_BANNER_ID=
```

## Production injection (Dockerfile + Coolify)

`apps/web/Dockerfile` — declare the args in the `build` stage so `vite build` can inline them:

```dockerfile
ARG VITE_API_URL
ARG VITE_BANNER_ENABLED
ARG VITE_BANNER_MESSAGE
ARG VITE_BANNER_LINK
ARG VITE_BANNER_ID
```

Then set them as **build-time variables** in Coolify for the web service. ⚠️ Without the `ARG` lines the values are silently dropped from the bundle (Vite only inlines env present at build time).

## Out of scope (this contract)

- No HTTP/API contract — the banner makes **no** network requests.
- No runtime config endpoint, no admin UI, no database row.
