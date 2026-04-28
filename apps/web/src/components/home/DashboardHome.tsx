import type { Match, PoolListItem } from '@m5nita/shared'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { apiFetch } from '../../lib/api'
import { useSession } from '../../lib/auth'
import { MatchCard } from '../match/MatchCard'
import { PoolCard } from '../pool/PoolCard'
import { Button } from '../ui/Button'
import { Loading } from '../ui/Loading'
import { PendingPrizesSection } from './PendingPrizesSection'

export function DashboardHome() {
  const { data: session } = useSession()
  const navigate = useNavigate()
  const [inviteCode, setInviteCode] = useState('')
  const [showFinished, setShowFinished] = useState(false)

  const { data: poolsData, isPending: poolsPending } = useQuery({
    queryKey: ['pools'],
    queryFn: async () => {
      const res = await apiFetch('/api/pools')
      if (!res.ok) throw new Error('Failed to fetch pools')
      return res.json() as Promise<{ pools: PoolListItem[] }>
    },
    refetchInterval: (query) => {
      const pools = query.state.data?.pools
      return pools?.some((p) => p.hasLiveMatch) ? 30_000 : false
    },
  })

  const { data: matchesData } = useQuery({
    queryKey: ['matches', 'upcoming'],
    queryFn: async () => {
      const res = await apiFetch('/api/matches?status=scheduled&featured=true')
      if (!res.ok) throw new Error('Failed to fetch matches')
      return res.json() as Promise<{ matches: Match[] }>
    },
  })

  const allPools = poolsData?.pools ?? []
  const activePools = allPools.filter((p) => p.status === 'active')
  const finishedPools = allPools.filter((p) => p.status === 'closed')
  const upcomingMatches = (matchesData?.matches ?? []).slice(0, 4)

  function handleJoinByCode() {
    const code = inviteCode.trim().toUpperCase()
    if (!code) return
    navigate({ to: '/invite/$inviteCode', params: { inviteCode: code } })
  }

  return (
    <div className="flex flex-col gap-8 lg:gap-12">
      <div className="lg:text-center">
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">
          Olá, {session?.user?.name || 'Jogador'}
        </p>
        <h1 className="mt-2 font-display text-5xl font-black leading-[0.85] text-black lg:mt-3 lg:text-6xl">
          Bolões
        </h1>
        <div className="mt-3 h-1 w-12 bg-red lg:mx-auto" />
      </div>

      <div className="flex flex-wrap gap-3 lg:justify-center">
        <Link to="/pools/create" className="shrink-0">
          <Button size="lg" className="h-full min-h-[48px]">
            Criar Bolão
          </Button>
        </Link>
        <form
          className="flex min-w-[180px] flex-1 gap-2 lg:flex-initial lg:min-w-[300px]"
          onSubmit={(e) => {
            e.preventDefault()
            handleJoinByCode()
          }}
        >
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            placeholder="CÓDIGO"
            className="flex-1 min-w-0 border-2 border-border bg-transparent px-3 font-display text-xs font-bold uppercase tracking-wider text-black placeholder:text-gray-muted transition-colors focus:border-black focus:outline-none"
          />
          <Button
            type="submit"
            variant="secondary"
            size="lg"
            className="min-h-[48px] shrink-0"
            disabled={!inviteCode.trim()}
          >
            Entrar
          </Button>
        </form>
      </div>

      <PendingPrizesSection />

      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
            Meus Bolões
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        {poolsPending ? (
          <Loading message="Carregando..." />
        ) : activePools.length > 0 ? (
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-5">
            {activePools.map((pool, i) => (
              <PoolCard key={pool.id} pool={pool} index={i + 1} />
            ))}
          </div>
        ) : (
          <div className="border-2 border-dashed border-border py-10 text-center">
            <p className="font-display text-sm font-bold uppercase tracking-wider text-gray-muted">
              Nenhum bolão
            </p>
            <p className="mt-1 text-xs text-gray-muted">
              Crie um ou entre pelo convite de um amigo
            </p>
          </div>
        )}
      </section>

      {finishedPools.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowFinished((v) => !v)}
            aria-expanded={showFinished}
            className="flex w-full items-center gap-3 cursor-pointer"
          >
            <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
              Finalizados ({finishedPools.length})
            </h2>
            <div className="h-px flex-1 bg-border" />
            <span
              className="font-display text-[10px] font-bold uppercase tracking-widest text-gray-muted"
              aria-hidden="true"
            >
              {showFinished ? '▴' : '▾'}
            </span>
          </button>
          {showFinished && (
            <div className="mt-4 flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-5">
              {finishedPools.map((pool, i) => (
                <PoolCard key={pool.id} pool={pool} index={i + 1} />
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
            Próximos Jogos
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        {upcomingMatches.length > 0 ? (
          <>
            <div className="flex flex-col lg:grid lg:grid-cols-4 lg:gap-4">
              {upcomingMatches.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </div>
            <Link
              to="/matches"
              className="mt-3 block text-center font-display text-[11px] font-bold uppercase tracking-widest text-gray-muted hover:text-black transition-colors"
            >
              Ver todos →
            </Link>
          </>
        ) : (
          <div className="border-2 border-dashed border-border py-10 text-center">
            <p className="font-display text-sm font-bold uppercase tracking-wider text-gray-muted">
              Em breve
            </p>
            <p className="mt-1 text-xs text-gray-muted">Jogos serão exibidos aqui</p>
          </div>
        )}
      </section>
    </div>
  )
}
