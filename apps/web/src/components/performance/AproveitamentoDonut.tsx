const SIZE = 120
const STROKE = 13
const R = (SIZE - STROKE) / 2
const C = 2 * Math.PI * R

/**
 * Win rate as a ring: vitórias ÷ (vitórias + derrotas). Shows "—" / "sem dados
 * ainda" when the user has no decided pools yet, rather than a misleading 0%.
 */
export function AproveitamentoDonut({
  aproveitamento,
  vitorias,
  derrotas,
}: {
  aproveitamento: number | null
  vitorias: number
  derrotas: number
}) {
  const hasData = aproveitamento != null
  const value = hasData ? Math.min(1, Math.max(0, aproveitamento)) : 0
  const pct = Math.round(value * 100)

  return (
    <div className="flex flex-col items-center gap-2 py-1">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="-rotate-90"
          role="img"
          aria-label={hasData ? `Aproveitamento ${pct}%` : 'Aproveitamento sem dados'}
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            className="stroke-border"
            strokeWidth={STROKE}
          />
          {hasData && (
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              className="stroke-green"
              strokeWidth={STROKE}
              strokeDasharray={`${C * value} ${C}`}
              strokeLinecap="butt"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-3xl font-black tabular-nums text-text-primary">
            {hasData ? `${pct}%` : '—'}
          </span>
          <span className="font-display text-[9px] font-semibold uppercase tracking-widest text-gray-muted">
            aproveit.
          </span>
        </div>
      </div>
      <p className="font-display text-xs font-bold uppercase tracking-wider tabular-nums text-text-primary">
        {hasData ? (
          <>
            <span className="text-green">{vitorias}V</span> ·{' '}
            <span className="text-red">{derrotas}D</span>
          </>
        ) : (
          <span className="text-gray-muted">sem dados ainda</span>
        )}
      </p>
    </div>
  )
}
