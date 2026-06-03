import { type CSSProperties, useId } from 'react'

// Truncated-icosahedron (real soccer-ball solid) projected to 2D: the authentic
// pattern of black pentagons + white hexagons wrapping around the sphere, with
// faces foreshortening toward the silhouette. Geometry is precomputed.
const HEXAGONS = [
  'M65.42 8.78 L68.01 7.97 L53.39 7.15 L36.18 7.15 L33.59 7.97 L48.21 8.78 Z',
  'M88.74 30.80 L91.33 29.98 L80.97 18.57 L68.01 7.97 L65.42 8.78 L75.78 20.20 Z',
  'M18.69 18.57 L12.08 24.30 L5.19 41.45 L4.92 52.87 L11.53 47.13 L18.42 29.98 Z',
  'M11.53 47.13 L4.92 52.87 L8.67 70.02 L19.03 81.43 L25.65 75.70 L21.90 58.55 Z',
  'M87.92 75.70 L94.81 58.55 L90.89 48.45 L80.08 55.50 L73.19 72.66 L77.11 82.75 Z',
  'M47.93 20.20 L48.21 8.78 L33.59 7.97 L18.69 18.57 L18.42 29.98 L33.04 30.80 Z',
  'M63.82 92.85 L77.11 82.75 L73.19 72.66 L55.98 72.66 L42.69 82.75 L46.61 92.85 Z',
  'M90.89 48.45 L88.74 30.80 L75.78 20.20 L64.98 27.25 L67.13 44.90 L80.08 55.50 Z',
  'M42.69 82.75 L55.98 72.66 L52.23 55.50 L35.19 48.45 L21.90 58.55 L25.65 75.70 Z',
  'M67.13 44.90 L64.98 27.25 L47.93 20.20 L33.04 30.80 L35.19 48.45 L52.23 55.50 Z',
]
const PENTAGONS = [
  'M81.31 81.43 L87.92 75.70 L77.11 82.75 L63.82 92.85 L66.41 92.03 Z',
  'M94.81 58.55 L95.08 47.13 L91.33 29.98 L88.74 30.80 L90.89 48.45 Z',
  'M31.99 92.03 L46.61 92.85 L42.69 82.75 L25.65 75.70 L19.03 81.43 Z',
  'M75.78 20.20 L65.42 8.78 L48.21 8.78 L47.93 20.20 L64.98 27.25 Z',
  'M35.19 48.45 L33.04 30.80 L18.42 29.98 L11.53 47.13 L21.90 58.55 Z',
  'M73.19 72.66 L80.08 55.50 L67.13 44.90 L52.23 55.50 L55.98 72.66 Z',
]

/**
 * Football-themed loader: a classic black-and-white soccer ball that bounces
 * with squash-and-stretch and a shadow that scales with its height. Pure SVG +
 * CSS (see `.ball-loader` in app.css) — crisp at any size, honors
 * prefers-reduced-motion. Decorative: wrap with an aria-live label.
 */
export function BallLoader({ size = 48, className = '' }: { size?: number; className?: string }) {
  const clip = `ball-${useId().replace(/:/g, '')}`
  return (
    <div
      className={`ball-loader ${className}`.trim()}
      style={{ '--ball-size': `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      <div className="ball-loader__ball">
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <clipPath id={clip}>
              <circle cx="50" cy="50" r="46" />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clip})`}>
            <circle cx="50" cy="50" r="46" fill="#fafaf8" />
            {HEXAGONS.map((d) => (
              <path
                key={d}
                d={d}
                fill="#fafaf8"
                stroke="#111111"
                strokeWidth="1.1"
                strokeLinejoin="round"
              />
            ))}
            {PENTAGONS.map((d) => (
              <path
                key={d}
                d={d}
                fill="#111111"
                stroke="#111111"
                strokeWidth="1.1"
                strokeLinejoin="round"
              />
            ))}
          </g>
          <circle cx="50" cy="50" r="46" fill="none" stroke="#111111" strokeWidth="2.6" />
        </svg>
      </div>
      <div className="ball-loader__shadow" />
    </div>
  )
}
