# Quickstart: Desktop Layout Optimization

**Feature**: 010-desktop-layout | **Date**: 2026-04-12

## Setup

```bash
git checkout 010-desktop-layout
pnpm install
pnpm dev
```

## Testing Desktop Layout

1. Open `http://localhost:5173` in a desktop browser
2. Resize browser to different widths to verify breakpoints:
   - **< 768px**: Should match current mobile layout exactly
   - **768px–1023px**: Transitional — wider container
   - **≥ 1024px**: Full desktop layout — horizontal nav, multi-column grids
   - **≥ 1280px**: Content capped at max-width, centered

## Key Files to Modify

| File | Role |
|------|------|
| `apps/web/src/routes/__root.tsx` | Root layout: max-width, header, navigation |
| `apps/web/src/styles/app.css` | Theme/base styles |
| `apps/web/src/routes/matches.tsx` | Match cards + tab filters |
| `apps/web/src/routes/pools/$poolId/predictions.tsx` | Prediction tabs + score inputs |
| `apps/web/src/routes/index.tsx` | Home page: pools, matches |

## Verification Checklist

- [ ] Mobile (< 768px) renders identically to `main` branch
- [ ] Desktop (≥ 1024px) content uses wider layout
- [ ] Navigation shows horizontal links on desktop
- [ ] Navigation shows hamburger on mobile
- [ ] No horizontal scrollbar on any page at desktop widths
- [ ] Smooth transition when resizing browser window
- [ ] Match cards display in multi-column grid on desktop
- [ ] All interactive elements remain usable at all sizes
