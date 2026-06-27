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
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
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
