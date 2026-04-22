import type { PoolDetail, RankingEntry } from '@m5nita/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { PoolHub } from '../../../components/pool/PoolHub'
import { PrizeWithdrawal } from '../../../components/pool/PrizeWithdrawal'
import { ErrorMessage } from '../../../components/ui/ErrorMessage'
import { Loading } from '../../../components/ui/Loading'
import { apiFetch } from '../../../lib/api'

function positionColor(position: number): string {
  if (position === 1) return 'text-red'
  if (position <= 3) return 'text-black'
  return 'text-gray-light'
}

function RankingContent({ pool, poolId }: { pool: PoolDetail; poolId: string }) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['ranking', poolId],
    queryFn: async () => {
      const res = await apiFetch(`/api/pools/${poolId}/ranking`)
      if (!res.ok) throw new Error('Erro ao carregar ranking')
      return res.json() as Promise<{
        ranking: RankingEntry[]
        prizeTotal: number
        hasLiveMatch: boolean
      }>
    },
    refetchInterval: (query) => (query.state.data?.hasLiveMatch ? 30_000 : false),
  })

  if (isPending) return <Loading />
  if (error) return <ErrorMessage message={(error as Error).message} onRetry={() => refetch()} />

  const ranking = data?.ranking ?? []

  return (
    <div className="flex flex-col gap-8">
      {pool.status === 'closed' && <PrizeWithdrawal poolId={poolId} />}

      {ranking.length === 0 ? (
        <div className="border-2 border-dashed border-border py-12 text-center">
          <p className="font-display text-sm font-bold uppercase tracking-wider text-gray-muted">
            Sem resultados
          </p>
          <p className="mt-1 text-xs text-gray-muted">O ranking será atualizado após os jogos</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {ranking.map((entry) => (
            <div
              key={entry.userId}
              className={`flex items-center gap-4 border-b border-border py-4 px-3 ${entry.isCurrentUser ? 'bg-black/[0.03]' : ''}`}
            >
              <span
                className={`font-display text-3xl font-black min-w-[40px] ${positionColor(entry.position)}`}
              >
                {String(entry.position).padStart(2, '0')}
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className={`font-display text-sm font-bold uppercase tracking-wide truncate ${entry.isCurrentUser ? 'text-red' : 'text-black'}`}
                >
                  {entry.name || 'Anônimo'}
                  {entry.isCurrentUser && ' (você)'}
                </p>
                <p className="text-[10px] text-gray-muted">
                  {entry.exactMatches} placar{entry.exactMatches !== 1 ? 'es' : ''} exato
                  {entry.exactMatches !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-2xl font-black text-black">{entry.totalPoints}</p>
                <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted">
                  pts
                </p>
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

function RankingPage() {
  const { poolId } = Route.useParams()
  return (
    <PoolHub poolId={poolId} activeTab="ranking">
      {(pool) => <RankingContent pool={pool} poolId={poolId} />}
    </PoolHub>
  )
}

export const Route = createFileRoute('/pools/$poolId/ranking')({
  component: RankingPage,
})
