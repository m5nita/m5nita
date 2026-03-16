import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useSession } from '../../../lib/auth'
import { formatCurrency } from '../../../lib/utils'
import { Button } from '../../../components/ui/Button'
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
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">Bolao</p>
        <h1 className="mt-1 font-display text-4xl font-black leading-[0.9] text-black">{pool.name}</h1>
        <div className="mt-3 h-1 w-12 bg-red" />
        <p className="mt-3 text-sm text-gray-dark">
          Criado por {pool.owner?.name || 'Anonimo'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-px bg-border">
        <div className="bg-cream py-4 text-center">
          <p className="font-display text-2xl font-black text-black">{pool.memberCount}</p>
          <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted">Jogadores</p>
        </div>
        <div className="bg-cream py-4 text-center">
          <p className="font-display text-2xl font-black text-black">{formatCurrency(pool.entryFee)}</p>
          <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted">Entrada</p>
        </div>
        <div className="bg-cream py-4 text-center">
          <p className="font-display text-2xl font-black text-green">{formatCurrency(pool.prizeTotal)}</p>
          <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted">Premio</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Link to="/pools/$poolId/predictions" params={{ poolId }}>
          <Button className="w-full" size="lg">Palpites</Button>
        </Link>
        <Link to="/pools/$poolId/ranking" params={{ poolId }}>
          <Button variant="secondary" className="w-full" size="lg">Ranking</Button>
        </Link>
        {isOwner && (
          <Link to="/pools/$poolId/manage" params={{ poolId }}>
            <Button variant="ghost" className="w-full">Gerenciar</Button>
          </Link>
        )}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/pools/$poolId/')({
  component: PoolDetailPage,
})
