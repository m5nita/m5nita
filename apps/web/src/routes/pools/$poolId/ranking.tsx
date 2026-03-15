import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { formatCurrency } from '../../../lib/utils'
import { Loading } from '../../../components/ui/Loading'
import { ErrorMessage } from '../../../components/ui/ErrorMessage'
import { Card } from '../../../components/ui/Card'
import type { RankingEntry } from '@manita/shared'

function RankingPage() {
  const { poolId } = Route.useParams()

  const {
    data,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['ranking', poolId],
    queryFn: async () => {
      const res = await fetch(`/api/pools/${poolId}/ranking`, { credentials: 'include' })
      if (!res.ok) throw new Error('Erro ao carregar ranking')
      return res.json() as Promise<{ ranking: RankingEntry[]; prizeTotal: number }>
    },
  })

  if (isPending) return <Loading message="Carregando ranking..." />
  if (error) return <ErrorMessage message={error.message} onRetry={() => refetch()} />

  const ranking = data?.ranking ?? []
  const prizeTotal = data?.prizeTotal ?? 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-navy">Ranking</h1>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-sm text-gray-dark underline hover:text-navy"
          aria-label="Atualizar ranking"
        >
          Atualizar
        </button>
      </div>

      {prizeTotal > 0 && (
        <Card className="bg-green/5 text-center">
          <p className="text-sm text-gray-dark">Premio total</p>
          <p className="font-heading text-3xl font-bold text-green">
            {formatCurrency(prizeTotal)}
          </p>
        </Card>
      )}

      {ranking.length === 0 ? (
        <Card className="py-8 text-center">
          <p className="text-gray-dark">Nenhum resultado ainda.</p>
          <p className="text-sm text-gray">O ranking sera atualizado apos os jogos.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {ranking.map((entry) => (
            <div
              key={entry.userId}
              className={`flex items-center gap-3 rounded-xl border p-3 ${
                entry.isCurrentUser
                  ? 'border-navy bg-navy/5'
                  : 'border-navy/10 bg-white'
              } ${entry.position === 1 ? 'ring-2 ring-green/30' : ''}`}
            >
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-heading text-sm font-bold ${
                entry.position === 1
                  ? 'bg-green text-cream'
                  : entry.position <= 3
                    ? 'bg-navy/10 text-navy'
                    : 'bg-navy/5 text-gray-dark'
              }`}>
                {entry.position}
              </div>

              <div className="flex-1 min-w-0">
                <p className={`truncate text-sm font-medium ${entry.isCurrentUser ? 'text-navy font-bold' : 'text-navy'}`}>
                  {entry.name || 'Anonimo'}
                  {entry.isCurrentUser && ' (voce)'}
                </p>
                <p className="text-xs text-gray">
                  {entry.exactMatches} placar{entry.exactMatches !== 1 ? 'es' : ''} exato{entry.exactMatches !== 1 ? 's' : ''}
                </p>
              </div>

              <div className="text-right">
                <p className="font-heading text-lg font-bold text-navy">
                  {entry.totalPoints}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-gray">pts</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export const Route = createFileRoute('/pools/$poolId/ranking')({
  component: RankingPage,
})
