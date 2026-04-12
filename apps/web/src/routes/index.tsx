import type { Match, PoolListItem } from '@m5nita/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { MatchCard } from '../components/match/MatchCard'
import { PoolCard } from '../components/pool/PoolCard'
import { Button } from '../components/ui/Button'
import { Loading } from '../components/ui/Loading'
import { apiFetch } from '../lib/api'
import { useSession } from '../lib/auth'

function HomePage() {
  const { data: session, isPending: sessionPending } = useSession()
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
    enabled: !!session,
  })

  const { data: matchesData } = useQuery({
    queryKey: ['matches', 'upcoming'],
    queryFn: async () => {
      const res = await apiFetch('/api/matches?status=scheduled&featured=true')
      if (!res.ok) throw new Error('Failed to fetch matches')
      return res.json() as Promise<{ matches: Match[] }>
    },
    enabled: !!session,
  })

  if (sessionPending) return <Loading />

  if (!session) {
    return (
      <div className="flex min-h-[75vh] flex-col justify-center lg:items-center">
        <div className="text-center mb-8">
          <h1 className="font-display text-6xl font-black leading-tight text-black lg:text-8xl">
            Monte seu
            <br />
            bolão.
          </h1>
          <div className="mt-4 h-1 w-10 bg-red mx-auto" />
          <p className="mt-4 text-sm text-gray-dark leading-relaxed">
            Palpites, ranking e prêmio. Simples assim!
          </p>
        </div>

        <div className="flex flex-col mb-7 lg:max-w-[600px] lg:mx-auto lg:w-full">
          <div className="flex gap-3 items-start py-4 border-b border-border">
            <div className="w-8 h-8 bg-black text-white flex items-center justify-center font-display text-sm font-black shrink-0">
              1
            </div>
            <div>
              <p className="font-display text-sm font-bold uppercase tracking-wider text-black">
                Crie um bolão
              </p>
              <p className="text-xs text-gray-dark mt-0.5">
                Escolha a competição e defina o valor da entrada
              </p>
            </div>
          </div>
          <div className="flex gap-3 items-start py-4 border-b border-border">
            <div className="w-8 h-8 bg-black text-white flex items-center justify-center font-display text-sm font-black shrink-0">
              2
            </div>
            <div>
              <p className="font-display text-sm font-bold uppercase tracking-wider text-black">
                Convide amigos
              </p>
              <p className="text-xs text-gray-dark mt-0.5">
                Compartilhe o código do bolão com a galera
              </p>
            </div>
          </div>
          <div className="flex gap-3 items-start py-4 border-b border-border">
            <div className="w-8 h-8 bg-black text-white flex items-center justify-center font-display text-sm font-black shrink-0">
              3
            </div>
            <div>
              <p className="font-display text-sm font-bold uppercase tracking-wider text-black">
                Faça seus palpites
              </p>
              <p className="text-xs text-gray-dark mt-0.5">
                Aposte nos resultados antes dos jogos começarem
              </p>
            </div>
          </div>
          <div className="flex gap-3 items-start py-4">
            <div className="w-8 h-8 bg-red text-white flex items-center justify-center font-display text-sm font-black shrink-0">
              4
            </div>
            <div>
              <p className="font-display text-sm font-bold uppercase tracking-wider text-black">
                Leve o prêmio
              </p>
              <p className="text-xs text-gray-dark mt-0.5">
                1º lugar leva tudo. Saque direto via Pix.
              </p>
            </div>
          </div>
        </div>

        <Link to="/login" className="lg:max-w-[600px] lg:mx-auto lg:w-full">
          <Button size="lg" className="w-full">
            Começar agora
          </Button>
        </Link>
      </div>
    )
  }

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
          Olá, {session.user.name || 'Jogador'}
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

export const Route = createFileRoute('/')({
  component: HomePage,
})
