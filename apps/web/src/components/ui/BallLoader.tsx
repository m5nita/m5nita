import { type CSSProperties, useId } from 'react'

/**
 * Football-themed loader: a classic (Telstar) black-and-white ball bouncing with
 * squash-and-stretch, a shadow that scales with its height, and a slow spin.
 * Pure SVG + CSS (see `.ball-loader` in app.css) — crisp at any size, and it
 * honors prefers-reduced-motion (static ball). Decorative: wrap with an
 * aria-live label where it conveys loading state.
 */
export function BallLoader({ size = 48, className = '' }: { size?: number; className?: string }) {
  // Unique clip id so multiple instances don't collide.
  const clipId = `ball-clip-${useId().replace(/:/g, '')}`
  return (
    <div
      className={`ball-loader ${className}`.trim()}
      style={{ '--ball-size': `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      <div className="ball-loader__ball">
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <clipPath id={clipId}>
              <circle cx="50" cy="50" r="44" />
            </clipPath>
          </defs>
          <circle cx="50" cy="50" r="46" fill="#fafaf8" stroke="#111111" strokeWidth="4" />
          <g clipPath={`url(#${clipId})`}>
            <g stroke="#111111" strokeWidth="3" strokeLinecap="round">
              <line x1="50" y1="34" x2="50" y2="24" />
              <line x1="65.22" y1="45.06" x2="74.73" y2="41.97" />
              <line x1="59.4" y1="62.94" x2="65.28" y2="71.03" />
              <line x1="40.6" y1="62.94" x2="34.72" y2="71.03" />
              <line x1="34.78" y1="45.06" x2="25.27" y2="41.97" />
            </g>
            <path d="M50 34 L65.22 45.06 L59.4 62.94 L40.6 62.94 L34.78 45.06 Z" fill="#111111" />
            <path d="M50 24 L38.59 15.71 L42.95 2.29 L57.05 2.29 L61.41 15.71 Z" fill="#111111" />
            <path
              d="M74.73 41.97 L79.09 28.55 L93.19 28.55 L97.55 41.97 L86.14 50.26 Z"
              fill="#111111"
            />
            <path
              d="M65.28 71.03 L79.39 71.03 L83.75 84.45 L72.34 92.74 L60.92 84.45 Z"
              fill="#111111"
            />
            <path
              d="M34.72 71.03 L39.08 84.45 L27.66 92.74 L16.25 84.45 L20.61 71.03 Z"
              fill="#111111"
            />
            <path
              d="M25.27 41.97 L13.86 50.26 L2.45 41.97 L6.81 28.55 L20.91 28.55 Z"
              fill="#111111"
            />
          </g>
        </svg>
      </div>
      <div className="ball-loader__shadow" />
    </div>
  )
}
