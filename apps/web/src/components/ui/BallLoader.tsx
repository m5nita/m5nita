import type { CSSProperties } from 'react'

/**
 * Football-themed loader: a classic black-and-white ball bouncing with
 * squash-and-stretch and a shadow that scales with its height. Pure SVG + CSS
 * (see `.ball-loader` in app.css), so it stays crisp at any size and respects
 * prefers-reduced-motion. Decorative — wrap it with an aria-live label.
 */
export function BallLoader({ size = 48, className = '' }: { size?: number; className?: string }) {
  return (
    <div
      className={`ball-loader ${className}`.trim()}
      style={{ '--ball-size': `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      <div className="ball-loader__ball">
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="46" fill="#fafaf8" stroke="#111111" strokeWidth="4" />
          <path d="M50 33 L66.2 44.75 L60 63.75 L40 63.75 L33.8 44.75 Z" fill="#111111" />
          <g stroke="#111111" strokeWidth="4" strokeLinecap="round">
            <line x1="50" y1="33" x2="50" y2="8" />
            <line x1="66.2" y1="44.75" x2="89.9" y2="37" />
            <line x1="60" y1="63.75" x2="74.7" y2="84" />
            <line x1="40" y1="63.75" x2="25.3" y2="84" />
            <line x1="33.8" y1="44.75" x2="10.1" y2="37" />
          </g>
        </svg>
      </div>
      <div className="ball-loader__shadow" />
    </div>
  )
}
