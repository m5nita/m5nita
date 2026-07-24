import { formatCurrency } from '../../lib/utils'

/**
 * The headline of the screen: net career profit/loss. One big signed number,
 * green for lucro / red for prejuízo — the "am I up or down?" at a glance.
 */
export function SaldoHero({
  saldoCentavos,
  participei,
}: {
  saldoCentavos: number
  participei: number
}) {
  const positive = saldoCentavos >= 0

  return (
    <div>
      <p className="font-display text-[10px] font-bold uppercase tracking-widest text-gray-muted">
        Saldo na carreira
      </p>
      <p
        className={`mt-1 font-display text-5xl font-black leading-none tabular-nums ${positive ? 'text-green' : 'text-red'}`}
      >
        {positive ? '+' : '−'}
        {formatCurrency(Math.abs(saldoCentavos))}
      </p>
      <p className="mt-1.5 text-[11px] text-gray-muted">
        {participei === 0
          ? 'nenhum bolão ainda'
          : `prêmios conquistados − entradas · ${participei} ${participei === 1 ? 'bolão' : 'bolões'}`}
      </p>
    </div>
  )
}
