import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useSession } from '../lib/auth'
import { Button } from '../components/ui/Button'
import { Loading } from '../components/ui/Loading'
import { PoolCard } from '../components/pool/PoolCard'
import type { PoolListItem } from '@manita/shared'

function HomePage() {
  const { data: session, isPending: sessionPending } = useSession()

  const { data: poolsData, isPending: poolsPending } = useQuery({
    queryKey: ['pools'],
    queryFn: async () => {
      const res = await fetch('/api/pools', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch pools')
      return res.json() as Promise<{ pools: PoolListItem[] }>
    },
    enabled: !!session,
  })

  if (sessionPending) return <Loading />

  if (!session) {
    return (
      <div className="flex min-h-[75vh] flex-col justify-center">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">Bolao</p>
          <h1 className="mt-1 font-display text-7xl font-black leading-[0.85] text-black">
            Copa<br />2026
          </h1>
          <div className="mt-4 h-1 w-16 bg-red" />
          <p className="mt-4 text-sm text-gray-dark leading-relaxed">
            Crie boloes, convide amigos e dispute o premio. O 1o lugar leva tudo.
          </p>
        </div>
        <Link to="/login" className="mt-8">
          <Button size="lg" className="w-full">Entrar</Button>
        </Link>
      </div>
    )
  }

  const pools = poolsData?.pools ?? []

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">Ola, {session.user.name || 'Jogador'}</p>
        <h1 className="mt-1 font-display text-5xl font-black leading-[0.85] text-black">
          Copa<br />2026
        </h1>
        <div className="mt-3 h-1 w-12 bg-red" />
      </div>

      <div className="grid grid-cols-5 gap-3">
        <Link to="/pools/create" className="col-span-3">
          <Button size="lg" className="w-full h-full min-h-[72px]">Criar Bolao</Button>
        </Link>
        <div className="col-span-2">
          <Button variant="secondary" size="lg" className="w-full h-full min-h-[72px]" disabled>
            Entrar
          </Button>
        </div>
      </div>

      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">Meus Boloes</h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        {poolsPending ? (
          <Loading message="Carregando..." />
        ) : pools.length > 0 ? (
          <div className="flex flex-col gap-3">
            {pools.map((pool, i) => (
              <PoolCard key={pool.id} pool={pool} index={i + 1} />
            ))}
          </div>
        ) : (
          <div className="border-2 border-dashed border-border py-10 text-center">
            <p className="font-display text-sm font-bold uppercase tracking-wider text-gray-muted">Nenhum bolao</p>
            <p className="mt-1 text-xs text-gray-muted">Crie um ou entre pelo convite de um amigo</p>
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">Proximos Jogos</h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="border-2 border-dashed border-border py-10 text-center">
          <p className="font-display text-sm font-bold uppercase tracking-wider text-gray-muted">Em breve</p>
          <p className="mt-1 text-xs text-gray-muted">Jogos da Copa 2026</p>
        </div>
      </section>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: HomePage,
})
