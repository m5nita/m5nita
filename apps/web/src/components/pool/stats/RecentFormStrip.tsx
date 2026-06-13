import type { FormOutcome, RecentFormBlock } from './types'

const CELL: Record<FormOutcome, { cls: string; label: string }> = {
  exact: { cls: 'bg-green', label: 'Placar exato' },
  result: { cls: 'bg-amber', label: 'Só o resultado' },
  miss: { cls: 'bg-border', label: 'Errou' },
}

/**
 * The viewer's last finished predictions as a row of colored cells (oldest →
 * newest), plus the current run of consecutive hits. Reads in one glance, like a
 * form guide.
 */
export function RecentFormStrip({ block }: { block: RecentFormBlock }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {block.outcomes.map((o, i) => (
          <span
            key={i}
            role="img"
            className={`h-7 w-7 ${CELL[o].cls}`}
            title={CELL[o].label}
            aria-label={CELL[o].label}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {(Object.keys(CELL) as FormOutcome[]).map((o) => (
            <span
              key={o}
              className="flex items-center gap-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted"
            >
              <span className={`h-2.5 w-2.5 ${CELL[o].cls}`} aria-hidden="true" />
              {CELL[o].label}
            </span>
          ))}
        </div>
        {block.currentStreak > 0 && (
          <span className="shrink-0 font-display text-xs font-bold uppercase tracking-wider text-green">
            🔥 {block.currentStreak} seguid{block.currentStreak > 1 ? 'os' : 'o'}
          </span>
        )}
      </div>
    </div>
  )
}
