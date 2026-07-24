import { Link } from '@tanstack/react-router'
import { useMyPerformance } from '../../lib/performance'
import { formatCurrency } from '../../lib/utils'
import { ErrorMessage } from '../ui/ErrorMessage'
import { Loading } from '../ui/Loading'
import { AproveitamentoDonut } from './AproveitamentoDonut'
import { SaldoHero } from './SaldoHero'
import { SaldoSparkline } from './SaldoSparkline'

function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: number | string
  accent?: boolean
}) {
  return (
    <div className="border border-border p-4 lg:p-5">
      <p className="font-display text-[10px] font-bold uppercase tracking-widest text-gray-muted">
        {label}
      </p>
      <p
        className={`mt-1.5 font-display text-2xl font-black leading-none tabular-nums lg:text-3xl ${accent ? 'text-green' : 'text-text-primary'}`}
      >
        {value}
      </p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="border border-dashed border-border px-6 py-12 text-center">
      <p className="font-display text-lg font-black uppercase tracking-wide text-text-primary">
        Sua carreira começa aqui
      </p>
      <p className="mx-auto mt-2 max-w-[36ch] text-sm text-gray-muted">
        Você ainda não entrou em nenhum bolão. Assim que participar, seu saldo, aproveitamento e
        histórico aparecem aqui.
      </p>
      <Link
        to="/"
        className="mt-5 inline-block border-2 border-black bg-black px-5 py-2.5 font-display text-xs font-bold uppercase tracking-widest text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red"
      >
        Ver bolões
      </Link>
    </div>
  )
}

export function PerformanceScreen() {
  const { data, isPending, error, refetch } = useMyPerformance()

  if (isPending) return <Loading />
  if (error) {
    return <ErrorMessage message={(error as Error).message} onRetry={() => refetch()} />
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">
          Sua vida de apostador
        </p>
        <h1 className="mt-1 font-display text-4xl font-black leading-[0.9] text-black">
          Meu desempenho
        </h1>
        <div className="mt-3 h-1 w-12 bg-red" />
      </header>

      {data.participei === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-4">
          {/* Hero: saldo + career curve + win-rate ring */}
          <div className="border border-border p-5 lg:p-6">
            <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,300px)_1fr_auto] lg:items-center lg:gap-8">
              <SaldoHero saldoCentavos={data.saldoCentavos} participei={data.participei} />
              <SaldoSparkline points={data.evolucao} />
              <AproveitamentoDonut
                aproveitamento={data.aproveitamento}
                vitorias={data.vitorias}
                derrotas={data.derrotas}
              />
            </div>
          </div>

          {/* Metric cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Bolões" value={data.participei} />
            <StatCard label="Em andamento" value={data.emAndamento} />
            <StatCard label="Gastei" value={formatCurrency(data.gasteiCentavos)} />
            <StatCard
              label="Prêmios"
              value={formatCurrency(data.premiosConquistadosCentavos)}
              accent
            />
          </div>

          {data.aSacarCentavos > 0 && (
            <Link
              to="/"
              className="flex items-center justify-between gap-3 border border-amber bg-amber/10 px-4 py-3 transition-colors hover:bg-amber/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
            >
              <span>
                <span className="block font-display text-[10px] font-bold uppercase tracking-widest text-amber">
                  A sacar
                </span>
                <span className="block font-display text-2xl font-black leading-none tabular-nums text-text-primary">
                  {formatCurrency(data.aSacarCentavos)}
                </span>
              </span>
              <span className="shrink-0 font-display text-xs font-bold uppercase tracking-wider text-amber">
                Sacar →
              </span>
            </Link>
          )}

          {data.maiorPremioCentavos != null && data.maiorPremioCentavos > 0 && (
            <div className="flex items-center justify-between border border-dashed border-border px-4 py-3">
              <span className="font-display text-[10px] font-bold uppercase tracking-widest text-gray-muted">
                Maior prêmio
              </span>
              <span className="font-display text-lg font-black leading-none tabular-nums text-green">
                {formatCurrency(data.maiorPremioCentavos)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
