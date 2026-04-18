# Color Migration Audit

**Generated**: 2026-04-18 (T013)
**Scope**: `apps/web/src/` — files using literal brand-color Tailwind classes (`bg-cream`, `bg-white`, `text-black`, `bg-black`, `text-white`).

## Important note on strategy

The dark palette in `app.css` **remaps the legacy token names** (`--color-cream`, `--color-black`, `--color-white`, `--color-red`, `--color-green`, `--color-gray*`) inside `:where([data-theme="dark"])`. This means **existing components using `bg-cream`, `text-black`, `bg-black`, etc. automatically adapt in dark mode** without any code change — the token names keep the same *role*, only their resolved color changes.

Consequently, the T035 migration is a quality/clarity pass (prefer semantic tokens like `bg-bg`, `text-text-primary`), not a blocker. Files with hard-coded hex values or literal `#ffffff`-style inline styles would be blockers, but the grep did not surface any.

## Files using literal brand-color classes

| File | Dominant classes used |
|------|-----------------------|
| `main.tsx` | `bg-cream`, `text-black`, `bg-black`, `text-white` (Sentry fallback) |
| `components/ui/Button.tsx` | `bg-black`, `text-white`, `border-black` (primary/secondary variants) |
| `components/ui/Input.tsx` | `text-black`, `bg-white` |
| `components/ui/PhoneInput.tsx` | `text-black`, `bg-white` |
| `components/ui/Loading.tsx` | `text-black` |
| `components/ui/Skeleton.tsx` | `bg-black` (at low opacity) |
| `components/ui/EmptyState.tsx` | `text-black` |
| `components/ui/ErrorMessage.tsx` | `text-black` |
| `components/match/MatchCard.tsx` | `bg-white`, `text-black` |
| `components/match/Bracket.tsx` | `bg-white`, `text-black` |
| `components/pool/PoolCard.tsx` | `bg-white`, `text-black` |
| `components/pool/PrizeWithdrawal.tsx` | `bg-white`, `text-black` |
| `components/pool/PixKeyInput.tsx` | `bg-white`, `text-black` |
| `components/pool/InviteTicket.tsx` | `bg-white`, `text-black` |
| `components/prediction/ScoreInput.tsx` | `bg-white`, `text-black` |
| `components/prediction/MatchPredictionsList.tsx` | `bg-white`, `text-black` |
| `routes/__root.tsx` | `bg-cream`, `text-black` |
| `routes/index.tsx` | `bg-cream`, `text-black`, `text-white` |
| `routes/login.tsx` | `bg-cream`, `text-black`, `text-white`, `bg-black` |
| `routes/matches.tsx` | `text-black` |
| `routes/settings.tsx` | `text-black` |
| `routes/how-it-works.tsx` | `text-black` |
| `routes/complete-profile.tsx` | `text-black` |
| `routes/invite/$inviteCode.tsx` | `bg-white`, `text-black` |
| `routes/pools/create.tsx` | `bg-white`, `text-black` |
| `routes/pools/payment-success.tsx` | `text-black` |
| `routes/pools/$poolId/index.tsx` | `bg-white`, `text-black` |
| `routes/pools/$poolId/manage.tsx` | `bg-white`, `text-black` |
| `routes/pools/$poolId/ranking.tsx` | `bg-white`, `text-black` |
| `routes/pools/$poolId/predictions.tsx` | `bg-white`, `text-black` |

## Recommended migrations for T035 (quality/clarity pass)

| Legacy | Semantic replacement |
|--------|----------------------|
| `bg-cream` | `bg-bg` |
| `bg-white` | `bg-surface` |
| `text-black` | `text-text-primary` |
| `text-white` | (keep in dark-mode-intended inverted surfaces, e.g., `bg-black text-white` buttons; the remapping handles the semantics) |
| `bg-black` | (keep for inverted emphasis; the remap handles dark mode) |
| `border-black` | (keep for inverted emphasis) |

The migration is additive and low-risk. Components not migrated still render correctly in both themes thanks to the legacy-token remap.
