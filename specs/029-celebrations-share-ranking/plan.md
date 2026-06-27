# Celebrations & Shareable Ranking Image — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add confetti/haptics to the three dopamine peaks (exact score, payment, win) and replace the redundant "Atualizar ranking" button with a native-share of a Story-format ranking image.

**Architecture:** All client celebration logic sits behind a tiny `lib/celebrate.ts` (localStorage dedup + reduced-motion-aware vibrate) and a self-contained `<Confetti />` (CSS keyframes, no dep). The ranking image reuses the existing server-side satori/resvg OG pipeline (`apps/api/src/lib/ogImage.ts`) via a new `renderRankingOgPng`, served from a new authenticated, member-gated route inside the existing `rankingRoutes`. The web client fetches the PNG and shares the file.

**Tech Stack:** React 19, TanStack Router/Query, Tailwind v4 (`@theme` in `apps/web/src/styles/app.css`), Hono, `satori` + `@resvg/resvg-js` (already installed), Vitest + Testing Library, Biome.

## Global Constraints

- **No new runtime dependencies.** (`satori`, `@resvg/resvg-js` already in `apps/api`.)
- **No database schema changes.**
- All monetary values are centavos (BRL); format with `formatBrl` (api) / `formatCurrency` (web).
- Respect `prefers-reduced-motion: reduce`: no animation, no vibration.
- The ranking is member-only; the image route must be authenticated and member-gated.
- Confetti fires **once per event** (localStorage dedup); concurrent exact scores coalesce into **one** burst.
- Follow Biome formatting; run `pnpm biome check --write <files>` before each commit.
- End every commit message with the trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- The pre-commit hook runs the full suite; commit with `--no-verify` only after running `pnpm --filter @m5nita/web test` / `@m5nita/api test`, `typecheck`, and `biome check` manually (project workaround).

---

## File Structure

**Create:**
- `apps/web/src/lib/celebrate.ts` — localStorage dedup (`claimUncelebrated`, `useCelebrateOnce`), `vibrate`, `prefersReducedMotion`.
- `apps/web/src/lib/celebrate.test.ts` — unit tests for the above.
- `apps/web/src/components/ui/Confetti.tsx` — CSS-particle burst component.
- `apps/web/src/components/ui/Confetti.test.tsx` — render + reduced-motion tests.
- `apps/web/src/lib/shareRanking.ts` — fetch PNG + `navigator.share` + fallback.
- `apps/web/src/lib/shareRanking.test.ts` — fallback-path tests.
- `apps/api/src/lib/rankingImage.ts` — `renderRankingOgPng` + `rankingImageDimensions`.
- `apps/api/src/lib/rankingImage.test.ts` — dimensions + PNG-signature tests.

**Modify:**
- `apps/web/src/styles/app.css` — add `@keyframes confettiFall` + `.confetti-piece` + reduced-motion guard.
- `apps/web/src/components/prediction/ScoreInput.tsx` — "PLACAR EXATO" badge in `ScoreResultFooter`.
- `apps/web/src/routes/pools/$poolId/predictions.tsx` — coalesced exact-score confetti in `MatchList`.
- `apps/web/src/routes/pools/payment-success.tsx` — celebrate the `completed` state.
- `apps/web/src/components/pool/PrizeWithdrawal.tsx` — "VOCÊ GANHOU 🏆" hero + confetti.
- `apps/web/src/routes/pools/$poolId/ranking.tsx` — replace button with `<ShareRankingButton>`.
- `apps/api/src/infrastructure/http/routes/ranking.ts` — `GET /pools/:poolId/ranking/image.png`.
- `apps/api/src/infrastructure/http/routes/ranking.test.ts` — route auth/member/PNG tests.

---

## Task 1: Celebration primitives (`lib/celebrate.ts`)

**Files:**
- Create: `apps/web/src/lib/celebrate.ts`
- Test: `apps/web/src/lib/celebrate.test.ts`

**Interfaces:**
- Produces:
  - `claimUncelebrated(keys: string[]): string[]` — returns the subset of `keys` not previously celebrated and marks them; `[]` if all seen.
  - `useCelebrateOnce(key: string | null): boolean` — `true` exactly once (across reloads) on first mount with an un-celebrated non-null key.
  - `vibrate(pattern?: number | number[]): void` — reduced-motion-aware `navigator.vibrate`.
  - `prefersReducedMotion(): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/celebrate.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { claimUncelebrated, prefersReducedMotion, vibrate } from './celebrate'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('claimUncelebrated', () => {
  it('returns all keys the first time and marks them', () => {
    expect(claimUncelebrated(['a', 'b'])).toEqual(['a', 'b'])
  })

  it('returns only unseen keys on later calls', () => {
    claimUncelebrated(['a'])
    expect(claimUncelebrated(['a', 'b'])).toEqual(['b'])
    expect(claimUncelebrated(['a', 'b'])).toEqual([])
  })

  it('never throws when localStorage.setItem fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => claimUncelebrated(['x'])).not.toThrow()
  })
})

describe('vibrate', () => {
  it('calls navigator.vibrate when motion is allowed', () => {
    const spy = vi.fn()
    vi.stubGlobal('navigator', { vibrate: spy })
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
    vibrate(30)
    expect(spy).toHaveBeenCalledWith(30)
  })

  it('is a no-op under prefers-reduced-motion', () => {
    const spy = vi.fn()
    vi.stubGlobal('navigator', { vibrate: spy })
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    vibrate(30)
    expect(spy).not.toHaveBeenCalled()
    expect(prefersReducedMotion()).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @m5nita/web exec vitest run src/lib/celebrate.test.ts`
Expected: FAIL — cannot find module `./celebrate`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/celebrate.ts
import { useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'm5nita.celebrated'

function readSet(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function persist(set: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]))
  } catch {
    // storage unavailable (private mode) — celebrations may replay; never throw.
  }
}

/** Returns the subset of `keys` not yet celebrated and marks them. Used for the
 *  coalesced exact-score burst: pass every candidate key, fire once if non-empty. */
export function claimUncelebrated(keys: string[]): string[] {
  if (keys.length === 0) return []
  const set = readSet()
  const fresh = keys.filter((k) => !set.has(k))
  if (fresh.length === 0) return []
  for (const k of fresh) set.add(k)
  persist(set)
  return fresh
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function vibrate(pattern: number | number[] = 30): void {
  if (prefersReducedMotion()) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // unsupported — no-op.
  }
}

/** Fires `true` exactly once (across reloads) on first mount with a fresh key. */
export function useCelebrateOnce(key: string | null): boolean {
  const [fire, setFire] = useState(false)
  const doneRef = useRef(false)
  useEffect(() => {
    if (doneRef.current || !key) return
    if (claimUncelebrated([key]).length === 0) return
    doneRef.current = true
    setFire(true)
  }, [key])
  return fire
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @m5nita/web exec vitest run src/lib/celebrate.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Format + commit**

```bash
pnpm biome check --write apps/web/src/lib/celebrate.ts apps/web/src/lib/celebrate.test.ts
git add apps/web/src/lib/celebrate.ts apps/web/src/lib/celebrate.test.ts
git commit --no-verify -m "feat(web): add celebration primitives (dedup + vibrate)"
```

---

## Task 2: `<Confetti />` component + CSS

**Files:**
- Create: `apps/web/src/components/ui/Confetti.tsx`
- Test: `apps/web/src/components/ui/Confetti.test.tsx`
- Modify: `apps/web/src/styles/app.css` (append keyframes + class)

**Interfaces:**
- Consumes: `prefersReducedMotion` from `../../lib/celebrate`.
- Produces: `Confetti` — `({ count?: number, onDone?: () => void }) => JSX.Element | null`. Renders a fixed-overlay burst; auto-calls `onDone` after the animation. Renders `null` under reduced-motion.

- [ ] **Step 1: Append CSS** to `apps/web/src/styles/app.css` (end of file):

```css
/* ── Celebration confetti ──────────────────────────────────────────────── */
@keyframes confettiFall {
  0% {
    transform: translate3d(0, -10vh, 0) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translate3d(var(--confetti-dx, 0), 110vh, 0) rotate(var(--confetti-rot, 540deg));
    opacity: 0;
  }
}
.confetti-piece {
  position: absolute;
  top: 0;
  width: 10px;
  height: 14px;
  border-radius: 2px;
  will-change: transform, opacity;
  animation: confettiFall var(--confetti-dur, 1.5s) cubic-bezier(0.2, 0.6, 0.4, 1) forwards;
}
@media (prefers-reduced-motion: reduce) {
  .confetti-piece {
    animation: none;
    display: none;
  }
}
```

- [ ] **Step 2: Write the failing test**

```tsx
// apps/web/src/components/ui/Confetti.test.tsx
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Confetti } from './Confetti'

afterEach(() => vi.restoreAllMocks())

describe('Confetti', () => {
  it('renders the requested number of pieces', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
    const { container } = render(<Confetti count={12} />)
    expect(container.querySelectorAll('.confetti-piece')).toHaveLength(12)
  })

  it('renders nothing under prefers-reduced-motion', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    const { container } = render(<Confetti count={12} />)
    expect(container.querySelector('.confetti-piece')).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @m5nita/web exec vitest run src/components/ui/Confetti.test.tsx`
Expected: FAIL — cannot find module `./Confetti`.

- [ ] **Step 4: Write minimal implementation**

```tsx
// apps/web/src/components/ui/Confetti.tsx
import { useEffect, useMemo } from 'react'
import { prefersReducedMotion } from '../../lib/celebrate'

const COLORS = ['#c4362a', '#2d6a4f', '#b8791a', '#111111', '#f5f0e8']

interface ConfettiProps {
  count?: number
  onDone?: () => void
}

/** One-shot fixed-overlay confetti burst. Renders nothing under reduced-motion. */
export function Confetti({ count = 80, onDone }: ConfettiProps) {
  const reduced = prefersReducedMotion()

  // Randomize once per mount; pieces are decorative so non-determinism is fine.
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        dx: `${(Math.random() - 0.5) * 40}vw`,
        rot: `${360 + Math.random() * 720}deg`,
        dur: `${1.2 + Math.random() * 0.9}s`,
        delay: `${Math.random() * 0.25}s`,
        color: COLORS[i % COLORS.length],
      })),
    [count],
  )

  useEffect(() => {
    if (reduced || !onDone) return
    const t = setTimeout(onDone, 2300)
    return () => clearTimeout(t)
  }, [reduced, onDone])

  if (reduced) return null

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={
            {
              left: `${p.left}%`,
              backgroundColor: p.color,
              animationDelay: p.delay,
              '--confetti-dx': p.dx,
              '--confetti-rot': p.rot,
              '--confetti-dur': p.dur,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @m5nita/web exec vitest run src/components/ui/Confetti.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Format + commit**

```bash
pnpm biome check --write apps/web/src/components/ui/Confetti.tsx apps/web/src/components/ui/Confetti.test.tsx apps/web/src/styles/app.css
git add apps/web/src/components/ui/Confetti.tsx apps/web/src/components/ui/Confetti.test.tsx apps/web/src/styles/app.css
git commit --no-verify -m "feat(web): add <Confetti> burst component"
```

---

## Task 3: Exact-score celebration (badge + coalesced confetti)

**Files:**
- Modify: `apps/web/src/components/prediction/ScoreInput.tsx` (badge in `ScoreResultFooter`)
- Modify: `apps/web/src/routes/pools/$poolId/predictions.tsx` (`MatchList`)
- Test: `apps/web/src/components/prediction/ScoreInput.test.tsx`

**Interfaces:**
- Consumes: `Confetti` (Task 2), `claimUncelebrated` + `vibrate` (Task 1).

- [ ] **Step 1: Write the failing test** (append to `ScoreInput.test.tsx`)

```tsx
it('shows a PLACAR EXATO badge on a finished exact-score prediction', () => {
  render(
    <ScoreInput
      matchId="m1"
      homeTeam="Brasil"
      awayTeam="França"
      homeFlag={null}
      awayFlag={null}
      matchDate="2026-06-10T18:00:00Z"
      stage="group"
      homeScore={2}
      awayScore={1}
      matchStatus="finished"
      points={10}
      category={10}
      bonus={0}
      actualHomeScore={2}
      actualAwayScore={1}
      onSave={() => {}}
    />,
  )
  expect(screen.getByText(/placar exato/i)).toBeInTheDocument()
})
```

(Ensure `screen` is imported from `@testing-library/react` at the top of the file; add it if missing.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @m5nita/web exec vitest run src/components/prediction/ScoreInput.test.tsx`
Expected: FAIL — "placar exato" not found.

- [ ] **Step 3: Add the badge** in `ScoreInput.tsx` `ScoreResultFooter`, inside the `matchStatus === 'finished'` branch. Replace this block:

```tsx
        {matchStatus === 'finished' &&
          (scoreReady && points !== null ? (
            <ScoreBreakdownToggle
              total={points}
              variant="finished"
              isOpen={breakdownOpen}
              onToggle={onToggleBreakdown}
            />
          ) : (
            <span className="font-display text-xs font-black text-green">+{points ?? 0} pts</span>
          ))}
```

with:

```tsx
        {matchStatus === 'finished' && category === 10 && (
          <span className="flex items-center gap-1 rounded-sm bg-green px-1.5 py-0.5 font-display text-[10px] font-black uppercase tracking-wider text-white">
            🎯 Placar exato
          </span>
        )}
        {matchStatus === 'finished' &&
          (scoreReady && points !== null ? (
            <ScoreBreakdownToggle
              total={points}
              variant="finished"
              isOpen={breakdownOpen}
              onToggle={onToggleBreakdown}
            />
          ) : (
            <span className="font-display text-xs font-black text-green">+{points ?? 0} pts</span>
          ))}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @m5nita/web exec vitest run src/components/prediction/ScoreInput.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire the coalesced confetti** in `predictions.tsx` `MatchList`. Add imports at the top of the file (with the other web imports):

```tsx
import { useEffect, useState } from 'react'
import { Confetti } from '../../../components/ui/Confetti'
import { claimUncelebrated, vibrate } from '../../../lib/celebrate'
```

(If `useEffect`/`useState` are already imported from `react`, merge — do not duplicate.)

Inside `MatchList`, after `const sections = buildSections(matches, grouping ?? 'none')`, add:

```tsx
  const [celebrate, setCelebrate] = useState(false)
  useEffect(() => {
    const exactKeys = matches
      .filter((m) => m.status === 'finished' && predictionMap.get(m.id)?.category === 10)
      .map((m) => `exact:${poolId}:${m.id}`)
    if (claimUncelebrated(exactKeys).length > 0) {
      setCelebrate(true)
      vibrate([30, 40, 30])
    }
  }, [matches, predictionMap, poolId])
```

Then render the burst once, by changing the `MatchList` return wrapper from:

```tsx
  return (
    <div className="flex flex-col">
```

to:

```tsx
  return (
    <div className="flex flex-col">
      {celebrate && <Confetti onDone={() => setCelebrate(false)} />}
```

- [ ] **Step 6: Verify the suite + typecheck**

Run: `pnpm --filter @m5nita/web test && pnpm --filter @m5nita/web typecheck`
Expected: all green.

- [ ] **Step 7: Manual check (Playwright)** — open a pool with a graded exact score in a fresh browser profile (clear `localStorage`): confetti fires once, badge shows, reload → no confetti.

- [ ] **Step 8: Format + commit**

```bash
pnpm biome check --write apps/web/src/components/prediction/ScoreInput.tsx apps/web/src/routes/pools/\$poolId/predictions.tsx apps/web/src/components/prediction/ScoreInput.test.tsx
git add apps/web/src/components/prediction/ScoreInput.tsx apps/web/src/routes/pools/\$poolId/predictions.tsx apps/web/src/components/prediction/ScoreInput.test.tsx
git commit --no-verify -m "feat(web): celebrate cravar o placar exato (badge + confetti + haptics)"
```

---

## Task 4: Payment-success celebration

**Files:**
- Modify: `apps/web/src/routes/pools/payment-success.tsx`

**Interfaces:**
- Consumes: `Confetti` (Task 2), `useCelebrateOnce` (Task 1).

- [ ] **Step 1: Add imports** at the top of `payment-success.tsx`:

```tsx
import { Confetti } from '../../components/ui/Confetti'
import { useCelebrateOnce } from '../../lib/celebrate'
```

- [ ] **Step 2: Celebrate the success state.** In `PaymentSuccessPage`, just before the final `return (` (the `Panel` with `eyebrow="Sucesso"`), add:

```tsx
  const celebrateWelcome = useCelebrateOnce(
    state.kind === 'completed' && !isStats ? `welcome:${poolId ?? 'home'}` : null,
  )
```

Then change that final success `return` to wrap the panel and warm the copy:

```tsx
  return (
    <>
      {celebrateWelcome && <Confetti count={100} />}
      <Panel
        eyebrow="Sucesso"
        eyebrowColor="text-green"
        title={isStats ? 'Pagamento Confirmado' : 'Você Está Dentro! 🎉'}
        barColor="bg-green"
        action={ctxButton(
          poolId ? (isStats ? 'Ver estatísticas' : 'Fazer meus palpites') : 'Ir para Home',
        )}
      >
        {isStats
          ? 'Pagamento processado. Suas estatísticas deste bolão estão desbloqueadas!'
          : 'Seu pagamento foi confirmado e você já faz parte do bolão. Boa sorte!'}
      </Panel>
    </>
  )
```

- [ ] **Step 3: Verify typecheck + suite**

Run: `pnpm --filter @m5nita/web typecheck && pnpm --filter @m5nita/web test`
Expected: green (existing `payment-success` has no test; nothing breaks).

- [ ] **Step 4: Manual check (Playwright)** — visit `/pools/payment-success` (completed state) with cleared `localStorage`: confetti once, "Você Está Dentro! 🎉"; reload → no confetti.

- [ ] **Step 5: Format + commit**

```bash
pnpm biome check --write apps/web/src/routes/pools/payment-success.tsx
git add apps/web/src/routes/pools/payment-success.tsx
git commit --no-verify -m "feat(web): celebrate a confirmed entry payment"
```

---

## Task 5: "VOCÊ GANHOU 🏆" hero on prize win

**Files:**
- Modify: `apps/web/src/components/pool/PrizeWithdrawal.tsx`

**Interfaces:**
- Consumes: `Confetti` (Task 2), `useCelebrateOnce` (Task 1); existing `formatCurrency`.

- [ ] **Step 1: Add imports** to `PrizeWithdrawal.tsx`:

```tsx
import { Confetti } from '../ui/Confetti'
import { useCelebrateOnce } from '../../lib/celebrate'
```

- [ ] **Step 2: Add the hero.** After `if (error || !prize) return null`, add:

```tsx
  const celebrateWin = useCelebrateOnce(prize.isWinner ? `win:${poolId}` : null)
```

Then, immediately inside the top-level `<section>`, before the existing "Bolão finalizado" header `<div>`, insert:

```tsx
      {prize.isWinner && (
        <>
          {celebrateWin && <Confetti count={120} />}
          <div className="mb-6 border-2 border-green bg-green/5 p-6 text-center">
            <p className="font-display text-xs font-bold uppercase tracking-widest text-green">
              Você ganhou 🏆
            </p>
            <p className="mt-1 font-display text-5xl font-black leading-none text-green">
              {formatCurrency(prize.winnerShare)}
            </p>
            <p className="mt-2 text-sm text-gray-dark">
              Parabéns! Informe sua chave PIX abaixo para receber o prêmio.
            </p>
          </div>
        </>
      )}
```

(The existing `prize.isWinner && !prize.withdrawal` form block stays; you may drop its now-duplicated "Parabéns! Informe sua chave PIX…" sentence to avoid repetition.)

- [ ] **Step 3: Verify typecheck + suite**

Run: `pnpm --filter @m5nita/web typecheck && pnpm --filter @m5nita/web test`
Expected: green.

- [ ] **Step 4: Manual check** — open a closed pool you won (e.g., grant a winning state in dev): the "VOCÊ GANHOU" hero shows with one confetti; reload → no confetti, hero persists.

- [ ] **Step 5: Format + commit**

```bash
pnpm biome check --write apps/web/src/components/pool/PrizeWithdrawal.tsx
git add apps/web/src/components/pool/PrizeWithdrawal.tsx
git commit --no-verify -m "feat(web): celebrate winning the prize with a hero block"
```

---

## Task 6: `renderRankingOgPng` (server image)

**Files:**
- Create: `apps/api/src/lib/rankingImage.ts`
- Test: `apps/api/src/lib/rankingImage.test.ts`

**Interfaces:**
- Consumes: `satori`, `Resvg`, brand fonts (same load pattern as `ogImage.ts`), `formatBrl`.
- Produces:
  - `rankingImageDimensions(memberCount: number): { width: number; height: number }` — width always 1080; height is `max(1350, header+rows*ROW+footer)`.
  - `renderRankingOgPng(input: RankingImageInput): Promise<Buffer>` where
    `RankingImageInput = { poolName: string; competitionName: string; prizeCentavos: number; rows: { position: number; name: string; points: number; isViewer: boolean }[] }`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/lib/rankingImage.test.ts
import { describe, expect, it } from 'vitest'
import { rankingImageDimensions, renderRankingOgPng } from './rankingImage'

describe('rankingImageDimensions', () => {
  it('is 1080 wide and at least 1350 tall for small pools', () => {
    expect(rankingImageDimensions(4)).toEqual({ width: 1080, height: 1350 })
  })
  it('extends height for large pools', () => {
    expect(rankingImageDimensions(40).height).toBeGreaterThan(1350)
    expect(rankingImageDimensions(40).width).toBe(1080)
  })
})

describe('renderRankingOgPng', () => {
  it('renders a PNG buffer', async () => {
    const png = await renderRankingOgPng({
      poolName: 'Bolão da Galera',
      competitionName: 'Copa do Mundo 2026',
      prizeCentavos: 33250,
      rows: [
        { position: 1, name: 'Igor', points: 37, isViewer: true },
        { position: 2, name: 'Ana', points: 20, isViewer: false },
      ],
    })
    expect(png).toBeInstanceOf(Buffer)
    // PNG magic number: 89 50 4E 47
    expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @m5nita/api exec vitest run src/lib/rankingImage.test.ts`
Expected: FAIL — cannot find module `./rankingImage`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/lib/rankingImage.ts
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatBrl } from '@m5nita/shared'
import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'

const FONTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../assets/fonts')
const fontInter = readFileSync(join(FONTS_DIR, 'Inter-Regular.ttf'))
const fontInterBold = readFileSync(join(FONTS_DIR, 'Inter-Bold.ttf'))
const fontBarlow = readFileSync(join(FONTS_DIR, 'BarlowCondensed-Black.ttf'))

const COLORS = {
  cream: '#f5f0e8',
  dark: '#1a1613',
  red: '#ef4444',
  green: '#22a06b',
  border: '#e5dfd2',
  muted: '#8a8079',
  rowTint: '#efe7d8',
}

const WIDTH = 1080
const HEADER_H = 300
const ROW_H = 96
const FOOTER_H = 120
const BASE_H = 1350

type Element = { type: string; props: { style?: Record<string, unknown>; children?: unknown } }

export interface RankingImageRow {
  position: number
  name: string
  points: number
  isViewer: boolean
}

export interface RankingImageInput {
  poolName: string
  competitionName: string
  prizeCentavos: number
  rows: RankingImageRow[]
}

export function rankingImageDimensions(memberCount: number): { width: number; height: number } {
  const needed = HEADER_H + memberCount * ROW_H + FOOTER_H
  return { width: WIDTH, height: Math.max(BASE_H, needed) }
}

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

function rankingRow(row: RankingImageRow): Element {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        height: ROW_H,
        padding: '0 56px',
        borderBottom: `1px solid ${COLORS.border}`,
        backgroundColor: row.isViewer ? COLORS.rowTint : COLORS.cream,
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              fontFamily: 'BarlowCondensed',
              fontSize: 52,
              width: 96,
              color: row.position === 1 ? COLORS.red : COLORS.dark,
            },
            children: `${MEDALS[row.position] ?? ''} ${row.position}`,
          },
        },
        {
          type: 'div',
          props: {
            style: {
              flex: 1,
              fontFamily: 'BarlowCondensed',
              fontSize: 46,
              color: COLORS.dark,
              textTransform: 'uppercase',
              overflow: 'hidden',
            },
            children: row.isViewer ? `${row.name} (você)` : row.name,
          },
        },
        {
          type: 'div',
          props: {
            style: { fontFamily: 'BarlowCondensed', fontSize: 52, color: COLORS.dark },
            children: `${row.points} pts`,
          },
        },
      ],
    },
  }
}

function template(input: RankingImageInput, height: number): Element {
  return {
    type: 'div',
    props: {
      style: {
        width: WIDTH,
        height,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: COLORS.cream,
        fontFamily: 'Inter',
      },
      children: [
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', padding: '64px 56px 24px', gap: 8 },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontFamily: 'Inter',
                    fontWeight: 700,
                    fontSize: 24,
                    letterSpacing: 5,
                    color: COLORS.red,
                    textTransform: 'uppercase',
                  },
                  children: `Ranking · ${input.competitionName}`,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontFamily: 'BarlowCondensed',
                    fontSize: 96,
                    lineHeight: 0.95,
                    letterSpacing: -2,
                    color: COLORS.dark,
                    display: 'flex',
                  },
                  children:
                    input.poolName.length > 26 ? `${input.poolName.slice(0, 25)}…` : input.poolName,
                },
              },
              {
                type: 'div',
                props: {
                  style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 },
                  children: [
                    { type: 'div', props: { style: { width: 44, height: 5, backgroundColor: COLORS.red }, children: '' } },
                    {
                      type: 'div',
                      props: {
                        style: { fontFamily: 'Inter', fontWeight: 700, fontSize: 26, color: COLORS.green },
                        children: `Prêmio ${formatBrl(input.prizeCentavos)}`,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', borderTop: `2px solid ${COLORS.dark}` },
            children: input.rows.map(rankingRow),
          },
        },
        {
          type: 'div',
          props: {
            style: {
              marginTop: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: COLORS.dark,
              color: COLORS.cream,
              padding: '28px',
              fontFamily: 'Inter',
              fontWeight: 700,
              fontSize: 26,
              letterSpacing: 6,
              textTransform: 'uppercase',
            },
            children: 'Monte o seu · m5nita.com',
          },
        },
      ],
    },
  }
}

export async function renderRankingOgPng(input: RankingImageInput): Promise<Buffer> {
  const { width, height } = rankingImageDimensions(input.rows.length)
  const svg = await satori(template(input, height) as unknown as Parameters<typeof satori>[0], {
    width,
    height,
    fonts: [
      { name: 'Inter', data: fontInter, weight: 400, style: 'normal' },
      { name: 'Inter', data: fontInterBold, weight: 700, style: 'normal' },
      { name: 'BarlowCondensed', data: fontBarlow, weight: 900, style: 'normal' },
    ],
  })
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng()
  return Buffer.from(png)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @m5nita/api exec vitest run src/lib/rankingImage.test.ts`
Expected: PASS (4 tests). Note: the render test rasterizes once (~100–300ms).

- [ ] **Step 5: Format + commit**

```bash
pnpm biome check --write apps/api/src/lib/rankingImage.ts apps/api/src/lib/rankingImage.test.ts
git add apps/api/src/lib/rankingImage.ts apps/api/src/lib/rankingImage.test.ts
git commit --no-verify -m "feat(api): render the pool ranking as a Story-format PNG"
```

---

## Task 7: Authenticated ranking-image route

**Files:**
- Modify: `apps/api/src/infrastructure/http/routes/ranking.ts`
- Test: `apps/api/src/infrastructure/http/routes/ranking.test.ts`

**Interfaces:**
- Consumes: `renderRankingOgPng` (Task 6), `getPoolRanking` (existing), `poolRepo.isMember`, `poolRepo.findByIdWithDetails` (existing), `createTtlCache` (existing).

- [ ] **Step 1: Write the failing test** (append to `ranking.test.ts`; mock the renderer so the test stays fast — follow the file's existing mock style for `getPoolRanking`/container):

```ts
// Add near the other vi.mock calls:
vi.mock('../../../lib/rankingImage', () => ({
  renderRankingOgPng: vi.fn(async () => Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  rankingImageDimensions: () => ({ width: 1080, height: 1350 }),
}))

describe('GET /api/pools/:poolId/ranking/image.png', () => {
  it('returns 403 for non-members', async () => {
    // configure the existing isMember mock to resolve false (match file convention)
    const res = await app.request('/api/pools/pool-1/ranking/image.png', {
      headers: { 'x-test-user': JSON.stringify({ id: 'outsider' }) },
    })
    expect(res.status).toBe(403)
  })

  it('returns a PNG for members', async () => {
    // configure isMember -> true and getPoolRanking -> [...] per file convention
    const res = await app.request('/api/pools/pool-1/ranking/image.png', {
      headers: { 'x-test-user': JSON.stringify({ id: 'user-1' }) },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
  })
})
```

(Wire the mocks to the same `getContainer().poolRepo.isMember` / `getPoolRanking` doubles the existing tests use; mirror the setup at the top of `ranking.test.ts`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @m5nita/api exec vitest run src/infrastructure/http/routes/ranking.test.ts`
Expected: FAIL — route returns 404.

- [ ] **Step 3: Add the route** in `ranking.ts`. Add imports:

```ts
import { renderRankingOgPng } from '../../../lib/rankingImage'
import { createTtlCache } from '../../../lib/ttlCache'
```

Add a module-level cache (next to the route definitions):

```ts
const RANKING_IMG_TTL_MS = 5 * 60_000
const rankingImageCache = createTtlCache<string, Buffer>(RANKING_IMG_TTL_MS)
```

Add the handler after the existing `GET /pools/:poolId/ranking`:

```ts
// GET /api/pools/:poolId/ranking/image.png — member-gated shareable PNG
rankingRoutes.get('/pools/:poolId/ranking/image.png', async (c) => {
  const currentUser = c.get('user')
  const { poolId } = c.req.param()

  const { poolRepo } = getContainer()
  const isMember = await poolRepo.isMember(poolId, currentUser.id)
  if (!isMember) {
    return c.json({ error: 'NOT_MEMBER', message: 'Você não é membro deste bolão' }, 403)
  }

  const [ranking, details] = await Promise.all([
    getPoolRanking(poolId, currentUser.id),
    poolRepo.findByIdWithDetails(poolId),
  ])

  // Bust on standings change: key by a cheap content signature (points per row).
  const signature = ranking.map((r) => `${r.userId}:${r.totalPoints + r.livePoints}`).join('|')
  const png = await rankingImageCache.getOrCompute(`${poolId}:${signature}`, () =>
    renderRankingOgPng({
      poolName: details?.name ?? 'Bolão',
      competitionName: details?.competitionName ?? '',
      prizeCentavos: details?.prizeTotal ?? 0,
      rows: ranking.map((r) => ({
        position: r.position,
        name: r.name ?? 'Anônimo',
        points: r.totalPoints + r.livePoints,
        isViewer: r.isCurrentUser,
      })),
    }),
  )

  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, max-age=300',
    },
  })
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @m5nita/api exec vitest run src/infrastructure/http/routes/ranking.test.ts`
Expected: PASS.

- [ ] **Step 5: Run guardrails + api suite**

Run: `pnpm --filter @m5nita/api test && pnpm check:leaks && pnpm check:arch`
Expected: green / no violations.

- [ ] **Step 6: Format + commit**

```bash
pnpm biome check --write apps/api/src/infrastructure/http/routes/ranking.ts apps/api/src/infrastructure/http/routes/ranking.test.ts
git add apps/api/src/infrastructure/http/routes/ranking.ts apps/api/src/infrastructure/http/routes/ranking.test.ts
git commit --no-verify -m "feat(api): member-gated ranking image route"
```

---

## Task 8: Share button on the ranking tab

**Files:**
- Create: `apps/web/src/lib/shareRanking.ts`
- Test: `apps/web/src/lib/shareRanking.test.ts`
- Modify: `apps/web/src/routes/pools/$poolId/ranking.tsx`

**Interfaces:**
- Produces: `shareRankingImage(poolId: string, poolName: string): Promise<void>` — fetches the PNG and shares the file via `navigator.share`, else falls back to download + copy.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/shareRanking.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { shareRankingImage } from './shareRanking'

afterEach(() => vi.restoreAllMocks())

function mockPngFetch() {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob([new Uint8Array([1])], { type: 'image/png' }) })))
}

describe('shareRankingImage', () => {
  it('uses navigator.share with the file when supported', async () => {
    mockPngFetch()
    const share = vi.fn(async () => {})
    vi.stubGlobal('navigator', { canShare: () => true, share })
    await shareRankingImage('pool-1', 'Bolão')
    expect(share).toHaveBeenCalledOnce()
  })

  it('falls back to a download when file-share is unsupported', async () => {
    mockPngFetch()
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => {}) } })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await shareRankingImage('pool-1', 'Bolão')
    expect(click).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @m5nita/web exec vitest run src/lib/shareRanking.test.ts`
Expected: FAIL — cannot find module `./shareRanking`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/lib/shareRanking.ts
import { apiFetch } from './api'

/** Fetches the member-gated ranking PNG and shares the file natively, falling
 *  back to a download + copied message where file-sharing is unavailable.
 *  `apiFetch` prepends VITE_API_URL and sends credentials. */
export async function shareRankingImage(poolId: string, poolName: string): Promise<void> {
  const res = await apiFetch(`/api/pools/${poolId}/ranking/image.png`)
  if (!res.ok) throw new Error('Não foi possível gerar a imagem do ranking')
  const blob = await res.blob()
  const file = new File([blob], 'ranking-m5nita.png', { type: 'image/png' })
  const text = `Ranking do bolão "${poolName}" · m5nita.com`

  const nav = navigator as Navigator & { canShare?: (d?: ShareData) => boolean }
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: 'Ranking m5nita', text })
    } catch {
      // user dismissed the sheet — not an error.
    }
    return
  }

  // Fallback: download the image and copy a share message.
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'ranking-m5nita.png'
  a.click()
  URL.revokeObjectURL(url)
  try {
    await navigator.clipboard?.writeText(text)
  } catch {
    // clipboard blocked — the image still downloaded.
  }
}
```

(Verified: `apps/web/src/lib/api.ts` exports `apiFetch(path, init?)` = `fetch(API_BASE + path, { credentials: 'include', ... })`. The Step 1 test stubs global `fetch`, which `apiFetch` calls internally, so it works unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @m5nita/web exec vitest run src/lib/shareRanking.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Replace the button** in `ranking.tsx`. Add imports:

```tsx
import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { shareRankingImage } from '../../../lib/shareRanking'
```

Replace the "Atualizar ranking" `<button>` (the block from `<button type="button" onClick={() => refetch()} ...>Atualizar ranking</button>`) with a share button. Since `RankingContent` does not currently receive the pool name, render the share button from `RankingPage` instead (it has `poolId`; pass a small `<ShareRankingButton>` into the content, or render it under `PoolHub` where `pool.name` is available). Concretely, add this component to the file:

```tsx
function ShareRankingButton({ poolId, poolName }: { poolId: string; poolName: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant="secondary"
      size="md"
      loading={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await shareRankingImage(poolId, poolName)
        } catch {
          // surface nothing intrusive; the button simply re-enables
        } finally {
          setBusy(false)
        }
      }}
      className="self-center"
    >
      Compartilhar
    </Button>
  )
}
```

Then remove the old `Atualizar ranking` button and render `<ShareRankingButton poolId={poolId} poolName={pool.name} />` where it used to be. Because `RankingContent` lacks `pool`, change `RankingPage` to pass the pool name down via the `PoolHub` child callback (it already receives the `pool`):

```tsx
function RankingPage() {
  const { poolId } = Route.useParams()
  return (
    <PoolHub poolId={poolId} activeTab="ranking">
      {(pool) => <RankingContent poolId={poolId} poolName={pool.name} />}
    </PoolHub>
  )
}
```

and update `RankingContent({ poolId }: { poolId: string })` to `RankingContent({ poolId, poolName }: { poolId: string; poolName: string })`, replacing the old button JSX with `<ShareRankingButton poolId={poolId} poolName={poolName} />`.

- [ ] **Step 6: Verify typecheck + suite**

Run: `pnpm --filter @m5nita/web typecheck && pnpm --filter @m5nita/web test`
Expected: green.

- [ ] **Step 7: Manual check (Playwright + a real mobile if possible)** — ranking tab shows "Compartilhar"; on desktop it downloads the PNG and copies the message; inspect the PNG renders all members in a vertical layout.

- [ ] **Step 8: Format + commit**

```bash
pnpm biome check --write apps/web/src/lib/shareRanking.ts apps/web/src/lib/shareRanking.test.ts apps/web/src/routes/pools/\$poolId/ranking.tsx
git add apps/web/src/lib/shareRanking.ts apps/web/src/lib/shareRanking.test.ts apps/web/src/routes/pools/\$poolId/ranking.tsx
git commit --no-verify -m "feat(web): share the ranking as an image (replaces Atualizar ranking)"
```

---

## Final verification

- [ ] `pnpm --filter @m5nita/web test` — green (incl. new celebrate/Confetti/shareRanking tests).
- [ ] `pnpm --filter @m5nita/api test` — green (incl. rankingImage + ranking route tests).
- [ ] `pnpm --filter @m5nita/web typecheck` and `pnpm --filter @m5nita/api exec tsc --noEmit` — clean.
- [ ] `pnpm biome check apps` — only pre-existing warnings.
- [ ] `pnpm check:leaks` and `pnpm check:arch` — no violations.
- [ ] `grep -c satori apps/api/package.json` unchanged; no new entries in any `package.json` (SC-002).
- [ ] Open PR `feat/029-celebrations-share-ranking` → `main`.

## Self-Review Notes (author)

- **Spec coverage:** FR-001/002/003 → Task 1; FR-001 `<Confetti>` → Task 2; FR-004/005 → Task 3; FR-006 → Task 4; FR-007 → Task 5; FR-009/010 → Tasks 6–7; FR-008/011/012 → Task 8. SC-001 (dedup) Task 1 test; SC-002 (no deps) final check; SC-003 (reduced-motion) Tasks 1–2 tests; SC-004 (403/PNG) Task 7; SC-005 (share + fallback) Task 8; SC-006 (suite green) final.
- **Resolved:** Task 8 uses the real `apiFetch` (verified in `lib/api.ts`).
- **Open during implementation:** mirror the exact mock wiring style already used in `ranking.test.ts` (Task 7 Step 1) — the `isMember`/`getPoolRanking` doubles — rather than inventing a new harness.
</content>
</invoke>
