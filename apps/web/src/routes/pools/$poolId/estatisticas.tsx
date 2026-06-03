import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { PoolHub } from '../../../components/pool/PoolHub'
import { StatsPanel } from '../../../components/pool/stats/StatsPanel'
import { StatsPaywall } from '../../../components/pool/stats/StatsPaywall'
import type { StatsResponse } from '../../../components/pool/stats/types'
import { ErrorMessage } from '../../../components/ui/ErrorMessage'
import { Loading } from '../../../components/ui/Loading'
import { apiFetch } from '../../../lib/api'

function StatisticsContent({ poolId }: { poolId: string }) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['stats', poolId],
    queryFn: async (): Promise<StatsResponse> => {
      const res = await apiFetch(`/api/pools/${poolId}/stats`)
      if (!res.ok) throw new Error('Erro ao carregar estatísticas')
      return res.json()
    },
    // Intentionally OFF the 30s live-poll path: stats only change when a match
    // finishes. TanStack's refetch-on-focus (default) is enough.
  })

  if (isPending) return <Loading />
  if (error) return <ErrorMessage message={(error as Error).message} onRetry={() => refetch()} />
  if (!data) return null

  if (!data.unlocked) {
    return (
      <StatsPaywall
        poolId={poolId}
        price={data.price}
        teaser={data.teaser}
        onUnlocked={() => refetch()}
      />
    )
  }

  return (
    <StatsPanel
      poolId={poolId}
      blocks={data.blocks}
      pendingImpact={data.pendingImpact}
      suggestions={data.suggestions}
    />
  )
}

function StatisticsPage() {
  const { poolId } = Route.useParams()
  return (
    <PoolHub poolId={poolId} activeTab="statistics">
      {() => <StatisticsContent poolId={poolId} />}
    </PoolHub>
  )
}

export const Route = createFileRoute('/pools/$poolId/estatisticas')({
  component: StatisticsPage,
})
