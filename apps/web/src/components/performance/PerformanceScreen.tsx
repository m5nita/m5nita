import { Link } from '@tanstack/react-router'
import { useMyPerformance } from '../../lib/performance'
import { ErrorMessage } from '../ui/ErrorMessage'
import { Loading } from '../ui/Loading'
import { AproveitamentoDonut } from './AproveitamentoDonut'
import { MoneyTiles } from './MoneyTiles'
import { SaldoHero } from './SaldoHero'
import { SaldoSparkline } from './SaldoSparkline'

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col justify-center border border-border bg-surface px-3 py-3">
      <p className="font-display text-[10px] font-bold uppercase tracking-widest text-gray-muted">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-black leading-none tabular-nums text-text-primary">
        {value}
      </p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="border border-dashed border-border bg-surface px-6 py-12 text-center">
      <p className="font-display text-lg font-black uppercase tracking-wide text-text-primary">
        Sua carreira começa aqui
      </p>
      <p className="mx-auto mt-2 max-w-[36ch] text-sm text-gray-muted">
        Você ainda não entrou em nenhum bolão. Assim que participar, seu saldo, aproveitamento e
        histórico aparecem aqui.
      </p>
      <Link
        to="/"
        className="mt-5 inline-block border-2 border-black bg-black px-5 py-2.5 font-display text-xs font-bold uppercase tracking-widest text-white transition-opacity hover:opacity-90"
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
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <header>
        <h1 className="font-display text-3xl font-black uppercase leading-none tracking-tight text-text-primary">
          Meu desempenho
        </h1>
        <p className="mt-1 text-[13px] text-gray-muted">
          Sua vida de apostador, somando todos os bolões.
        </p>
      </header>

      {data.participei === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="border border-border bg-surface p-5">
            <SaldoHero saldoCentavos={data.saldoCentavos} participei={data.participei} />
            <div className="mt-3">
              <SaldoSparkline points={data.evolucao} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-center border border-border bg-surface p-3">
              <AproveitamentoDonut
                aproveitamento={data.aproveitamento}
                vitorias={data.vitorias}
                derrotas={data.derrotas}
              />
            </div>
            <div className="grid grid-rows-2 gap-3">
              <StatCard label="Bolões" value={data.participei} />
              <StatCard label="Em andamento" value={data.emAndamento} />
            </div>
          </div>

          <MoneyTiles
            gasteiCentavos={data.gasteiCentavos}
            premiosConquistadosCentavos={data.premiosConquistadosCentavos}
            aSacarCentavos={data.aSacarCentavos}
            maiorPremioCentavos={data.maiorPremioCentavos}
          />
        </>
      )}
    </div>
  )
}
