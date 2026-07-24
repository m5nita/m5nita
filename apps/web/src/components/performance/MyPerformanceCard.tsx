import { Link } from '@tanstack/react-router'
import { useMyPerformance } from '../../lib/performance'
import { formatCurrency } from '../../lib/utils'

/**
 * Compact home-screen hook into "Meu desempenho": saldo + win/loss record, with
 * a segmented bar. Self-gating — renders nothing until the user has joined at
 * least one pool (mirrors PendingPrizesSection), so it never shows an empty card.
 */
export function MyPerformanceCard() {
  const { data } = useMyPerformance()
  if (!data || data.participei === 0) return null

  const positive = data.saldoCentavos >= 0

  return (
    <Link
      to="/performance"
      className="block border border-border bg-surface p-4 transition-colors hover:border-gray-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-[10px] font-bold uppercase tracking-widest text-gray-muted">
          Meu desempenho
        </span>
        <span className="font-display text-[11px] font-bold uppercase tracking-wider text-gray-muted">
          Ver tudo →
        </span>
      </div>

      <div className="mt-2 flex items-end justify-between gap-4">
        <div>
          <p
            className={`font-display text-3xl font-black leading-none tabular-nums ${positive ? 'text-green' : 'text-red'}`}
          >
            {positive ? '+' : '−'}
            {formatCurrency(Math.abs(data.saldoCentavos))}
          </p>
          <p className="mt-1 text-[11px] text-gray-muted">
            saldo · {data.participei} {data.participei === 1 ? 'bolão' : 'bolões'}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-black leading-none tabular-nums">
            <span className="text-green">{data.vitorias}</span>
            <span className="text-gray-muted">–</span>
            <span className="text-red">{data.derrotas}</span>
          </p>
          <p className="mt-1 font-display text-[10px] font-bold uppercase tracking-widest text-gray-muted">
            retrospecto
          </p>
        </div>
      </div>

      <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-sm" aria-hidden="true">
        {data.vitorias > 0 && <span className="bg-green" style={{ flex: data.vitorias }} />}
        {data.derrotas > 0 && <span className="bg-red" style={{ flex: data.derrotas }} />}
        {data.emAndamento > 0 && <span className="bg-border" style={{ flex: data.emAndamento }} />}
      </div>
    </Link>
  )
}
