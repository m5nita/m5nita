import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSession } from '../lib/auth'
import { Button } from '../components/ui/Button'
import { Loading } from '../components/ui/Loading'
import { PoolCard } from '../components/pool/PoolCard'
import { MatchCard } from '../components/match/MatchCard'
import type { PoolListItem, Match } from '@manita/shared'

function HomePage() {
  const { data: session, isPending: sessionPending } = useSession()
  const navigate = useNavigate()
  const [inviteCode, setInviteCode] = useState('')

  const { data: poolsData, isPending: poolsPending } = useQuery({
    queryKey: ['pools'],
    queryFn: async () => {
      const res = await fetch('/api/pools', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch pools')
      return res.json() as Promise<{ pools: PoolListItem[] }>
    },
    enabled: !!session,
  })

  const { data: matchesData } = useQuery({
    queryKey: ['matches', 'upcoming'],
    queryFn: async () => {
      const res = await fetch('/api/matches?status=scheduled', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch matches')
      return res.json() as Promise<{ matches: Match[] }>
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
  const upcomingMatches = (matchesData?.matches ?? []).slice(0, 4)

  function handleJoinByCode() {
    const code = inviteCode.trim().toUpperCase()
    if (!code) return
    navigate({ to: '/invite/$inviteCode', params: { inviteCode: code } })
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">Ola, {session.user.name || 'Jogador'}</p>
        <h1 className="mt-1 font-display text-5xl font-black leading-[0.85] text-black">
          Copa<br />2026
        </h1>
        <div className="mt-3 h-1 w-12 bg-red" />
      </div>

      <div className="flex gap-3">
        <Link to="/pools/create" className="shrink-0">
          <Button size="lg" className="h-full min-h-[48px]">Criar Bolao</Button>
        </Link>
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => { e.preventDefault(); handleJoinByCode() }}
        >
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            placeholder="CODIGO"
            className="flex-1 min-w-0 border-2 border-border bg-transparent px-3 font-display text-xs font-bold uppercase tracking-wider text-black placeholder:text-gray-muted transition-colors focus:border-black focus:outline-none"
          />
          <Button type="submit" variant="secondary" size="lg" className="min-h-[48px] shrink-0" disabled={!inviteCode.trim()}>
            Entrar
          </Button>
        </form>
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
        {upcomingMatches.length > 0 ? (
          <div className="flex flex-col">
            {upcomingMatches.map((m) => <MatchCard key={m.id} match={m} />)}
            <Link to="/matches" className="mt-2 text-center font-display text-[11px] font-bold uppercase tracking-widest text-gray-muted hover:text-black transition-colors">
              Ver todos
            </Link>
          </div>
        ) : (
          <div className="border-2 border-dashed border-border py-10 text-center">
            <p className="font-display text-sm font-bold uppercase tracking-wider text-gray-muted">Em breve</p>
            <p className="mt-1 text-xs text-gray-muted">Jogos da Copa 2026</p>
          </div>
        )}
      </section>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: HomePage,
})
