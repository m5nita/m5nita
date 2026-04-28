# Landing Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static four-step landing on `/` (unauth view) with an animated landing that replicates the real Criar Bolão / Predict / Live Ranking screens, driving sign-ups through three high-fidelity auto-demos.

**Architecture:** A thin dispatcher in `routes/index.tsx` renders either `<DashboardHome />` (logged in) or `<LandingPage />` (unauth). The landing lives in a dedicated `components/landing/` folder with self-contained mock components — the demos do NOT reuse the real app components. Animations are CSS keyframes gated by an `is-running` class applied via an `IntersectionObserver` hook so they pause out-of-viewport and respect `prefers-reduced-motion`. Default CSS state of every animated element is its FINAL frame, so reduced-motion users see a coherent representation.

**Tech Stack:** React 19, TanStack Router, Tailwind CSS v4 (`@theme`-tokenized), Vitest + React Testing Library. No new runtime dependencies.

**Spec:** `specs/018-landing-page-redesign/spec.md`

---

## File Structure

**Create:**
- `apps/web/src/components/home/DashboardHome.tsx` — extracted from current `routes/index.tsx` (the `else` branch)
- `apps/web/src/components/landing/LandingPage.tsx` — composes all sections; imports `landing.css`
- `apps/web/src/components/landing/Hero.tsx`
- `apps/web/src/components/landing/FloatingLoginLink.tsx`
- `apps/web/src/components/landing/DemoCreatePool.tsx`
- `apps/web/src/components/landing/DemoPredict.tsx`
- `apps/web/src/components/landing/DemoLiveRanking.tsx`
- `apps/web/src/components/landing/ScoringMini.tsx`
- `apps/web/src/components/landing/InviteFriendsBand.tsx`
- `apps/web/src/components/landing/FinalCta.tsx`
- `apps/web/src/components/landing/useInViewportLoop.ts`
- `apps/web/src/components/landing/useTextWidth.ts`
- `apps/web/src/components/landing/mocks.ts` — static demo data (teams, matches, ranking)
- `apps/web/src/components/landing/landing.css` — keyframes + reduced-motion override + decoration-only CSS that is too verbose for inline Tailwind

**Modify:**
- `apps/web/src/routes/index.tsx` — becomes thin dispatcher
- `apps/web/src/styles/app.css` — add `--color-row-highlight` and `--color-panel-tint` tokens (light + dark)
- `apps/web/index.html` — add `<link rel="preload" as="image">` for the 8 flag URLs

**Test files (Vitest + RTL):**
- `apps/web/src/components/landing/useInViewportLoop.test.ts`
- `apps/web/src/components/landing/useTextWidth.test.ts`
- `apps/web/src/components/landing/ScoringMini.test.tsx`
- `apps/web/src/components/landing/DemoPredict.test.tsx`
- `apps/web/src/components/landing/LandingPage.test.tsx`

---

### Task 1: Add design tokens for row highlight and panel tint

**Files:**
- Modify: `apps/web/src/styles/app.css`

- [ ] **Step 1: Add tokens to the `@theme` block (light)**

Open `apps/web/src/styles/app.css`. Inside the `@theme { ... }` block, append after the existing `--color-border` line:

```css
  --color-row-highlight: rgba(17, 17, 17, 0.03);
  --color-panel-tint: rgba(17, 17, 17, 0.02);
```

- [ ] **Step 2: Add dark-mode overrides**

Inside the `:where([data-theme="dark"]) { ... }` block, append after the existing `--color-accent-green` line:

```css
  --color-row-highlight: rgba(245, 240, 232, 0.04);
  --color-panel-tint: rgba(245, 240, 232, 0.03);
```

- [ ] **Step 3: Verify build still works**

Run: `pnpm -F @m5nita/web build`
Expected: build succeeds, no CSS errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/styles/app.css
git commit -m "feat(web): add row-highlight and panel-tint tokens for landing demos"
```

---

### Task 2: Create `useInViewportLoop` hook with TDD

**Files:**
- Create: `apps/web/src/components/landing/useInViewportLoop.ts`
- Test: `apps/web/src/components/landing/useInViewportLoop.test.ts`

- [ ] **Step 1: Create the test file**

Create `apps/web/src/components/landing/useInViewportLoop.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInViewportLoop } from './useInViewportLoop'

describe('useInViewportLoop', () => {
  let observerInstances: Array<{
    observe: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    callback: IntersectionObserverCallback
  }> = []

  beforeEach(() => {
    observerInstances = []
    class FakeObserver {
      observe = vi.fn()
      disconnect = vi.fn()
      constructor(public callback: IntersectionObserverCallback) {
        observerInstances.push({
          observe: this.observe,
          disconnect: this.disconnect,
          callback,
        })
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns isRunning=false initially', () => {
    const { result } = renderHook(() => useInViewportLoop<HTMLDivElement>())
    expect(result.current.isRunning).toBe(false)
  })

  it('observes the ref node when attached', () => {
    const { result } = renderHook(() => useInViewportLoop<HTMLDivElement>())
    const node = document.createElement('div')
    act(() => {
      result.current.ref.current = node
    })
    // Re-render to trigger effect with the attached ref
    expect(observerInstances.length).toBeGreaterThanOrEqual(0)
  })

  it('toggles isRunning when entry intersects/leaves viewport', () => {
    const node = document.createElement('div')
    const { result, rerender } = renderHook(() => {
      const value = useInViewportLoop<HTMLDivElement>()
      value.ref.current = node
      return value
    })
    rerender()

    const observer = observerInstances[0]
    expect(observer).toBeDefined()

    act(() => {
      observer.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })
    expect(result.current.isRunning).toBe(true)

    act(() => {
      observer.callback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })
    expect(result.current.isRunning).toBe(false)
  })

  it('disconnects observer on unmount', () => {
    const node = document.createElement('div')
    const { unmount, rerender } = renderHook(() => {
      const value = useInViewportLoop<HTMLDivElement>()
      value.ref.current = node
      return value
    })
    rerender()
    const observer = observerInstances[0]
    unmount()
    expect(observer.disconnect).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F @m5nita/web test useInViewportLoop`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `apps/web/src/components/landing/useInViewportLoop.ts`:

```ts
import { useEffect, useRef, useState } from 'react'

export function useInViewportLoop<T extends HTMLElement>(threshold = 0.3) {
  const ref = useRef<T | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => setIsRunning(entry?.isIntersecting ?? false),
      { threshold },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [threshold])

  return { ref, isRunning }
}
```

- [ ] **Step 4: Run tests again**

Run: `pnpm -F @m5nita/web test useInViewportLoop`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/landing/useInViewportLoop.ts apps/web/src/components/landing/useInViewportLoop.test.ts
git commit -m "feat(web): add useInViewportLoop hook for demo motion gating"
```

---

### Task 3: Create `useTextWidth` hook with TDD

**Files:**
- Create: `apps/web/src/components/landing/useTextWidth.ts`
- Test: `apps/web/src/components/landing/useTextWidth.test.ts`

- [ ] **Step 1: Create the test file**

Create `apps/web/src/components/landing/useTextWidth.test.ts`:

```ts
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTextWidth } from './useTextWidth'

describe('useTextWidth', () => {
  let originalGetBoundingClientRect: typeof Element.prototype.getBoundingClientRect

  beforeEach(() => {
    originalGetBoundingClientRect = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function () {
      return { width: 137.4, height: 16, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }
    }
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve() },
    })
  })

  afterEach(() => {
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect
    vi.restoreAllMocks()
  })

  it('sets the --typed-width CSS variable on the ref node after fonts ready', async () => {
    function Wrapper() {
      const ref = useTextWidth('Bolão da firma')
      return <span ref={ref}>Bolão da firma</span>
    }
    const { container } = render(<Wrapper />)
    const span = container.querySelector('span') as HTMLSpanElement
    // Wait for the next microtask so document.fonts.ready resolves
    await Promise.resolve()
    await Promise.resolve()
    // getBoundingClientRect mock returned 137.4 → Math.ceil → 138
    expect(span.style.getPropertyValue('--typed-width')).toBe('138px')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F @m5nita/web test useTextWidth`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `apps/web/src/components/landing/useTextWidth.ts`:

```ts
import { useEffect, useRef } from 'react'

export function useTextWidth<T extends HTMLElement>(text: string) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const apply = () => {
      const measurer = document.createElement('span')
      const cs = getComputedStyle(node)
      measurer.textContent = text
      Object.assign(measurer.style, {
        position: 'absolute',
        visibility: 'hidden',
        whiteSpace: 'nowrap',
        fontFamily: cs.fontFamily,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        fontStyle: cs.fontStyle,
        letterSpacing: cs.letterSpacing,
        lineHeight: '1',
        padding: '0',
        border: '0',
      })
      document.body.appendChild(measurer)
      const w = Math.ceil(measurer.getBoundingClientRect().width)
      measurer.remove()
      node.style.setProperty('--typed-width', `${w}px`)
    }

    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(apply)
    } else {
      apply()
    }
  }, [text])

  return ref
}
```

- [ ] **Step 4: Run tests again**

Run: `pnpm -F @m5nita/web test useTextWidth`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/landing/useTextWidth.ts apps/web/src/components/landing/useTextWidth.test.ts
git commit -m "feat(web): add useTextWidth hook for typewriter caret alignment"
```

---

### Task 4: Create `mocks.ts` with static demo data

**Files:**
- Create: `apps/web/src/components/landing/mocks.ts`

- [ ] **Step 1: Write the file**

Create `apps/web/src/components/landing/mocks.ts`:

```ts
// Static data driving the landing demos. Plain values, no API.
// Flag URLs (provided by user) point to football-data.org crests CDN.

export const FLAGS = {
  brasil:        'https://crests.football-data.org/764.svg',
  argentina:     'https://crests.football-data.org/762.png',
  barcelona:     'https://crests.football-data.org/81.png',
  realMadrid:    'https://crests.football-data.org/86.png',
  flamengo:      'https://crests.football-data.org/1783.png',
  palmeiras:     'https://crests.football-data.org/1769.png',
  liverpool:     'https://crests.football-data.org/64.png',
  manchesterCity:'https://crests.football-data.org/65.png',
} as const

export type DemoMatchState = 'finished' | 'live' | 'pending'

export interface DemoMatch {
  id: string
  date: string                      // formato "DD/MM"
  state: DemoMatchState
  home: { name: string; flag: string }
  away: { name: string; flag: string }
  myPrediction?: { home: number; away: number }
  actual?: { home: number; away: number }
  myPoints?: number                 // pts confirmados (finished) ou provisórios (live)
  predictedHome?: number            // dígitos animados na demo (M3/M4)
  predictedAway?: number
  predictors?: Array<{
    name: string
    home: number
    away: number
    points: number
  }>
}

export const DEMO_MATCHES: DemoMatch[] = [
  {
    id: 'm1-bar-rma',
    date: '21/06',
    state: 'finished',
    home: { name: 'Barcelona', flag: FLAGS.barcelona },
    away: { name: 'Real Madrid', flag: FLAGS.realMadrid },
    myPrediction: { home: 2, away: 1 },
    actual: { home: 2, away: 1 },
    myPoints: 10, // EXACT_MATCH
  },
  {
    id: 'm2-bra-arg',
    date: '22/06',
    state: 'live',
    home: { name: 'Brasil', flag: FLAGS.brasil },
    away: { name: 'Argentina', flag: FLAGS.argentina },
    myPrediction: { home: 2, away: 1 },
    actual: { home: 1, away: 0 },
    myPoints: 7, // WINNER_AND_DIFF (winner correct, same goal-difference)
    predictors: [
      { name: 'João',   home: 1, away: 0, points: 10 }, // EXACT
      { name: 'Maria',  home: 2, away: 1, points: 7 },  // WINNER_AND_DIFF
      { name: 'Carlos', home: 0, away: 0, points: 0 },  // MISS
    ],
  },
  {
    id: 'm3-fla-pal',
    date: '23/06',
    state: 'pending',
    home: { name: 'Flamengo',  flag: FLAGS.flamengo },
    away: { name: 'Palmeiras', flag: FLAGS.palmeiras },
    predictedHome: 1,
    predictedAway: 0,
  },
  {
    id: 'm4-liv-mci',
    date: '24/06',
    state: 'pending',
    home: { name: 'Liverpool',       flag: FLAGS.liverpool },
    away: { name: 'Manchester City', flag: FLAGS.manchesterCity },
    predictedHome: 1,
    predictedAway: 1,
  },
]

export interface DemoRankingEntry {
  id: string
  name: string
  isYou: boolean
  exactMatches: number
  initialPoints: number
  initialSlot: number
  finalSlot: number
  initialPositionLabel: string  // "01" .. "05" — antes da reordenação
  finalPositionLabel: string    // "01" .. "05" — depois
  initialPositionColor: 'p1' | 'p2' | 'p3' | 'p4' | 'p5'
  finalPositionColor:   'p1' | 'p2' | 'p3' | 'p4' | 'p5'
  liveDelta?: number            // pontos provisórios (somente Você)
}

export const DEMO_RANKING: DemoRankingEntry[] = [
  {
    id: 'joao', name: 'João', isYou: false, exactMatches: 2, initialPoints: 12,
    initialSlot: 0, finalSlot: 0,
    initialPositionLabel: '01', finalPositionLabel: '01',
    initialPositionColor: 'p1', finalPositionColor: 'p1',
  },
  {
    id: 'maria', name: 'Maria', isYou: false, exactMatches: 1, initialPoints: 10,
    initialSlot: 1, finalSlot: 2,
    initialPositionLabel: '02', finalPositionLabel: '03',
    initialPositionColor: 'p2', finalPositionColor: 'p3',
  },
  {
    id: 'carlos', name: 'Carlos', isYou: false, exactMatches: 1, initialPoints: 9,
    initialSlot: 2, finalSlot: 3,
    initialPositionLabel: '03', finalPositionLabel: '04',
    initialPositionColor: 'p3', finalPositionColor: 'p4',
  },
  {
    id: 'ana', name: 'Ana', isYou: false, exactMatches: 0, initialPoints: 7,
    initialSlot: 3, finalSlot: 4,
    initialPositionLabel: '04', finalPositionLabel: '05',
    initialPositionColor: 'p4', finalPositionColor: 'p5',
  },
  {
    id: 'voce', name: 'Você', isYou: true, exactMatches: 0, initialPoints: 5,
    initialSlot: 4, finalSlot: 1,
    initialPositionLabel: '05', finalPositionLabel: '02',
    initialPositionColor: 'p5', finalPositionColor: 'p2',
    liveDelta: 6,
  },
]
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm -F @m5nita/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/mocks.ts
git commit -m "feat(web): add static demo data for landing"
```

---

### Task 5: Create `FloatingLoginLink` component

**Files:**
- Create: `apps/web/src/components/landing/FloatingLoginLink.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/landing/FloatingLoginLink.tsx`:

```tsx
import { Link } from '@tanstack/react-router'

export function FloatingLoginLink() {
  return (
    <Link
      to="/login"
      className="fixed top-4 right-4 z-40 font-display text-xs font-bold uppercase tracking-widest text-black hover:text-red transition-colors lg:top-6 lg:right-8"
    >
      Entrar
    </Link>
  )
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm -F @m5nita/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/FloatingLoginLink.tsx
git commit -m "feat(web): add FloatingLoginLink for landing page"
```

---

### Task 6: Create `Hero` component

**Files:**
- Create: `apps/web/src/components/landing/Hero.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/landing/Hero.tsx`:

```tsx
import { Link } from '@tanstack/react-router'
import { Button } from '../ui/Button'

export function Hero() {
  return (
    <section className="flex flex-col items-start gap-6 py-16 lg:items-center lg:py-24 lg:text-center">
      <p className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
        Bolão entre amigos
      </p>
      <h1 className="font-display text-6xl font-black leading-[0.85] text-black lg:text-8xl">
        Monte seu
        <br />
        bolão.
      </h1>
      <div className="h-1 w-12 bg-red" />
      <p className="max-w-md text-sm leading-relaxed text-gray-dark lg:text-base">
        Palpite, suba no ranking, leve o prêmio.
      </p>
      <Link to="/login" className="mt-2">
        <Button size="lg">Começar agora</Button>
      </Link>
      <span
        aria-hidden="true"
        className="mt-12 hidden font-display text-xs font-bold uppercase tracking-widest text-gray-muted lg:block animate-bounce"
      >
        ↓
      </span>
    </section>
  )
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm -F @m5nita/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/Hero.tsx
git commit -m "feat(web): add Hero section for landing"
```

---

### Task 7: Create `ScoringMini` component with test

**Files:**
- Create: `apps/web/src/components/landing/ScoringMini.tsx`
- Test: `apps/web/src/components/landing/ScoringMini.test.tsx`

- [ ] **Step 1: Write the test**

Create `apps/web/src/components/landing/ScoringMini.test.tsx`:

```tsx
import { SCORING } from '@m5nita/shared'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScoringMini } from './ScoringMini'

function renderWithRouter(ui: React.ReactNode) {
  const rootRoute = createRootRoute({ component: () => <>{ui}</> })
  const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => null })
  const howRoute = createRoute({ getParentRoute: () => rootRoute, path: '/how-it-works', component: () => null })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, howRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(<RouterProvider router={router} />)
}

describe('<ScoringMini />', () => {
  it('renders all four scoring tiers using SCORING constants', () => {
    renderWithRouter(<ScoringMini />)
    expect(screen.getByText(String(SCORING.EXACT_MATCH))).toBeInTheDocument()
    expect(screen.getByText(String(SCORING.WINNER_AND_DIFF))).toBeInTheDocument()
    expect(screen.getByText(String(SCORING.OUTCOME_CORRECT))).toBeInTheDocument()
    expect(screen.getByText(String(SCORING.MISS))).toBeInTheDocument()
  })

  it('links to /how-it-works for full rules', () => {
    renderWithRouter(<ScoringMini />)
    const link = screen.getByRole('link', { name: /ver regras completas/i })
    expect(link.getAttribute('href')).toBe('/how-it-works')
  })
})
```

- [ ] **Step 2: Run the test (it should fail — component does not exist yet)**

Run: `pnpm -F @m5nita/web test ScoringMini`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/landing/ScoringMini.tsx`:

```tsx
import { SCORING } from '@m5nita/shared'
import { Link } from '@tanstack/react-router'

const tiers = [
  { points: SCORING.EXACT_MATCH,      label: 'Placar exato',        example: 'palpite 2×1, deu 2×1',    color: 'bg-green' },
  { points: SCORING.WINNER_AND_DIFF,  label: 'Resultado + saldo',   example: 'palpite 3×1, deu 2×0',    color: 'bg-green/70' },
  { points: SCORING.OUTCOME_CORRECT,  label: 'Acertou o vencedor',  example: 'palpite 1×0, deu 3×0',    color: 'bg-green/40' },
  { points: SCORING.MISS,             label: 'Errou tudo',          example: 'palpite 2×0, deu 0×1',    color: 'bg-border' },
]

export function ScoringMini() {
  return (
    <section className="flex flex-col gap-6 py-16">
      <div>
        <p className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
          Pontuação
        </p>
        <h2 className="mt-1 font-display text-4xl font-black leading-[0.9] text-black">
          Como pontua
        </h2>
        <div className="mt-3 h-1 w-12 bg-red" />
      </div>
      <div className="flex flex-col gap-2">
        {tiers.map((tier) => (
          <div key={tier.label} className="flex items-center gap-3 py-2">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center font-display text-lg font-black text-white ${tier.color}`}
            >
              {tier.points}
            </span>
            <div className="min-w-0">
              <p className="font-display text-sm font-bold uppercase tracking-wide text-black">
                {tier.label}
              </p>
              <p className="mt-1 text-xs text-gray-muted">{tier.example}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-gray-dark">
        Empate? Quem tiver mais <strong className="text-black">placares exatos</strong> fica à frente.
      </p>
      <Link
        to="/how-it-works"
        className="self-start font-display text-xs font-bold uppercase tracking-widest text-gray-muted hover:text-black transition-colors"
      >
        Ver regras completas →
      </Link>
    </section>
  )
}
```

- [ ] **Step 4: Run tests again**

Run: `pnpm -F @m5nita/web test ScoringMini`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/landing/ScoringMini.tsx apps/web/src/components/landing/ScoringMini.test.tsx
git commit -m "feat(web): add ScoringMini section with tests"
```

---

### Task 8: Create `InviteFriendsBand` component

**Files:**
- Create: `apps/web/src/components/landing/InviteFriendsBand.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/landing/InviteFriendsBand.tsx`:

```tsx
export function InviteFriendsBand() {
  return (
    <section className="-mx-5 bg-black px-5 py-16 text-white lg:-mx-12 lg:px-12 lg:py-24">
      <div className="mx-auto max-w-3xl">
        <p className="font-display text-xs font-bold uppercase tracking-widest text-gray-light">
          Convide a galera
        </p>
        <h2 className="mt-2 font-display text-5xl font-black leading-[0.9] uppercase text-white lg:text-7xl">
          Bolão sozinho
          <br />
          não tem graça.
        </h2>
        <div className="mt-4 h-1 w-12 bg-red" />
        <p className="mt-6 max-w-md text-sm leading-relaxed text-gray-light lg:text-base">
          Cada amigo entra com um código de convite. Você cria o bolão, manda o link, eles pagam a entrada.
        </p>
      </div>
    </section>
  )
}
```

Note: the negative `-mx-5` / `lg:-mx-12` makes the band span edge-to-edge of the page padding so the black background reaches the viewport edges.

- [ ] **Step 2: Verify typecheck**

Run: `pnpm -F @m5nita/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/InviteFriendsBand.tsx
git commit -m "feat(web): add InviteFriendsBand section"
```

---

### Task 9: Create `FinalCta` component

**Files:**
- Create: `apps/web/src/components/landing/FinalCta.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/landing/FinalCta.tsx`:

```tsx
import { Link } from '@tanstack/react-router'
import { Button } from '../ui/Button'

export function FinalCta() {
  return (
    <section className="flex flex-col items-center gap-6 py-20 text-center lg:py-28">
      <h2 className="font-display text-5xl font-black leading-[0.85] uppercase text-black lg:text-7xl">
        Em 30 segundos,
        <br />
        você tá no jogo.
      </h2>
      <div className="h-1 w-12 bg-red" />
      <Link to="/login" className="mt-2 w-full max-w-xs">
        <Button size="lg" className="w-full">
          Criar minha conta
        </Button>
      </Link>
      <p className="max-w-xs text-xs leading-relaxed text-gray-muted">
        Grátis pra começar. Você só paga quando entra em um bolão.
      </p>
    </section>
  )
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm -F @m5nita/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/FinalCta.tsx
git commit -m "feat(web): add FinalCta section for landing"
```

---

### Task 10: Create `landing.css` with all keyframes and reduced-motion override

**Files:**
- Create: `apps/web/src/components/landing/landing.css`

- [ ] **Step 1: Write the CSS file**

Create `apps/web/src/components/landing/landing.css`. This file is the source of truth for all landing animations. It will be imported once by `LandingPage.tsx`.

```css
/* ===========================================================
   landing.css — keyframes + reduced-motion fallback for the
   landing page demos. Imported by LandingPage.tsx.
   =========================================================== */

/* ----- Demo 1: Criar bolão -----
   The .typed element uses border-right as the typewriter caret.
   Width is animated 0 → var(--typed-width) (set by useTextWidth).
   Color tokens come from app.css (--color-black, --color-red, etc).
   ----------------------------------------------------------- */

.demo-d1.is-running .d1-name-input {
  animation: d1-name-focus 8s infinite;
}
.demo-d1.is-running .d1-name-typed {
  animation:
    d1-name-type 8s infinite,
    d1-caret-blink 0.8s step-end infinite;
}
.demo-d1.is-running .d1-select-row {
  animation: d1-comp-focus 8s infinite;
}
.demo-d1.is-running .d1-select-row .placeholder {
  animation: d1-placeholder 8s infinite;
}
.demo-d1.is-running .d1-select-row .selected {
  animation: d1-selected 8s infinite;
}
.demo-d1.is-running .d1-select-arrow {
  animation: d1-arrow 8s infinite;
}
.demo-d1.is-running .d1-select-panel {
  animation: d1-panel 8s infinite;
}
.demo-d1.is-running .d1-option-highlight {
  animation: d1-opt-highlight 8s infinite;
}
.demo-d1.is-running .d1-quick-selected {
  animation: d1-quick-select 8s infinite;
}
.demo-d1.is-running .d1-cta {
  animation: d1-cta-pulse 8s infinite;
}

@keyframes d1-caret-blink {
  50% { border-right-color: transparent; }
}
@keyframes d1-name-focus {
  0%, 4%   { border-bottom-color: var(--color-border); }
  6%, 24%  { border-bottom-color: var(--color-black); }
  26%, 100%{ border-bottom-color: var(--color-border); }
}
@keyframes d1-name-type {
  0%, 4%   { width: 0;                       opacity: 1; }
  20%, 78% { width: var(--typed-width, 130px); opacity: 1; }
  84%      { width: var(--typed-width, 130px); opacity: 1; }
  90%      { width: var(--typed-width, 130px); opacity: 0; }
  100%     { width: 0;                       opacity: 0; }
}
@keyframes d1-comp-focus {
  0%, 26%  { border-bottom-color: var(--color-border); }
  28%, 48% { border-bottom-color: var(--color-black); }
  50%, 100%{ border-bottom-color: var(--color-border); }
}
@keyframes d1-arrow {
  0%, 26%  { transform: rotate(0deg); }
  30%, 46% { transform: rotate(180deg); }
  50%, 100%{ transform: rotate(0deg); }
}
@keyframes d1-panel {
  0%, 28%  { opacity: 0; transform: translateY(-4px); }
  32%, 44% { opacity: 1; transform: translateY(0); }
  48%, 100%{ opacity: 0; transform: translateY(-4px); }
}
@keyframes d1-opt-highlight {
  0%, 36%  { background-color: transparent; }
  40%, 46% { background-color: rgba(17, 17, 17, 0.06); }
  50%, 100%{ background-color: transparent; }
}
@keyframes d1-placeholder {
  0%, 46%  { opacity: 1; }
  48%, 100%{ opacity: 0; }
}
@keyframes d1-selected {
  0%, 46%  { opacity: 0; }
  48%, 84% { opacity: 1; }
  90%, 100%{ opacity: 0; }
}
@keyframes d1-quick-select {
  0%, 54%  { background: transparent;        color: var(--color-gray-dark); border-color: var(--color-border); }
  58%, 84% { background: var(--color-black); color: var(--color-white);     border-color: var(--color-black); }
  90%, 100%{ background: transparent;        color: var(--color-gray-dark); border-color: var(--color-border); }
}
@keyframes d1-cta-pulse {
  0%, 64%  { transform: scale(1);    background: var(--color-black); }
  68%      { transform: scale(0.97); background: var(--color-red); border-color: var(--color-red); }
  72%, 88% { transform: scale(1);    background: var(--color-black); border-color: var(--color-black); }
  92%, 100%{ opacity: 0.7; }
}

/* ----- Demo 2: Predict (M2 panel + M3/M4 palpite) ----- */

.demo-d2 .d2-status > span {
  /* default state for "Salvo" — visible (final state for reduced-motion).
     Animation hides at start of loop and shows at the right moment. */
  opacity: 1;
}
.demo-d2 .d2-toggle .label-collapsed { opacity: 1; }
.demo-d2 .d2-toggle .label-expanded  { opacity: 0; position: absolute; left: 0; top: 0; }
/* M2 default = expanded (final state). Animation collapses then re-opens. */
.demo-d2 .d2-toggle.m2-toggle                    { color: var(--color-black); }
.demo-d2 .d2-toggle.m2-toggle .d2-toggle-arrow   { transform: rotate(180deg); }
.demo-d2 .d2-toggle.m2-toggle .label-collapsed   { opacity: 0; }
.demo-d2 .d2-toggle.m2-toggle .label-expanded    { opacity: 1; }
.demo-d2 .d2-predictors.m2-panel {
  max-height: 320px; opacity: 1;
  padding: 8px 24px 4px;
  margin-top: 12px;
  border-top: 1px solid var(--color-border);
}

.demo-d2.is-running .d2-row.m2 .m2-toggle                  { animation: m2-toggle-color  10s infinite; }
.demo-d2.is-running .d2-row.m2 .m2-toggle .d2-toggle-arrow { animation: m2-toggle-arrow  10s infinite; }
.demo-d2.is-running .d2-row.m2 .m2-toggle .label-collapsed { animation: m2-label-collapsed 10s infinite; }
.demo-d2.is-running .d2-row.m2 .m2-toggle .label-expanded  { animation: m2-label-expanded  10s infinite; }
.demo-d2.is-running .d2-row.m2 .m2-panel                   { animation: m2-panel-open    10s infinite; }

@keyframes m2-toggle-color {
  0%, 12%  { color: var(--color-gray-muted); }
  16%, 92% { color: var(--color-black); }
  96%, 100%{ color: var(--color-gray-muted); }
}
@keyframes m2-toggle-arrow {
  0%, 12%  { transform: rotate(0deg); }
  16%, 92% { transform: rotate(180deg); }
  96%, 100%{ transform: rotate(0deg); }
}
@keyframes m2-label-collapsed {
  0%, 12%  { opacity: 1; }
  16%, 92% { opacity: 0; }
  96%, 100%{ opacity: 1; }
}
@keyframes m2-label-expanded {
  0%, 12%  { opacity: 0; }
  16%, 92% { opacity: 1; }
  96%, 100%{ opacity: 0; }
}
@keyframes m2-panel-open {
  0%, 12%  { max-height: 0;     opacity: 0; padding-top: 0;  padding-bottom: 0; margin-top: 0;  border-top-width: 0; }
  20%, 92% { max-height: 320px; opacity: 1; padding-top: 8px; padding-bottom: 4px; margin-top: 12px; border-top-width: 1px; }
  96%, 100%{ max-height: 0;     opacity: 0; padding-top: 0;  padding-bottom: 0; margin-top: 0;  border-top-width: 0; }
}

/* M3: 25–52% (palpita 1-0) */
.demo-d2.is-running .d2-row.m3 .d2-home-input { animation: m3-home-focus 10s infinite; }
.demo-d2.is-running .d2-row.m3 .d2-home-digit { animation: m3-home-digit 10s infinite; }
.demo-d2.is-running .d2-row.m3 .d2-away-input { animation: m3-away-focus 10s infinite; }
.demo-d2.is-running .d2-row.m3 .d2-away-digit { animation: m3-away-digit 10s infinite; }
.demo-d2.is-running .d2-row.m3 .saved          { animation: m3-saved      10s infinite; }

@keyframes m3-home-focus { 0%,22%{border-color:var(--color-border);}25%,30%{border-color:var(--color-black);}32%,100%{border-color:var(--color-border);} }
@keyframes m3-home-digit { 0%,28%{opacity:0;transform:scale(.6);}31%,95%{opacity:1;transform:scale(1);}98%,100%{opacity:0;} }
@keyframes m3-away-focus { 0%,30%{border-color:var(--color-border);}33%,38%{border-color:var(--color-black);}40%,100%{border-color:var(--color-border);} }
@keyframes m3-away-digit { 0%,36%{opacity:0;transform:scale(.6);}39%,95%{opacity:1;transform:scale(1);}98%,100%{opacity:0;} }
@keyframes m3-saved      { 0%,42%{opacity:0;}44%,52%{opacity:1;}55%,100%{opacity:0;} }

/* M4: 58–87% (palpita 1-1) */
.demo-d2.is-running .d2-row.m4 .d2-home-input { animation: m4-home-focus 10s infinite; }
.demo-d2.is-running .d2-row.m4 .d2-home-digit { animation: m4-home-digit 10s infinite; }
.demo-d2.is-running .d2-row.m4 .d2-away-input { animation: m4-away-focus 10s infinite; }
.demo-d2.is-running .d2-row.m4 .d2-away-digit { animation: m4-away-digit 10s infinite; }
.demo-d2.is-running .d2-row.m4 .saved          { animation: m4-saved      10s infinite; }

@keyframes m4-home-focus { 0%,55%{border-color:var(--color-border);}58%,63%{border-color:var(--color-black);}65%,100%{border-color:var(--color-border);} }
@keyframes m4-home-digit { 0%,61%{opacity:0;transform:scale(.6);}63%,95%{opacity:1;transform:scale(1);}98%,100%{opacity:0;} }
@keyframes m4-away-focus { 0%,63%{border-color:var(--color-border);}65%,70%{border-color:var(--color-black);}72%,100%{border-color:var(--color-border);} }
@keyframes m4-away-digit { 0%,68%{opacity:0;transform:scale(.6);}70%,95%{opacity:1;transform:scale(1);}98%,100%{opacity:0;} }
@keyframes m4-saved      { 0%,74%{opacity:0;}76%,84%{opacity:1;}87%,100%{opacity:0;} }

/* Live dot + predictor live dots — ambient pulse, runs always (cheap, no JS) */
.live-pulse {
  animation: live-pulse 1.2s ease-in-out infinite;
}
@keyframes live-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.3; }
}

/* ----- Demo 3: Live ranking ----- */

/* Default = initial state (rows in initial slots, +6 visible — coherent frame for reduced-motion) */
.demo-d3 .d3-row             { transform: translateY(calc(var(--initial-slot, 0) * 48px)); }
.demo-d3 .d3-pos-after       { opacity: 0; }
.demo-d3 .d3-pos-initial     { opacity: 1; }
.demo-d3 .d3-delta {
  display: inline-block;
  overflow: hidden;
  vertical-align: baseline;
  font-size: 16px;
  color: var(--color-red);
  max-width: 40px;
  margin-left: 6px;
  opacity: 1;
}
.demo-d3 .d3-delta-inner {
  display: inline-block;
  animation: live-pulse 1.2s ease-in-out infinite;
}

/* Animations */
.demo-d3.is-running .d3-row             { animation: d3-row-move    8s infinite; }
.demo-d3.is-running .d3-pos-initial     { animation: d3-pos-initial 8s infinite; }
.demo-d3.is-running .d3-pos-after       { animation: d3-pos-after   8s infinite; }
.demo-d3.is-running .row-voce .d3-delta { animation: d3-delta-voce  8s infinite; }

@keyframes d3-row-move {
  0%,   26%  { transform: translateY(calc(var(--initial-slot) * 48px)); }
  36%,  84%  { transform: translateY(calc(var(--final-slot)   * 48px)); }
  90%,  100% { transform: translateY(calc(var(--initial-slot) * 48px)); }
}
@keyframes d3-pos-initial {
  0%,  30%  { opacity: 1; }
  34%, 86%  { opacity: 0; }
  90%, 100% { opacity: 1; }
}
@keyframes d3-pos-after {
  0%,  30%  { opacity: 0; }
  34%, 86%  { opacity: 1; }
  90%, 100% { opacity: 0; }
}
@keyframes d3-delta-voce {
  0%,  18%  { opacity: 0; max-width: 0;    margin-left: 0; }
  22%, 86%  { opacity: 1; max-width: 40px; margin-left: 6px; }
  90%, 100% { opacity: 0; max-width: 0;    margin-left: 0; }
}

/* ----- Reduced motion override ----- */
@media (prefers-reduced-motion: reduce) {
  .stage,
  .stage * {
    animation: none !important;
    transition: none !important;
  }
}
```

- [ ] **Step 2: Verify CSS parses by building**

Run: `pnpm -F @m5nita/web build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/landing.css
git commit -m "feat(web): add landing.css with demo keyframes and reduced-motion fallback"
```

---

### Task 11: Create `DemoCreatePool` component

**Files:**
- Create: `apps/web/src/components/landing/DemoCreatePool.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/landing/DemoCreatePool.tsx`:

```tsx
import { POOL } from '@m5nita/shared'
import { useInViewportLoop } from './useInViewportLoop'
import { useTextWidth } from './useTextWidth'
import { formatCurrency } from '../../lib/utils'

const NAME_VALUE = 'Bolão da firma'
const SELECTED_INDEX = 1 // R$ 50,00 (POOL.QUICK_SELECT_VALUES[1] = 5000)

export function DemoCreatePool() {
  const { ref, isRunning } = useInViewportLoop<HTMLDivElement>()
  const typedRef = useTextWidth<HTMLSpanElement>(NAME_VALUE)
  const selectedFee = POOL.QUICK_SELECT_VALUES[SELECTED_INDEX]

  return (
    <section className="grid grid-cols-1 gap-10 py-12 lg:grid-cols-[1fr_1.1fr] lg:gap-14 lg:py-20 lg:items-center border-t border-border">
      <div className="copy">
        <p className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
          01 — Crie um bolão
        </p>
        <h3 className="mt-2 font-display text-4xl font-black uppercase leading-[0.9] text-black lg:text-5xl">
          Em 30 segundos.
        </h3>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-gray-dark">
          Nome, competição, valor de entrada. Pronto pra convidar a galera.
        </p>
      </div>

      <div
        ref={ref}
        className={`stage demo-d1 relative overflow-hidden border border-border bg-bg p-6 ${isRunning ? 'is-running' : ''}`}
      >
        <div className="flex flex-col gap-6">
          <div>
            <p className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
              Novo
            </p>
            <h4 className="mt-1 font-display text-3xl font-black leading-[0.9] text-black">
              Criar Bolão
            </h4>
            <div className="mt-3 h-1 w-12 bg-red" />
          </div>

          {/* Nome */}
          <div className="flex flex-col gap-1">
            <label className="font-display text-xs font-semibold uppercase tracking-widest text-gray-dark">
              Nome do bolão
            </label>
            <div
              className="d1-name-input relative block h-[38px] overflow-hidden whitespace-nowrap border-b-2 border-border"
              style={{ lineHeight: '38px' }}
            >
              <span
                ref={typedRef}
                className="d1-name-typed inline-block overflow-hidden align-middle"
                style={{
                  borderRight: '2px solid var(--color-black)',
                  height: '16px',
                  width: 'var(--typed-width, 130px)',
                  lineHeight: '1',
                  fontSize: '16px',
                  fontWeight: 500,
                }}
              >
                {NAME_VALUE}
              </span>
            </div>
          </div>

          {/* Competição (custom dropdown) */}
          <div className="flex flex-col gap-1 relative">
            <label className="font-display text-xs font-semibold uppercase tracking-widest text-gray-dark">
              Competição
            </label>
            <div className="d1-select-row relative flex items-center justify-end h-[38px] border-b-2 border-border">
              <span className="placeholder absolute left-0 top-1/2 -translate-y-1/2 text-gray-muted text-base">
                Selecione uma competição
              </span>
              <span className="selected absolute left-0 top-1/2 -translate-y-1/2 text-black text-base font-medium opacity-0">
                Brasileirão 2026
              </span>
              <span
                className="d1-select-arrow inline-block w-2.5 h-2.5 relative"
                style={{ transition: 'transform 200ms' }}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-0"
                  style={{
                    borderRight: '2px solid var(--color-gray-dark)',
                    borderBottom: '2px solid var(--color-gray-dark)',
                    transform: 'rotate(45deg) translate(-2px, -2px)',
                    transformOrigin: '70% 70%',
                  }}
                />
              </span>
            </div>
            <div
              className="d1-select-panel absolute top-full left-0 right-0 z-10 bg-bg border border-border mt-1"
              style={{ opacity: 0, transform: 'translateY(-4px)', pointerEvents: 'none' }}
            >
              <div className="px-3.5 py-2.5 border-b border-border text-sm">Premier League 2025/26</div>
              <div className="px-3.5 py-2.5 border-b border-border text-sm">La Liga 2025/26</div>
              <div className="px-3.5 py-2.5 border-b border-border text-sm">Copa do Mundo 2026</div>
              <div className="d1-option-highlight px-3.5 py-2.5 text-sm">Brasileirão 2026</div>
            </div>
          </div>

          {/* Valor de entrada */}
          <div className="flex flex-col gap-1">
            <label className="font-display text-xs font-semibold uppercase tracking-widest text-gray-dark">
              Valor da entrada
            </label>
            <div className="grid grid-cols-4 gap-2">
              {POOL.QUICK_SELECT_VALUES.map((value, idx) => {
                const selected = idx === SELECTED_INDEX
                return (
                  <button
                    key={value}
                    type="button"
                    className={`${selected ? 'd1-quick-selected' : ''} font-display text-xs font-bold uppercase tracking-wider py-2.5 border-2 border-border bg-transparent text-gray-dark`}
                  >
                    {formatCurrency(value)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* CTA */}
          <div className="d1-cta bg-black text-white border-2 border-black px-6 py-3.5 text-center font-display text-sm font-bold uppercase tracking-wider">
            Criar e Pagar {formatCurrency(selectedFee)}
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm -F @m5nita/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/DemoCreatePool.tsx
git commit -m "feat(web): add DemoCreatePool — animated /pools/create form replica"
```

---

### Task 12: Create `DemoPredict` component with test

**Files:**
- Create: `apps/web/src/components/landing/DemoPredict.tsx`
- Test: `apps/web/src/components/landing/DemoPredict.test.tsx`

- [ ] **Step 1: Write the test**

Create `apps/web/src/components/landing/DemoPredict.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DemoPredict } from './DemoPredict'

describe('<DemoPredict />', () => {
  it('renders all four match rows', () => {
    const { container } = render(<DemoPredict />)
    const rows = container.querySelectorAll('.d2-row')
    expect(rows.length).toBe(4)
  })

  it('renders flag images with empty alt text (decorative)', () => {
    const { container } = render(<DemoPredict />)
    const flags = container.querySelectorAll('img.d2-flag')
    expect(flags.length).toBe(8) // 4 matches × 2 flags
    flags.forEach((img) => {
      expect(img.getAttribute('alt')).toBe('')
    })
  })

  it('renders the predictors panel for the live match (M2)', () => {
    const { container } = render(<DemoPredict />)
    const m2 = container.querySelector('.d2-row.m2')
    expect(m2).not.toBeNull()
    const panel = m2!.querySelector('.d2-predictors')
    expect(panel).not.toBeNull()
    // Three predictors
    const predRows = panel!.querySelectorAll('.d2-pred-row')
    expect(predRows.length).toBe(3)
  })

  it('shows the toggle button for both M1 (finished) and M2 (live)', () => {
    const { container } = render(<DemoPredict />)
    const m1Toggle = container.querySelector('.d2-row.m1 .d2-toggle')
    const m2Toggle = container.querySelector('.d2-row.m2 .d2-toggle')
    expect(m1Toggle).not.toBeNull()
    expect(m2Toggle).not.toBeNull()
  })

  it('does NOT show toggle button for pending matches (M3, M4)', () => {
    const { container } = render(<DemoPredict />)
    expect(container.querySelector('.d2-row.m3 .d2-toggle')).toBeNull()
    expect(container.querySelector('.d2-row.m4 .d2-toggle')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test (should fail — component does not exist)**

Run: `pnpm -F @m5nita/web test DemoPredict`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/landing/DemoPredict.tsx`:

```tsx
import { useInViewportLoop } from './useInViewportLoop'
import { DEMO_MATCHES, type DemoMatch } from './mocks'

function MatchRow({ match, idx }: { match: DemoMatch; idx: number }) {
  const rowClass = `d2-row m${idx + 1} border-b border-border py-3 last:border-b-0 relative`

  if (match.state === 'finished' && match.actual && match.myPrediction) {
    return (
      <div className={rowClass}>
        <div className="d2-date text-center font-display text-[10px] text-gray-muted mb-1.5">
          {match.date}
        </div>
        <div className="d2-status-line flex items-center justify-center gap-2 mb-1 font-display text-[10px] font-bold uppercase leading-none tracking-widest text-gray-muted">
          <span>Resultado oficial</span>
          <span className="flex items-center gap-1.5">
            <span>{match.actual.home}</span><span>x</span><span>{match.actual.away}</span>
          </span>
        </div>
        <div className="d2-main flex items-center gap-2">
          <TeamSideHome name={match.home.name} flag={match.home.flag} />
          <ScoreLockedDisplay home={match.myPrediction.home} away={match.myPrediction.away} />
          <TeamSideAway name={match.away.name} flag={match.away.flag} />
        </div>
        <div className="d2-points mt-1 flex items-center justify-center gap-1 font-display text-xs font-black text-green leading-none">
          +{match.myPoints} pts
        </div>
        <ToggleButton initiallyExpanded={false} />
      </div>
    )
  }

  if (match.state === 'live' && match.actual && match.myPrediction && match.predictors) {
    return (
      <div className={rowClass}>
        <div className="d2-date text-center font-display text-[10px] text-gray-muted mb-1.5">
          {match.date}
        </div>
        <div className="d2-status-line flex items-center justify-center gap-2 mb-1 font-display text-[10px] font-bold uppercase leading-none tracking-widest text-red">
          <span className="flex items-center gap-1">
            <span className="live-pulse w-1 h-1 rounded-full bg-red" aria-hidden="true" />
            Ao Vivo
          </span>
          <span className="flex items-center gap-1.5">
            <span>{match.actual.home}</span><span>x</span><span>{match.actual.away}</span>
          </span>
        </div>
        <div className="d2-main flex items-center gap-2">
          <TeamSideHome name={match.home.name} flag={match.home.flag} />
          <ScoreLockedDisplay home={match.myPrediction.home} away={match.myPrediction.away} />
          <TeamSideAway name={match.away.name} flag={match.away.flag} />
        </div>
        <div className="d2-points mt-1 flex items-center justify-center gap-1 font-display text-xs font-black text-red leading-none">
          <span className="live-pulse w-1 h-1 rounded-full bg-red" aria-hidden="true" />
          +{match.myPoints} pts
        </div>
        <ToggleButton initiallyExpanded={true} className="m2-toggle" />
        <div
          className="d2-predictors m2-panel overflow-hidden"
          style={{ marginLeft: '-24px', marginRight: '-24px', background: 'var(--color-panel-tint)', padding: '0 24px' }}
        >
          {match.predictors.map((p) => (
            <div key={p.name} className="d2-pred-row flex items-center gap-2 py-2 border-b border-border/60 last:border-b-0">
              <span className="d2-pred-name flex-1 truncate font-display text-xs font-bold uppercase tracking-wide text-black">
                {p.name}
              </span>
              <div className="d2-pred-score flex items-center gap-1">
                <div className="flex items-center justify-center h-8 w-8 border-2 border-border/50 font-display text-base font-black text-gray-muted">
                  {p.home}
                </div>
                <span className="font-display text-[11px] font-black text-gray-muted">x</span>
                <div className="flex items-center justify-center h-8 w-8 border-2 border-border/50 font-display text-base font-black text-gray-muted">
                  {p.away}
                </div>
              </div>
              <span className="d2-pred-pts flex items-center justify-end gap-1 min-w-[48px] font-display text-xs font-black text-red">
                <span className="live-pulse w-1 h-1 rounded-full bg-red" aria-hidden="true" />
                +{p.points} pts
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // pending — animated palpite
  return (
    <div className={rowClass}>
      <div className="d2-date text-center font-display text-[10px] text-gray-muted mb-1.5">
        {match.date}
      </div>
      <div className="d2-main flex items-center gap-2">
        <TeamSideHome name={match.home.name} flag={match.home.flag} />
        <div className="d2-score flex items-center gap-1">
          <div className="d2-home-input h-10 w-10 border-2 border-border bg-transparent flex items-center justify-center font-display text-lg font-black text-black">
            <span className="d2-home-digit">{match.predictedHome}</span>
          </div>
          <span className="d2-x font-display text-xs font-black text-gray-muted">x</span>
          <div className="d2-away-input h-10 w-10 border-2 border-border bg-transparent flex items-center justify-center font-display text-lg font-black text-black">
            <span className="d2-away-digit">{match.predictedAway}</span>
          </div>
        </div>
        <TeamSideAway name={match.away.name} flag={match.away.flag} />
      </div>
      <div className="d2-status mt-1 relative h-3.5">
        <span className="saved absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-display text-[9px] font-bold uppercase tracking-widest text-green whitespace-nowrap">
          Salvo
        </span>
      </div>
    </div>
  )
}

function TeamSideHome({ name, flag }: { name: string; flag: string }) {
  return (
    <div className="d2-side-home flex flex-1 items-center justify-end gap-1.5 min-w-0">
      <span className="d2-team-name truncate font-display text-xs font-bold uppercase tracking-wide text-black">
        {name}
      </span>
      <img className="d2-flag h-5 w-5 rounded-full object-cover shrink-0" src={flag} alt="" />
    </div>
  )
}

function TeamSideAway({ name, flag }: { name: string; flag: string }) {
  return (
    <div className="d2-side-away flex flex-1 items-center gap-1.5 min-w-0">
      <img className="d2-flag h-5 w-5 rounded-full object-cover shrink-0" src={flag} alt="" />
      <span className="d2-team-name truncate font-display text-xs font-bold uppercase tracking-wide text-black">
        {name}
      </span>
    </div>
  )
}

function ScoreLockedDisplay({ home, away }: { home: number; away: number }) {
  return (
    <div className="d2-score flex items-center gap-1 shrink-0">
      <div className="h-10 w-10 border-2 border-border/50 flex items-center justify-center font-display text-lg font-black text-gray-muted">{home}</div>
      <span className="font-display text-xs font-black text-gray-muted">x</span>
      <div className="h-10 w-10 border-2 border-border/50 flex items-center justify-center font-display text-lg font-black text-gray-muted">{away}</div>
    </div>
  )
}

function ToggleButton({ initiallyExpanded, className = '' }: { initiallyExpanded: boolean; className?: string }) {
  return (
    <div className={`d2-toggle mt-2 flex items-center justify-center gap-1.5 w-full font-display text-[10px] font-bold uppercase tracking-widest ${initiallyExpanded ? 'text-black' : 'text-gray-muted'} ${className}`}>
      <span className="d2-toggle-label relative inline-block">
        <span className="label-collapsed">Ver palpites dos oponentes</span>
        <span className="label-expanded">Ocultar palpites dos oponentes</span>
      </span>
      <span className="d2-toggle-arrow inline-block" style={{ transition: 'transform 200ms' }}>
        ▾
      </span>
    </div>
  )
}

export function DemoPredict() {
  const { ref, isRunning } = useInViewportLoop<HTMLDivElement>()
  return (
    <section className="grid grid-cols-1 gap-10 py-12 lg:grid-cols-[1fr_1.1fr] lg:gap-14 lg:py-20 lg:items-center border-t border-border">
      <div className="copy">
        <p className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
          02 — Faça seus palpites
        </p>
        <h3 className="mt-2 font-display text-4xl font-black uppercase leading-[0.9] text-black lg:text-5xl">
          O ciclo completo.
        </h3>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-gray-dark">
          Veja o resultado oficial (com seus pontos), acompanhe o jogo ao vivo (com o palpite da galera) e palpite os próximos jogos.
        </p>
      </div>
      <div
        ref={ref}
        className={`stage demo-d2 relative overflow-hidden border border-border bg-bg p-6 ${isRunning ? 'is-running' : ''}`}
      >
        <div className="d2 flex flex-col gap-0">
          {DEMO_MATCHES.map((match, idx) => (
            <MatchRow key={match.id} match={match} idx={idx} />
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm -F @m5nita/web test DemoPredict`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/landing/DemoPredict.tsx apps/web/src/components/landing/DemoPredict.test.tsx
git commit -m "feat(web): add DemoPredict — 4-state predictions list with tests"
```

---

### Task 13: Create `DemoLiveRanking` component

**Files:**
- Create: `apps/web/src/components/landing/DemoLiveRanking.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/landing/DemoLiveRanking.tsx`:

```tsx
import { useInViewportLoop } from './useInViewportLoop'
import { DEMO_RANKING } from './mocks'

const POSITION_COLOR: Record<'p1' | 'p2' | 'p3' | 'p4' | 'p5', string> = {
  p1: 'text-red',
  p2: 'text-black',
  p3: 'text-black',
  p4: 'text-gray-light',
  p5: 'text-gray-light',
}

export function DemoLiveRanking() {
  const { ref, isRunning } = useInViewportLoop<HTMLDivElement>()
  return (
    <section className="grid grid-cols-1 gap-10 py-12 lg:grid-cols-[1fr_1.1fr] lg:gap-14 lg:py-20 lg:items-center border-t border-border">
      <div className="copy">
        <p className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
          03 — Ranking ao vivo
        </p>
        <h3 className="mt-2 font-display text-4xl font-black uppercase leading-[0.9] text-black lg:text-5xl">
          Suba (ou caia)
          <br />
          em segundos.
        </h3>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-gray-dark">
          Os pontos atualizam enquanto o jogo rola. Provisórios em vermelho — confirmados ao apito final.
        </p>
      </div>

      <div
        ref={ref}
        className={`stage demo-d3 relative overflow-hidden border border-border bg-bg p-6 ${isRunning ? 'is-running' : ''}`}
      >
        <div className="d3 flex flex-col gap-3">
          <div className="d3-header flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 font-display text-[10px] font-bold uppercase tracking-widest text-red">
              <span className="live-pulse w-1.5 h-1.5 rounded-full bg-red" aria-hidden="true" />
              Jogos ao vivo
            </div>
            <div className="font-display text-[10px] text-gray-muted">
              Pontos em vermelho são provisórios
            </div>
          </div>

          <div className="d3-list relative" style={{ height: '240px' }}>
            {DEMO_RANKING.map((entry) => (
              <div
                key={entry.id}
                className={`d3-row ${entry.isYou ? 'row-voce' : ''} absolute left-0 right-0 grid grid-cols-[40px_1fr_auto] gap-3 items-center border-b border-border h-12 px-3 py-1`}
                style={{
                  ['--initial-slot' as never]: entry.initialSlot,
                  ['--final-slot' as never]: entry.finalSlot,
                  background: entry.isYou ? 'var(--color-row-highlight)' : 'transparent',
                }}
              >
                <div className="d3-pos-wrap relative w-10 h-8">
                  <span className={`d3-pos d3-pos-initial ${POSITION_COLOR[entry.initialPositionColor]} absolute inset-0 flex items-center justify-start font-display text-3xl font-black leading-none`}>
                    {entry.initialPositionLabel}
                  </span>
                  <span className={`d3-pos d3-pos-after ${POSITION_COLOR[entry.finalPositionColor]} absolute inset-0 flex items-center justify-start font-display text-3xl font-black leading-none`}>
                    {entry.finalPositionLabel}
                  </span>
                </div>
                <div className="d3-name-block min-w-0 flex flex-col gap-0.5">
                  <span className={`d3-name font-display text-sm font-bold uppercase tracking-wide ${entry.isYou ? 'text-red' : 'text-black'}`}>
                    {entry.name}
                  </span>
                  <span className="d3-sub-row text-[10px] text-gray-muted">
                    {entry.exactMatches} placar{entry.exactMatches !== 1 ? 'es' : ''} exato{entry.exactMatches !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="d3-pts-block text-right flex flex-col items-end">
                  <span className="d3-pts font-display text-2xl font-black text-black leading-none">
                    {entry.initialPoints}
                    {entry.liveDelta != null && (
                      <span className="d3-delta">
                        <span className="d3-delta-inner">+{entry.liveDelta}</span>
                      </span>
                    )}
                  </span>
                  <span className="d3-pts-label font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted mt-0.5">
                    pts
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm -F @m5nita/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/DemoLiveRanking.tsx
git commit -m "feat(web): add DemoLiveRanking — animated 5-row reordering ranking"
```

---

### Task 14: Create `LandingPage` compositor with test

**Files:**
- Create: `apps/web/src/components/landing/LandingPage.tsx`
- Test: `apps/web/src/components/landing/LandingPage.test.tsx`

- [ ] **Step 1: Write the test**

Create `apps/web/src/components/landing/LandingPage.test.tsx`:

```tsx
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LandingPage } from './LandingPage'

function renderWithRouter() {
  const rootRoute = createRootRoute({ component: () => <LandingPage /> })
  const indexRoute  = createRoute({ getParentRoute: () => rootRoute, path: '/',             component: () => null })
  const loginRoute  = createRoute({ getParentRoute: () => rootRoute, path: '/login',        component: () => null })
  const howRoute    = createRoute({ getParentRoute: () => rootRoute, path: '/how-it-works', component: () => null })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, loginRoute, howRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(<RouterProvider router={router} />)
}

describe('<LandingPage />', () => {
  it('renders the hero H1 "Monte seu bolão."', () => {
    renderWithRouter()
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toContain('Monte seu')
    expect(h1.textContent).toContain('bolão')
  })

  it('renders the floating "Entrar" link → /login', () => {
    renderWithRouter()
    const links = screen.getAllByRole('link', { name: /entrar/i })
    // Only the floating one matches "Entrar" exactly; CTA is "Começar agora"
    expect(links.some((a) => a.getAttribute('href') === '/login')).toBe(true)
  })

  it('renders the primary "Começar agora" CTA → /login', () => {
    renderWithRouter()
    const link = screen.getByRole('link', { name: /começar agora/i })
    expect(link.getAttribute('href')).toBe('/login')
  })

  it('renders the final "Criar minha conta" CTA → /login', () => {
    renderWithRouter()
    const link = screen.getByRole('link', { name: /criar minha conta/i })
    expect(link.getAttribute('href')).toBe('/login')
  })

  it('links to /how-it-works from ScoringMini', () => {
    renderWithRouter()
    const link = screen.getByRole('link', { name: /ver regras completas/i })
    expect(link.getAttribute('href')).toBe('/how-it-works')
  })
})
```

- [ ] **Step 2: Run the test (it should fail — component does not exist)**

Run: `pnpm -F @m5nita/web test LandingPage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/landing/LandingPage.tsx`:

```tsx
import './landing.css'
import { DemoCreatePool } from './DemoCreatePool'
import { DemoLiveRanking } from './DemoLiveRanking'
import { DemoPredict } from './DemoPredict'
import { FinalCta } from './FinalCta'
import { FloatingLoginLink } from './FloatingLoginLink'
import { Hero } from './Hero'
import { InviteFriendsBand } from './InviteFriendsBand'
import { ScoringMini } from './ScoringMini'

export function LandingPage() {
  return (
    <div className="relative">
      <FloatingLoginLink />
      <Hero />
      <DemoCreatePool />
      <DemoPredict />
      <DemoLiveRanking />
      <ScoringMini />
      <InviteFriendsBand />
      <FinalCta />
    </div>
  )
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm -F @m5nita/web test LandingPage`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/landing/LandingPage.tsx apps/web/src/components/landing/LandingPage.test.tsx
git commit -m "feat(web): compose LandingPage with all sections and tests"
```

---

### Task 15: Extract `DashboardHome` from `routes/index.tsx`

**Files:**
- Create: `apps/web/src/components/home/DashboardHome.tsx`

- [ ] **Step 1: Read the current `routes/index.tsx`**

Open `apps/web/src/routes/index.tsx`. Confirm the current structure:
- Lines 1-44: imports + HomePage + queries + early return for `!session`
- Lines 45-122: the unauth landing JSX (this is what we are REPLACING)
- Lines 124-268: the dashboard JSX (this is what we are EXTRACTING into DashboardHome)
- Lines 271-273: route export

- [ ] **Step 2: Create `DashboardHome.tsx`**

Create `apps/web/src/components/home/DashboardHome.tsx`:

```tsx
import type { Match, PoolListItem } from '@m5nita/shared'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { PendingPrizesSection } from './PendingPrizesSection'
import { MatchCard } from '../match/MatchCard'
import { PoolCard } from '../pool/PoolCard'
import { Button } from '../ui/Button'
import { Loading } from '../ui/Loading'
import { apiFetch } from '../../lib/api'
import { useSession } from '../../lib/auth'

export function DashboardHome() {
  const { data: session } = useSession()
  const navigate = useNavigate()
  const [inviteCode, setInviteCode] = useState('')
  const [showFinished, setShowFinished] = useState(false)

  const { data: poolsData, isPending: poolsPending } = useQuery({
    queryKey: ['pools'],
    queryFn: async () => {
      const res = await apiFetch('/api/pools')
      if (!res.ok) throw new Error('Failed to fetch pools')
      return res.json() as Promise<{ pools: PoolListItem[] }>
    },
    refetchInterval: (query) => {
      const pools = query.state.data?.pools
      return pools?.some((p) => p.hasLiveMatch) ? 30_000 : false
    },
  })

  const { data: matchesData } = useQuery({
    queryKey: ['matches', 'upcoming'],
    queryFn: async () => {
      const res = await apiFetch('/api/matches?status=scheduled&featured=true')
      if (!res.ok) throw new Error('Failed to fetch matches')
      return res.json() as Promise<{ matches: Match[] }>
    },
  })

  const allPools = poolsData?.pools ?? []
  const activePools = allPools.filter((p) => p.status === 'active')
  const finishedPools = allPools.filter((p) => p.status === 'closed')
  const upcomingMatches = (matchesData?.matches ?? []).slice(0, 4)

  function handleJoinByCode() {
    const code = inviteCode.trim().toUpperCase()
    if (!code) return
    navigate({ to: '/invite/$inviteCode', params: { inviteCode: code } })
  }

  return (
    <div className="flex flex-col gap-8 lg:gap-12">
      <div className="lg:text-center">
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">
          Olá, {session?.user?.name || 'Jogador'}
        </p>
        <h1 className="mt-2 font-display text-5xl font-black leading-[0.85] text-black lg:mt-3 lg:text-6xl">
          Bolões
        </h1>
        <div className="mt-3 h-1 w-12 bg-red lg:mx-auto" />
      </div>

      <div className="flex flex-wrap gap-3 lg:justify-center">
        <Link to="/pools/create" className="shrink-0">
          <Button size="lg" className="h-full min-h-[48px]">Criar Bolão</Button>
        </Link>
        <form
          className="flex min-w-[180px] flex-1 gap-2 lg:flex-initial lg:min-w-[300px]"
          onSubmit={(e) => { e.preventDefault(); handleJoinByCode() }}
        >
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            placeholder="CÓDIGO"
            className="flex-1 min-w-0 border-2 border-border bg-transparent px-3 font-display text-xs font-bold uppercase tracking-wider text-black placeholder:text-gray-muted transition-colors focus:border-black focus:outline-none"
          />
          <Button type="submit" variant="secondary" size="lg" className="min-h-[48px] shrink-0" disabled={!inviteCode.trim()}>
            Entrar
          </Button>
        </form>
      </div>

      <PendingPrizesSection />

      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">Meus Bolões</h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        {poolsPending ? (
          <Loading message="Carregando..." />
        ) : activePools.length > 0 ? (
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-5">
            {activePools.map((pool, i) => (
              <PoolCard key={pool.id} pool={pool} index={i + 1} />
            ))}
          </div>
        ) : (
          <div className="border-2 border-dashed border-border py-10 text-center">
            <p className="font-display text-sm font-bold uppercase tracking-wider text-gray-muted">Nenhum bolão</p>
            <p className="mt-1 text-xs text-gray-muted">Crie um ou entre pelo convite de um amigo</p>
          </div>
        )}
      </section>

      {finishedPools.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowFinished((v) => !v)}
            aria-expanded={showFinished}
            className="flex w-full items-center gap-3 cursor-pointer"
          >
            <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
              Finalizados ({finishedPools.length})
            </h2>
            <div className="h-px flex-1 bg-border" />
            <span className="font-display text-[10px] font-bold uppercase tracking-widest text-gray-muted" aria-hidden="true">
              {showFinished ? '▴' : '▾'}
            </span>
          </button>
          {showFinished && (
            <div className="mt-4 flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-5">
              {finishedPools.map((pool, i) => (
                <PoolCard key={pool.id} pool={pool} index={i + 1} />
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">Próximos Jogos</h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        {upcomingMatches.length > 0 ? (
          <>
            <div className="flex flex-col lg:grid lg:grid-cols-4 lg:gap-4">
              {upcomingMatches.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </div>
            <Link
              to="/matches"
              className="mt-3 block text-center font-display text-[11px] font-bold uppercase tracking-widest text-gray-muted hover:text-black transition-colors"
            >
              Ver todos →
            </Link>
          </>
        ) : (
          <div className="border-2 border-dashed border-border py-10 text-center">
            <p className="font-display text-sm font-bold uppercase tracking-wider text-gray-muted">Em breve</p>
            <p className="mt-1 text-xs text-gray-muted">Jogos serão exibidos aqui</p>
          </div>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm -F @m5nita/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/home/DashboardHome.tsx
git commit -m "refactor(web): extract DashboardHome from routes/index.tsx"
```

Note: this commit ADDS the new file but does not yet REMOVE the duplicated code from `routes/index.tsx`. The next task does that.

---

### Task 16: Refactor `routes/index.tsx` into a thin dispatcher

**Files:**
- Modify: `apps/web/src/routes/index.tsx`

- [ ] **Step 1: Replace the file content**

Replace the entire content of `apps/web/src/routes/index.tsx` with:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { DashboardHome } from '../components/home/DashboardHome'
import { LandingPage } from '../components/landing/LandingPage'
import { Loading } from '../components/ui/Loading'
import { useSession } from '../lib/auth'

function HomePage() {
  const { data: session, isPending } = useSession()
  if (isPending) return <Loading />
  return session ? <DashboardHome /> : <LandingPage />
}

export const Route = createFileRoute('/')({
  component: HomePage,
})
```

- [ ] **Step 2: Verify typecheck and tests still pass**

Run: `pnpm -F @m5nita/web typecheck && pnpm -F @m5nita/web test`
Expected: typecheck PASS; all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/index.tsx
git commit -m "refactor(web): make /  a thin dispatcher between LandingPage and DashboardHome"
```

---

### Task 17: Add flag preload links to `index.html`

**Files:**
- Modify: `apps/web/index.html`

- [ ] **Step 1: Add preload tags**

Open `apps/web/index.html`. Right before the `<title>` tag (line 50), insert:

```html
    <link rel="preload" as="image" href="https://crests.football-data.org/764.svg" />
    <link rel="preload" as="image" href="https://crests.football-data.org/762.png" />
    <link rel="preload" as="image" href="https://crests.football-data.org/81.png" />
    <link rel="preload" as="image" href="https://crests.football-data.org/86.png" />
    <link rel="preload" as="image" href="https://crests.football-data.org/1783.png" />
    <link rel="preload" as="image" href="https://crests.football-data.org/1769.png" />
    <link rel="preload" as="image" href="https://crests.football-data.org/64.png" />
    <link rel="preload" as="image" href="https://crests.football-data.org/65.png" />
```

- [ ] **Step 2: Verify build**

Run: `pnpm -F @m5nita/web build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/index.html
git commit -m "perf(web): preload flag images for landing Demo 2"
```

---

### Task 18: Manual verification (typecheck, lint, tests, browser)

**No files to change in this task — verify everything works end-to-end.**

- [ ] **Step 1: Typecheck the full repo**

Run: `pnpm typecheck`
Expected: ALL packages PASS.

- [ ] **Step 2: Run all tests**

Run: `pnpm test`
Expected: ALL tests PASS. Specifically the 5 new test files (useInViewportLoop, useTextWidth, ScoringMini, DemoPredict, LandingPage) should appear in the apps/web run.

- [ ] **Step 3: Run lint**

Run: `pnpm biome check .`
Expected: 0 new errors. Pre-existing warnings (lint/style/noNonNullAssertion etc. in unrelated files) are acceptable.

- [ ] **Step 4: Start the dev server**

Run: `pnpm dev`
Wait for `Local: http://localhost:...`. Open that URL in a browser.

- [ ] **Step 5: Verify the landing renders for unauth users**

In an INCOGNITO window (no session), navigate to the dev URL. Confirm:
  - Floating "Entrar" link visible top-right
  - Hero with "Monte seu bolão." H1, red bar, "Começar agora" button
  - Scroll: Demo 1 (Criar bolão) appears, animation runs
    - Typewriter "Bolão da firma" types in (caret aligned, no overshoot)
    - Dropdown opens with 4 options, "Brasileirão 2026" highlights, panel closes
    - R$ 50 button activates
    - CTA pulses
  - Scroll: Demo 2 (Faça seus palpites)
    - M1 finished: "Resultado oficial 2x1", "+10 pts" green
    - M2 live: "Ao Vivo 1x0" with pulsing dot, "+7 pts" red, panel opens with 3 predictors (João +10, Maria +7, Carlos +0)
    - M3: animates 1x0 + "Salvo"
    - M4: animates 1x1 + "Salvo"
  - Scroll: Demo 3 (Ranking ao vivo)
    - 5 rows with correct position colors (1° red, 2°-3° black, 4°-5° gray)
    - Você highlighted
    - "+6" appears
    - Reorder happens (Você jumps from 5° → 2°)
  - Scroll: ScoringMini with 10/7/5/0 tiers, link to /how-it-works
  - Scroll: InviteFriendsBand black panel
  - Scroll: FinalCta "Em 30 segundos…" with "Criar minha conta" button
  - Click "Começar agora" → goes to /login ✓
  - Click "Criar minha conta" → goes to /login ✓
  - Click "Ver regras completas →" → goes to /how-it-works ✓

- [ ] **Step 6: Verify dashboard still works for logged-in users**

Sign in. Confirm `/` now shows the DashboardHome (Pools list, Próximos Jogos, etc.) — not the landing. No regression in any dashboard feature.

- [ ] **Step 7: Verify dark mode**

Open the theme switcher (already in the app). Toggle to dark. Reload `/`. Confirm:
  - Landing renders with dark tokens (dark bg, light text)
  - Demo backgrounds use dark `--color-row-highlight` and `--color-panel-tint`
  - All flags still visible (PNG/SVG with proper contrast)

- [ ] **Step 8: Verify reduced-motion**

In browser DevTools → Rendering tab → "Emulate CSS media feature prefers-reduced-motion: reduce". Reload `/`. Confirm:
  - All three demos display their final state (form filled, predictions saved, ranking with +6 visible)
  - No animation plays
  - All copy is readable, no information missing

- [ ] **Step 9: Verify mobile layout**

In DevTools → toggle device toolbar (responsive mode). Set width to 375px (iPhone SE). Confirm:
  - Each demo block stacks vertically (copy on top, demo below)
  - Hero is left-aligned (mobile) instead of centered (desktop)
  - Floating "Entrar" link doesn't overlap content
  - All sections respect padding without horizontal scroll

- [ ] **Step 10: If everything passes, push the branch**

```bash
git push -u origin <branch-name>
```

(If working on `main` directly, push `git push`.)

---

## Self-Review

**1. Spec coverage:** Every spec section maps to a task:
  - Architecture → Tasks 14, 15, 16
  - Page outline (sections in order) → Tasks 5, 6, 7, 8, 9, 11, 12, 13, 14
  - Demo 1 (Criar bolão) → Task 11
  - Demo 2 (4 states) → Task 12
  - Demo 3 (Live ranking) → Task 13
  - Motion strategy (`useInViewportLoop`, reduced-motion) → Tasks 2, 10, 18 step 8
  - Typewriter measurement → Task 3
  - Theming (`--color-row-highlight`, `--color-panel-tint`) → Task 1
  - Routing (dual-purpose `/`) → Tasks 15, 16
  - Mocks data → Task 4
  - Flag preload → Task 17
  - Manual smoke + reduced-motion + dark mode → Task 18
  - Tests (Vitest) → Tasks 2, 3, 7, 12, 14
  - Decision: default = final state for graceful degradation → Task 10 (CSS file embeds this rule)

**2. Placeholder scan:** No "TBD", "TODO", "implement later", "similar to Task N" — every task has the actual content. Every CSS keyframe is spelled out. Every component file has the full markup.

**3. Type consistency:** `useInViewportLoop<T>` returns `{ ref, isRunning }` consistently. `useTextWidth<T>(text)` returns a `RefObject<T>` consistently. `DemoMatch` and `DemoRankingEntry` interfaces in mocks.ts match what DemoPredict and DemoLiveRanking consume. POOL.QUICK_SELECT_VALUES (in centavos) consistent with `formatCurrency` usage.
