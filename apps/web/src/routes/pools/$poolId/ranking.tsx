import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { formatCurrency } from '../../../lib/utils'
import { Loading } from '../../../components/ui/Loading'
import { ErrorMessage } from '../../../components/ui/ErrorMessage'
import type { RankingEntry } from '@manita/shared'

function RankingPage() {
  const { poolId } = Route.useParams()

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['ranking', poolId],
    queryFn: async () => {
      const res = await fetch(`/api/pools/${poolId}/ranking`, { credentials: 'include' })
      if (!res.ok) throw new Error('Erro ao carregar ranking')
      return res.json() as Promise<{ ranking: RankingEntry[]; prizeTotal: number }>
    },
  })

  if (isPending) return <Loading />
  if (error) return <ErrorMessage message={error.message} onRetry={() => refetch()} />

  const ranking = data?.ranking ?? []
  const prizeTotal = data?.prizeTotal ?? 0

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">Classificacao</p>
        <h1 className="mt-1 font-display text-4xl font-black leading-[0.9] text-black">Ranking</h1>
        <div className="mt-3 h-1 w-12 bg-red" />
      </div>

      {prizeTotal > 0 && (
        <div className="border-2 border-green bg-green/5 p-5 text-center">
          <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted">Premio Total</p>
          <p className="font-display text-4xl font-black text-green">{formatCurrency(prizeTotal)}</p>
        </div>
      )}

      {ranking.length === 0 ? (
        <div className="border-2 border-dashed border-border py-12 text-center">
          <p className="font-display text-sm font-bold uppercase tracking-wider text-gray-muted">Sem resultados</p>
          <p className="mt-1 text-xs text-gray-muted">O ranking sera atualizado apos os jogos</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {ranking.map((entry) => (
            <div
              key={entry.userId}
              className={`flex items-center gap-4 border-b border-border py-4 ${entry.isCurrentUser ? 'bg-black/[0.03]' : ''}`}
            >
              <span className={`font-display text-3xl font-black min-w-[40px] ${
                entry.position === 1 ? 'text-red' : entry.position <= 3 ? 'text-black' : 'text-gray-light'
              }`}>
                {String(entry.position).padStart(2, '0')}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`font-display text-sm font-bold uppercase tracking-wide truncate ${entry.isCurrentUser ? 'text-red' : 'text-black'}`}>
                  {entry.name || 'Anonimo'}
                  {entry.isCurrentUser && ' (voce)'}
                </p>
                <p className="text-[10px] text-gray-muted">
                  {entry.exactMatches} placar{entry.exactMatches !== 1 ? 'es' : ''} exato{entry.exactMatches !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-2xl font-black text-black">{entry.totalPoints}</p>
                <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted">pts</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => refetch()}
        className="font-display text-xs font-bold uppercase tracking-wider text-gray-muted underline underline-offset-4 hover:text-black transition-colors cursor-pointer text-center"
      >
        Atualizar ranking
      </button>
    </div>
  )
}

export const Route = createFileRoute('/pools/$poolId/ranking')({
  component: RankingPage,
})
