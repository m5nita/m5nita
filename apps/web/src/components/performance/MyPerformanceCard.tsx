import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useMyPerformance } from '../../lib/performance'
import { formatCurrency } from '../../lib/utils'

/**
 * Home-screen hook into "Meu desempenho", styled as a collapsible section
 * (like "Finalizados") rather than a filled card. Self-gating — renders nothing
 * until the user has joined a pool, so it never shows an empty section.
 */
export function MyPerformanceCard() {
  const { data } = useMyPerformance()
  const [open, setOpen] = useState(false)

  if (!data || data.participei === 0) return null

  const positive = data.saldoCentavos >= 0

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 cursor-pointer transition-opacity active:opacity-60"
      >
        <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
          Meu desempenho
        </h2>
        <div className="h-px flex-1 bg-border" />
        <span
          className="font-display text-[10px] font-bold uppercase tracking-widest text-gray-muted"
          aria-hidden="true"
        >
          {open ? '▴' : '▾'}
        </span>
      </button>

      {open && (
        <Link
          to="/performance"
          className="mt-4 flex items-end justify-between gap-4 border-b border-border py-4 transition-colors hover:border-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black lg:border lg:p-5"
        >
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
              Ver tudo →
            </p>
          </div>
        </Link>
      )}
    </section>
  )
}
