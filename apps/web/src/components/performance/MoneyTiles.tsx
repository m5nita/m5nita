import { Link } from '@tanstack/react-router'
import { formatCurrency } from '../../lib/utils'

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border border-border bg-surface px-2 py-2.5 text-center">
      <p className="font-display text-[9px] font-bold uppercase tracking-widest text-gray-muted">
        {label}
      </p>
      <p
        className={`mt-1 font-display text-lg font-black leading-none tabular-nums ${accent ? 'text-green' : 'text-text-primary'}`}
      >
        {value}
      </p>
    </div>
  )
}

/**
 * The money block: what the user spent vs. won, plus the actionable "a sacar"
 * (which routes to the home's prize-withdrawal surface — withdrawals are per
 * pool) and the biggest single prize.
 */
export function MoneyTiles({
  gasteiCentavos,
  premiosConquistadosCentavos,
  aSacarCentavos,
  maiorPremioCentavos,
}: {
  gasteiCentavos: number
  premiosConquistadosCentavos: number
  aSacarCentavos: number
  maiorPremioCentavos: number | null
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Gastei" value={formatCurrency(gasteiCentavos)} />
        <Tile label="Prêmios" value={formatCurrency(premiosConquistadosCentavos)} accent />
      </div>

      {aSacarCentavos > 0 && (
        <Link
          to="/"
          className="flex items-center justify-between gap-3 border border-amber bg-amber/10 px-4 py-3 transition-colors hover:bg-amber/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
        >
          <span>
            <span className="block font-display text-[10px] font-bold uppercase tracking-widest text-amber">
              A sacar
            </span>
            <span className="block font-display text-2xl font-black leading-none tabular-nums text-text-primary">
              {formatCurrency(aSacarCentavos)}
            </span>
          </span>
          <span className="shrink-0 font-display text-xs font-bold uppercase tracking-wider text-amber">
            Sacar →
          </span>
        </Link>
      )}

      {maiorPremioCentavos != null && maiorPremioCentavos > 0 && (
        <div className="flex items-center justify-between border border-dashed border-border px-3 py-2.5">
          <span className="font-display text-[10px] font-bold uppercase tracking-widest text-gray-muted">
            Maior prêmio
          </span>
          <span className="font-display text-lg font-black leading-none tabular-nums text-green">
            {formatCurrency(maiorPremioCentavos)}
          </span>
        </div>
      )}
    </div>
  )
}
