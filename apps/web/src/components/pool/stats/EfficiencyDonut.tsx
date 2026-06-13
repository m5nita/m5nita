import type { EfficiencyBlock } from './types'

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}
function signedPct(v: number): string {
  const r = Math.round(v * 100)
  return `${r >= 0 ? '+' : ''}${r}%`
}

const SIZE = 132
const STROKE = 14
const R = (SIZE - STROKE) / 2
const C = 2 * Math.PI * R

/**
 * Efficiency as a ring: the share of the maximum possible points the viewer
 * actually captured. The center reads the %, with points made / left below and
 * the gap to the pool average as a small signed chip.
 */
export function EfficiencyDonut({ block }: { block: EfficiencyBlock }) {
  const value = Math.min(1, Math.max(0, block.efficiency))
  const dash = `${C * value} ${C}`

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="-rotate-90"
          role="img"
          aria-label={`Eficiência ${pct(value)}`}
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            className="stroke-border"
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            className="stroke-green"
            strokeWidth={STROKE}
            strokeDasharray={dash}
            strokeLinecap="butt"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-3xl font-black text-text-primary">{pct(value)}</span>
          <span className="font-display text-[9px] font-semibold uppercase tracking-widest text-gray-muted">
            dos pontos
          </span>
        </div>
      </div>
      <div className="text-center">
        <p className="font-display text-xs font-bold uppercase tracking-wider text-text-primary">
          {block.earned} feitos · <span className="text-red">{block.leftOnTable} na mesa</span>
        </p>
        <p className="mt-0.5 font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted">
          <span className={block.efficiencyVsAverage >= 0 ? 'text-green' : 'text-red'}>
            {signedPct(block.efficiencyVsAverage)}
          </span>{' '}
          vs média
        </p>
      </div>
    </div>
  )
}
