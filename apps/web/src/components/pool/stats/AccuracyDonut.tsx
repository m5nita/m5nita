import type { DistributionBlock } from './types'

const SIZE = 132
const STROKE = 14
const R = (SIZE - STROKE) / 2
const C = 2 * Math.PI * R

type Seg = { key: string; value: number; stroke: string; chip: string; label: string }

/**
 * The all-time make-up of the viewer's finished predictions as a 3-segment ring:
 * placar exato (green), só o resultado (amber), erro (gray). The center reads the
 * total; the legend the counts.
 */
export function AccuracyDonut({ block }: { block: DistributionBlock }) {
  const total = Math.max(1, block.total)
  const segs: Seg[] = [
    { key: 'exact', value: block.exact, stroke: 'stroke-green', chip: 'bg-green', label: 'Exato' },
    {
      key: 'result',
      value: block.resultOnly,
      stroke: 'stroke-amber',
      chip: 'bg-amber',
      label: 'Resultado',
    },
    { key: 'miss', value: block.miss, stroke: 'stroke-border', chip: 'bg-border', label: 'Erro' },
  ]

  let acc = 0
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="-rotate-90"
          role="img"
          aria-label="Distribuição dos acertos"
        >
          {segs.map((s) => {
            const frac = s.value / total
            const el = (
              <circle
                key={s.key}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                className={s.stroke}
                strokeWidth={STROKE}
                strokeDasharray={`${frac * C} ${C}`}
                strokeDashoffset={-acc * C}
              />
            )
            acc += frac
            return el
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-3xl font-black text-text-primary">{block.total}</span>
          <span className="font-display text-[9px] font-semibold uppercase tracking-widest text-gray-muted">
            jogos
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {segs.map((s) => (
          <span
            key={s.key}
            className="flex items-center gap-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted"
          >
            <span className={`h-2.5 w-2.5 ${s.chip}`} aria-hidden="true" />
            {s.label} {s.value}
          </span>
        ))}
      </div>
    </div>
  )
}
