import type { EvolutionBlock } from './types'

const W = 320
const H = 150
const PAD_X = 10
const PAD_TOP = 12
const PAD_BOTTOM = 22

type SeriesKey = 'you' | 'leader' | 'average'
const SERIES: { key: SeriesKey; label: string; stroke: string; dot: string; width: number }[] = [
  { key: 'leader', label: 'Líder', stroke: 'stroke-green', dot: 'fill-green', width: 2 },
  { key: 'you', label: 'Você', stroke: 'stroke-red', dot: 'fill-red', width: 3 },
  { key: 'average', label: 'Média', stroke: 'stroke-gray-light', dot: 'fill-gray-light', width: 2 },
]

/**
 * Cumulative points per finished round, three lines: the viewer, the leader and
 * the pool average. The story at a glance — am I keeping pace, pulling away, or
 * falling behind. Pure inline SVG, no chart lib.
 */
export function EvolutionLineChart({ block }: { block: EvolutionBlock }) {
  const n = block.rounds.length
  const max = Math.max(1, ...block.you, ...block.leader, ...block.average)
  const plotW = W - PAD_X * 2
  const plotH = H - PAD_TOP - PAD_BOTTOM

  const x = (i: number) => PAD_X + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const y = (v: number) => PAD_TOP + plotH - (v / max) * plotH

  const points = (vals: number[]) => vals.map((v, i) => `${x(i)},${y(v)}`).join(' ')

  return (
    <div className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Evolução de pontos acumulados por rodada"
      >
        {/* baseline */}
        <line
          x1={PAD_X}
          y1={PAD_TOP + plotH}
          x2={W - PAD_X}
          y2={PAD_TOP + plotH}
          className="stroke-border"
          strokeWidth={1}
        />
        {SERIES.map((s) => (
          <g key={s.key}>
            <polyline
              points={points(block[s.key])}
              fill="none"
              className={s.stroke}
              strokeWidth={s.width}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {n <= 1 &&
              block[s.key].map((v, i) => (
                <circle key={`${s.key}-${i}`} cx={x(i)} cy={y(v)} r={3} className={s.dot} />
              ))}
          </g>
        ))}
        {/* round labels (first / last to avoid clutter) */}
        {n > 0 && (
          <>
            <text
              x={PAD_X}
              y={H - 6}
              className="fill-gray-muted font-display"
              fontSize="9"
              textAnchor="start"
            >
              R{block.rounds[0]}
            </text>
            {n > 1 && (
              <text
                x={W - PAD_X}
                y={H - 6}
                className="fill-gray-muted font-display"
                fontSize="9"
                textAnchor="end"
              >
                R{block.rounds[n - 1]}
              </text>
            )}
          </>
        )}
      </svg>
      <div className="flex items-center justify-center gap-4">
        {SERIES.map((s) => (
          <span
            key={s.key}
            className="flex items-center gap-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted"
          >
            <span className={`h-0.5 w-3 ${s.dot.replace('fill-', 'bg-')}`} aria-hidden="true" />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
