# Landing Page Redesign — Design

**Date:** 2026-04-27
**Status:** Draft for review
**Related code:**
- `apps/web/src/routes/index.tsx` — current dual-purpose route (landing for unauth, dashboard for logged-in)
- `apps/web/src/routes/how-it-works.tsx` — existing rules page that the landing links to
- `apps/web/src/routes/pools/create.tsx` — real "Criar Bolão" form replicated by Demo 1
- `apps/web/src/components/prediction/ScoreInput.tsx` — real score input replicated by Demo 2
- `apps/web/src/components/prediction/MatchPredictionsList.tsx` — real predictors panel replicated by Demo 2
- `apps/web/src/routes/pools/$poolId/ranking.tsx` — real ranking row replicated by Demo 3
- `apps/web/src/styles/app.css` — design tokens (cores, fonts) que a landing herda
- `apps/web/index.html` — `<meta>` tags / preload hints
- `packages/shared/...` — `SCORING` constants used by the mini-pontuação section

## Problem

The current landing (the `!session` branch of `routes/index.tsx`) is a static four-step list with a single CTA. It does not show what the product looks like, does not convey that the experience is dynamic (live ranking, predictions, real-time points), and does not differentiate m5nita from any generic "monte seu bolão" page.

A visitor who heard about m5nita has no way to evaluate it before signing up. The signup conversion depends on the visitor *trusting* the description without seeing the product.

## Goals

- Show the three core moments of using m5nita — creating a pool, predicting, watching the live ranking — with high-fidelity animated demos that replicate the real screens.
- Drive a single primary action: create an account → create a pool.
- Keep the editorial/brutalist identity already established in the app (cream + red, Barlow Condensed display, hairline borders, big numerals).
- Stay self-contained: the landing must not couple to app components in a way that breaks them when they evolve.
- Respect mobile-first PWA constraints (bandwidth, battery, reduced motion).

## Non-goals

- Replacing or shrinking `/how-it-works` (it remains the canonical, detailed rules page; the landing links to it).
- Adding social proof, testimonials, or aggregate counters (no data to display yet — confirmed by the user).
- Adding an invite-code field to the landing (invitees come through `/invite/:code` which already exists — confirmed by the user).
- Anchoring the hero copy to a specific competition like the World Cup (kept generic so the page does not age — confirmed by the user).
- Replacing the dashboard — `/` stays dual-purpose (landing for unauth, dashboard for logged-in).
- Recording video assets — all motion is HTML/CSS, no `<video>` elements (confirmed by the user).
- Changing the auth flow — primary CTA still routes to `/login`.

## Decisions captured during brainstorming

(For traceability — every contested choice we made.)

| # | Decision | Why |
|---|---|---|
| 1 | Animated auto-demo loops, not video, not real interactivity | Lighter, responsive to `prefers-reduced-motion`, no asset pipeline |
| 2 | Three demos: Criar bolão, Palpitar, Ranking ao vivo | Covers the full lifecycle the visitor needs to see |
| 3 | Demos use dedicated landing-only mock components, not real app components | Keeps demos free to embellish for storytelling and decouples them from app evolution |
| 4 | Visual direction = current editorial/brutalist + motion | Keeps app DNA |
| 5 | Page structure = "balanced" (hero → 3 demos → mini-pontuação → faixa convide → CTA final) | Tells the story without bloating into a marketing site |
| 6 | Hero copy = generic (multi-competition), not Copa-specific | Avoids aging; still strong |
| 7 | Tone = terse / declarative (matches existing copy) | Consistent with the rest of the app |
| 8 | Header = no header; only a floating "Entrar" link | Maximum focus on conversion |
| 9 | Routing = keep `/` dual-purpose; refactor unauth view into a `LandingPage` component | Avoids breaking existing URLs |
| 10 | Invite-code input does NOT appear on the landing | Invitees already use `/invite/:code` |
| 11 | No social-proof block (yet) | No real numbers to show; design carries trust |
| 12 | Demo 2 shows full match lifecycle (1 finished + 1 live with opponents' predictions visible + 2 being predicted) | Conveys breadth in one screen |
| 13 | Animation orchestration = CSS keyframes + IntersectionObserver | Pauses out of viewport (battery), reduced-motion handled by CSS media query |
| 14 | Typewriter caret = `border-right` of the typed element + JS measurement of text natural width via `document.fonts.ready` | Caret tracks the text edge precisely without hardcoded widths |

## Design

### Architecture

`routes/index.tsx` becomes a thin dispatcher:

```tsx
function HomePage() {
  const { data: session, isPending } = useSession()
  if (isPending) return <Loading />
  return session ? <DashboardHome /> : <LandingPage />
}
```

New file layout under `apps/web/src/components/`:

```
home/
  DashboardHome.tsx           # everything currently in the `else` branch of routes/index.tsx
  PendingPrizesSection.tsx    # already exists
landing/                       # new
  LandingPage.tsx              # composes the sections
  Hero.tsx
  DemoCreatePool.tsx
  DemoPredict.tsx
  DemoLiveRanking.tsx
  ScoringMini.tsx
  InviteFriendsBand.tsx
  FinalCta.tsx
  FloatingLoginLink.tsx
  useInViewportLoop.ts         # IntersectionObserver hook
  useTextWidth.ts              # JS-measured natural text width (Demo 1 typewriter)
  mocks.ts                     # static mock data (teams, players, pool name)
```

Why a dedicated `landing/` folder: the demo components need their own state, their own animations, and visual affordances tuned for marketing rather than for production use. Mixing them with the app's prediction/ranking components would tempt future devs to re-use them inappropriately and would leak app-state assumptions (queries, router, auth) into a surface that should be inert.

### Page outline (mobile-first)

The page composition lives in `LandingPage.tsx`. Sections in scroll order:

1. `<FloatingLoginLink />` — `position: fixed`, top-right of the viewport, plain text "Entrar" → `/login`. No header bar. Stays visible while scrolling.
2. `<Hero />` — eyebrow "BOLÃO ENTRE AMIGOS", H1 "Monte seu bolão.", red bar, sub "Palpite, suba no ranking, leve o prêmio.", CTA primário "Começar agora" → `/login`. Scroll cue at the bottom (animated arrow).
3. `<DemoCreatePool />` — copy column ("01 — Crie um bolão / Em 30 segundos.") + animated form replica.
4. `<DemoPredict />` — copy column ("02 — Faça seus palpites / O ciclo completo.") + 4-row predictions list with the four states.
5. `<DemoLiveRanking />` — copy column ("03 — Ranking ao vivo / Suba (ou caia) em segundos.") + animated 5-row ranking with reorder + provisional points.
6. `<ScoringMini />` — "Como pontua" with the four score tiers (10 / 5 / 3 / 0), reusing `SCORING` constants from `@m5nita/shared`. Link "Ver regras completas →" to `/how-it-works`.
7. `<InviteFriendsBand />` — full-width black panel with H2 "Bolão sozinho não tem graça." and short copy explaining the invite-code flow. No CTA, no input.
8. `<FinalCta />` — H1 "Em 30 segundos, você tá no jogo.", red bar, primary button "Criar minha conta" → `/login`, microcopy "Grátis pra começar. Você só paga quando entra em um bolão."
9. Footer — minimal: `<ThemeSwitcher />` (already exists) + small link to `/how-it-works`.

Desktop (≥1024px) shifts each demo block to a 2-column grid (copy left, demo right). Hero centers itself with more vertical breathing room. No new components for desktop — only Tailwind responsive variants.

### The three demos

All three demos follow the same shape:

- A `.stage` container with `border border-border bg-bg`.
- Inside, a faithful replica of the corresponding real screen — same tokens, same fonts, same spacing, same hierarchies.
- A CSS keyframe animation per moving element, scoped to a single loop length.
- An `is-running` class applied to the stage by `useInViewportLoop`. Animations only fire when the class is present.

The replicas are *not* the real components. They are simplified visual copies (no queries, no router, no event handlers) that match the real screens visually.

#### Demo 1 — Criar bolão

Replica of `/pools/create` (form). Loop = 8s.

Visible elements:
- Eyebrow "Novo", H1 "Criar Bolão", red bar
- "Nome do bolão" input — `border-b-2`, `bg-transparent` (matches real `<Input>`)
- "Competição" custom dropdown — closed-state mirrors the native `<select>` look; open-state shows four options: "Premier League 2025/26", "La Liga 2025/26", "Copa do Mundo 2026", "Brasileirão 2026" (uses `var(--color-bg)` background to blend with the form, no shadow)
- "Valor da entrada" 4-button quick-select grid (R$ 10 / R$ 20 / R$ 50 / R$ 100)
- Primary button "Criar e Pagar R$ 50,00"

Animation timeline:
1. Typewriter "Bolão da firma" appears in the name input. The caret is the `border-right` of the `.typed` element; its width animates 0 → measured natural width. The natural width is computed by `useTextWidth` after `document.fonts.ready`. Caret blinks via `border-right-color: transparent` keyframe.
2. Dropdown opens, four options visible, "Brasileirão 2026" highlights.
3. Dropdown closes; "Brasileirão 2026" appears as the selected value (placeholder fades, selected fades in). Both placeholder and selected sit `position: absolute; left: 0` so they share the same anchor — no horizontal jump.
4. R$ 50 quick-select transitions from outline to filled (selected).
5. Primary button pulses (scale + flash to `red`).
6. Reset.

#### Demo 2 — Faça seus palpites

Replica of `/pools/:id/predictions` showing four match rows in four states. Loop = 10s.

| Row | State | Match | Score | Points |
|---|---|---|---|---|
| 1 | finished | 21/06 — Barcelona × Real Madrid | actual 2×1, my prediction 2×1 | +10 (green, "Resultado oficial") |
| 2 | live + expanded predictors | 22/06 — Brasil × Argentina | actual 1×0, my prediction 2×1 | +5 (red, pulsing) |
| 3 | pending (animated) | 23/06 — Flamengo × Palmeiras | predicted 1×0 in this loop | "Salvo" (green) |
| 4 | pending (animated) | 24/06 — Liverpool × Manchester City | predicted 1×1 in this loop | "Salvo" (green) |

Real flag URLs (provided by the user):
- Brasil: `https://crests.football-data.org/764.svg`
- Argentina: `https://crests.football-data.org/762.png`
- Barcelona: `https://crests.football-data.org/81.png`
- Real Madrid: `https://crests.football-data.org/86.png`
- Flamengo: `https://crests.football-data.org/1783.png`
- Palmeiras: `https://crests.football-data.org/1769.png`
- Liverpool: `https://crests.football-data.org/64.png`
- Manchester City: `https://crests.football-data.org/65.png`

Each is preloaded via `<link rel="preload" as="image">` in `index.html` to avoid layout shift in the demo.

Animation timeline:
1. Initial: M1 already shows finished state, M2 shows live state but with the predictors panel collapsed ("Ver palpites dos oponentes ▾" gray). M3 + M4 inputs empty.
2. ~12–20%: Toggle on M2 transitions — text swaps to "Ocultar palpites dos oponentes ▴" black, arrow rotates 180°, panel slides open via `max-height: 0 → 320px` + opacity + padding + border-top-width.
3. ~25–52%: M3 home input focuses, "1" appears; away input focuses, "0" appears; "Salvo" badge flashes green (centered absolutely so it never shifts).
4. ~58–87%: Same flow for M4 (1×1).
5. ~95–100%: Reset (digits fade, panel closes back to collapsed, toggle reverts).

Predictors panel (the open state for M2) replicates `MatchPredictionsList`:
- Three rows: João 1×0 +10, Maria 2×1 +5, Carlos 0×0 +0 — all with red pulsing dot (live)
- `bg: rgba(17,17,17,0.02)` (Tokenized as `--color-panel-tint` — see Theming)
- Negative horizontal margin so it spans edge-to-edge of the parent's padding (matches real `MatchPredictionsList` `-mx-5 px-5`)

#### Demo 3 — Ranking ao vivo

Replica of `/pools/:id/ranking`. Loop = 8s.

Header: "Jogos ao vivo" with pulsing red dot + "Pontos em vermelho são provisórios".

Five rows in a `.d3-list` (relative, fixed height = 5 × 48px). Each row is `position: absolute` and animated via `transform: translateY()`.

Initial state:
| Slot | Player | Points | Position color | Highlight |
|---|---|---|---|---|
| 1 | João | 12 | red (1°) | — |
| 2 | Maria | 10 | black (2°) | — |
| 3 | Carlos | 9 | black (3°) | — |
| 4 | Ana | 7 | gray-light (4°) | — |
| 5 | Você | 5 (+6) | gray-light (5°), name in red | `--color-row-highlight` background |

Animation timeline:
1. ~22–86%: "+6" appears beside Você's points (provisional, red, pulsing). Implementation note: `+6` is wrapped in `.delta` with `max-width: 0` + `margin-left: 0` by default; the keyframe animates `max-width: 40px` + `margin-left: 6px` together with opacity. This keeps "5" right-aligned with 12/10/9/7 when `+6` is hidden. The pulse runs on an inner `.delta-inner` so it does not conflict with the show/hide animation on the wrapper.
2. ~26–36%: All five rows reorder via `transform: translateY()`. João stays at slot 1; Maria → slot 3; Carlos → slot 4; Ana → slot 5; Você jumps from slot 5 to slot 2.
3. Each row has two stacked position numbers (initial + post-reorder). Only one is visible at a time, controlled by paired `pos-show-initial` / `pos-show-after` keyframes. This makes the "01/02/03/..." numbers update with the reorder.
4. ~90–100%: Reset (rows return to initial positions, numbers swap back, "+6" collapses).

### Motion strategy

Hook:

```ts
// useInViewportLoop.ts
import { useEffect, useRef, useState } from 'react'

export function useInViewportLoop<T extends HTMLElement>(threshold = 0.3) {
  const ref = useRef<T | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => setIsRunning(entry.isIntersecting),
      { threshold },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [threshold])
  return { ref, isRunning }
}
```

Each demo container does:

```tsx
const { ref, isRunning } = useInViewportLoop<HTMLDivElement>()
return <div ref={ref} className={`stage ${isRunning ? 'is-running' : ''}`}> ... </div>
```

Reduced motion is global, no JS:

```css
@media (prefers-reduced-motion: reduce) {
  .stage,
  .stage * {
    animation: none !important;
    transition: none !important;
  }
}
```

In reduced mode every demo settles into its final state — Demo 1 shows the form filled and the "R$ 50" button selected; Demo 2 shows all four matches in their final states (M1 finished, M2 live with panel open, M3 + M4 saved with predicted scores); Demo 3 shows the initial ranking with "+6" visible beside Você.

**Implementation rule (important):** the default (un-animated) CSS state of every animated element MUST be its final/representative frame, NOT the initial hidden frame. Animations must START from the hidden state in the keyframe and END at the visible state. This way, when `is-running` is absent (out-of-viewport, reduced-motion, JS-disabled), the element is rendered as a coherent visible frame — never as a blank/empty element.

Concretely: `.d2-predictors` defaults to `max-height: 320px; opacity: 1; padding: 8px 24px 4px; border-top: 1px solid var(--color-border)`. The `m2-panel-open` keyframe goes hidden at `0%`, opens at `20%`, stays open through `92%`, and closes again at `100%` for the loop reset. Same pattern for `.d1-name-typed` (default `width: var(--typed-width)`), `.d2-status .saved` (default `opacity: 1`), `.d3 .delta` (default `max-width: 40px; margin-left: 6px; opacity: 1`).

(In the brainstorm preview HTMLs, defaults were inverted — that worked because `is-running` was always applied. The production components must invert this so reduced-motion degrades gracefully.)

Typewriter measurement:

```ts
// useTextWidth.ts
import { useEffect, useRef } from 'react'

export function useTextWidth(text: string) {
  const ref = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const apply = () => {
      const m = document.createElement('span')
      const cs = getComputedStyle(node)
      m.textContent = text
      Object.assign(m.style, {
        position: 'absolute', visibility: 'hidden', whiteSpace: 'nowrap',
        fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
        fontStyle: cs.fontStyle, letterSpacing: cs.letterSpacing,
        lineHeight: '1', padding: '0', border: '0',
      })
      document.body.appendChild(m)
      const w = Math.ceil(m.getBoundingClientRect().width)
      m.remove()
      node.style.setProperty('--typed-width', `${w}px`)
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(apply)
    } else {
      apply()
    }
  }, [text])
  return ref
}
```

Usage in `DemoCreatePool`:
```tsx
const typedRef = useTextWidth('Bolão da firma')
return <span ref={typedRef} className="typed">Bolão da firma</span>
```

### Theming

The landing inherits dark mode automatically from the existing `data-theme="dark"` mechanism (spec 015). No new CSS for dark mode beyond two new tokens that replace the `rgba()` literals used in the demos:

Add to `apps/web/src/styles/app.css` `@theme` block:
```css
--color-row-highlight: rgba(17, 17, 17, 0.03);
--color-panel-tint: rgba(17, 17, 17, 0.02);
```

Add to `:where([data-theme="dark"])`:
```css
--color-row-highlight: rgba(245, 240, 232, 0.04);
--color-panel-tint: rgba(245, 240, 232, 0.03);
```

Both tokens are then consumed by `DemoLiveRanking` (the "Você" row background) and `DemoPredict` (the predictors panel background). All other colors flow through existing tokens (`bg-bg`, `text-black`, `bg-red`, `text-green`, `border-border`, etc.).

### Routing

`/` stays dual-purpose. `routes/index.tsx` is rewritten as a thin dispatcher; the existing dashboard markup (the entire current `else` branch — pools list, "Próximos Jogos", `PendingPrizesSection`, etc.) moves verbatim into `components/home/DashboardHome.tsx`. No URL changes for existing users.

The primary and final CTAs both link to `/login`. The `/how-it-works` link in `ScoringMini` and the footer keeps its current behavior.

### Copy (Portuguese, terse)

Hero:
- Eyebrow: "Bolão entre amigos"
- H1: "Monte seu bolão."
- Sub: "Palpite, suba no ranking, leve o prêmio."
- CTA: "Começar agora"

Demos:
- 01 — "Crie um bolão" / "Em 30 segundos." / "Nome, competição, valor de entrada. Pronto pra convidar a galera."
- 02 — "Faça seus palpites" / "O ciclo completo." / "Veja o resultado oficial (com seus pontos), acompanhe o jogo ao vivo (com o palpite da galera) e palpite os próximos jogos."
- 03 — "Ranking ao vivo" / "Suba (ou caia) em segundos." / "Os pontos atualizam enquanto o jogo rola. Provisórios em vermelho — confirmados ao apito final."

ScoringMini header: "Como pontua" / link "Ver regras completas →"

InviteFriendsBand: H2 "Bolão sozinho não tem graça." / "Cada amigo entra com um código de convite. Você cria, manda o link, eles pagam a entrada."

Final CTA: H1 "Em 30 segundos, você tá no jogo." / button "Criar minha conta" / microcopy "Grátis pra começar. Você só paga quando entra em um bolão."

## Testing

### Unit (Vitest)
- `useInViewportLoop.test.ts` — mock `IntersectionObserver`; verify `isRunning` toggles when the observed entry's `isIntersecting` changes.
- `useTextWidth.test.ts` — mock `document.fonts.ready` + DOM measurement; verify the CSS variable is set on the ref node.
- `ScoringMini.test.tsx` — renders with `SCORING` constants from `@m5nita/shared`; snapshot.

### Component (Vitest + RTL)
- `LandingPage.test.tsx` — renders with no session; primary CTA link points to `/login`; floating "Entrar" link points to `/login`; `/how-it-works` link present in footer and ScoringMini.
- `DemoPredict.test.tsx` — renders 4 match rows; each `<img>` has `alt=""` (decorative); the M2 row contains the predictors panel markup (visibility controlled by CSS animation, not state).

### Smoke (Playwright)
- One scenario: visit `/` without a session → assert the landing renders (`<h1>` "Monte seu bolão.") and that clicking "Começar agora" navigates to `/login`.
- No screenshot regression (animations are too noisy for diffs).

### Accessibility
- Run `axe-core` against `/` in the smoke test; fail on any violation.
- Manual check with `prefers-reduced-motion: reduce` enabled: all three demos display their final state, copy is fully readable, no information is lost.

## Out of scope

- Replacing or rewriting `/how-it-works`.
- Adding social-proof, testimonials, or analytics counters.
- Adding a video element or any non-CSS motion library (no Framer Motion, no GSAP, no Lottie).
- Changing the auth flow beyond linking the CTAs to existing `/login`.
- Refactoring the dashboard view itself — it only moves into a new file (`DashboardHome.tsx`); no behavioral changes.

## Open questions

None. All twelve choices listed in the table above were confirmed during brainstorming with the user.
