import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useSession } from '../../../lib/auth'
import { formatCurrency } from '../../../lib/utils'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Loading } from '../../../components/ui/Loading'
import { ErrorMessage } from '../../../components/ui/ErrorMessage'

function PoolDetailPage() {
  const { poolId } = Route.useParams()
  const { data: session } = useSession()

  const { data: pool, isPending, error } = useQuery({
    queryKey: ['pool', poolId],
    queryFn: async () => {
      const res = await fetch(`/api/pools/${poolId}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Bolao nao encontrado')
      return res.json()
    },
  })

  if (isPending) return <Loading />
  if (error) return <ErrorMessage message={error.message} />
  if (!pool) return null

  const isOwner = session?.user?.id === pool.ownerId

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-navy">{pool.name}</h1>
        <p className="text-sm text-gray-dark">
          {pool.memberCount} participante{pool.memberCount !== 1 ? 's' : ''} · Criado por {pool.owner?.name || 'Anonimo'}
        </p>
      </div>

      <Card padding="lg">
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-dark">Entrada</span>
            <span className="font-medium text-navy">{formatCurrency(pool.entryFee)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-dark">Participantes</span>
            <span className="font-medium text-navy">{pool.memberCount}</span>
          </div>
          <div className="border-t border-navy/10 pt-2 flex justify-between">
            <span className="font-medium text-navy">Premio total</span>
            <span className="font-heading text-xl font-bold text-green">
              {formatCurrency(pool.prizeTotal)}
            </span>
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        <Link to="/pools/$poolId/predictions" params={{ poolId }}>
          <Button className="w-full" size="lg">Palpites</Button>
        </Link>
        <Link to="/pools/$poolId/ranking" params={{ poolId }}>
          <Button variant="secondary" className="w-full" size="lg">Ranking</Button>
        </Link>
        {isOwner && (
          <Link to="/pools/$poolId/manage" params={{ poolId }}>
            <Button variant="ghost" className="w-full">Gerenciar bolao</Button>
          </Link>
        )}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/pools/$poolId/')({
  component: PoolDetailPage,
})
