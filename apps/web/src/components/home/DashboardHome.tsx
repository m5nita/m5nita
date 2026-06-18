import type { Match, PoolListItem } from '@m5nita/shared'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { apiFetch } from '../../lib/api'
import { useSession } from '../../lib/auth'
import { livePollMs } from '../../lib/poll'
import { MatchCard } from '../match/MatchCard'
import { PoolCard } from '../pool/PoolCard'
import { Button } from '../ui/Button'
import { ErrorMessage } from '../ui/ErrorMessage'
import { MatchCardSkeleton, PoolCardSkeleton } from '../ui/Skeleton'
import { PendingPrizesSection } from './PendingPrizesSection'
import { PoolsSection } from './PoolsSection'

// Finished pools are the expensive part of the list query and most users only
// want the active ones — fetch them lazily, only once the section is expanded.
function FinishedPoolsSection() {
  const [showFinished, setShowFinished] = useState(false)
  const {
    data: finishedData,
    isPending: finishedPending,
    isError: finishedError,
    refetch: refetchFinished,
  } = useQuery({
    queryKey: ['pools', 'closed'],
    queryFn: async () => {
      const res = await apiFetch('/api/pools?status=closed')
      if (!res.ok) throw new Error('Failed to fetch finished pools')
      return res.json() as Promise<{ pools: PoolListItem[] }>
    },
    enabled: showFinished,
  })
  const finishedPools = finishedData?.pools ?? []

  return (
    <section>
      <button
        type="button"
        onClick={() => setShowFinished((v) => !v)}
        aria-expanded={showFinished}
        className="flex w-full items-center gap-3 cursor-pointer transition-opacity active:opacity-60"
      >
        <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
          Finalizados
        </h2>
        <div className="h-px flex-1 bg-border" />
        <span
          className="font-display text-[10px] font-bold uppercase tracking-widest text-gray-muted"
          aria-hidden="true"
        >
          {showFinished ? '▴' : '▾'}
        </span>
      </button>
      {showFinished &&
        (finishedPending ? (
          <div className="mt-4 flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-5">
            {['s1', 's2', 's3'].map((k) => (
              <PoolCardSkeleton key={k} />
            ))}
          </div>
        ) : finishedError ? (
          <div className="mt-4">
            <ErrorMessage
              message="Não foi possível carregar os bolões finalizados."
              onRetry={() => refetchFinished()}
            />
          </div>
        ) : finishedPools.length > 0 ? (
          <div className="mt-4 flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-5">
            {finishedPools.map((pool, i) => (
              <PoolCard key={pool.id} pool={pool} index={i + 1} />
            ))}
          </div>
        ) : (
          <p className="mt-4 py-6 text-center font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
            Nenhum bolão finalizado
          </p>
        ))}
    </section>
  )
}

function UpcomingMatchesSection() {
  const {
    data: matchesData,
    isPending: matchesPending,
    isError: matchesError,
    refetch: refetchMatches,
  } = useQuery({
    queryKey: ['matches', 'upcoming'],
    queryFn: async () => {
      // Upcoming + live (in-progress) games; live ones sort first since their
      // matchDate is earlier. Only 4 are rendered (.slice below) — let the
      // server cap the payload.
      const res = await apiFetch('/api/matches?status=scheduled,live&featured=true&limit=4')
      if (!res.ok) throw new Error('Failed to fetch matches')
      return res.json() as Promise<{ matches: Match[] }>
    },
    // Refresh live scores while a match is in progress, then go quiet — same
    // conditional-polling pattern as the pools query below.
    refetchInterval: (query) => {
      const matches = query.state.data?.matches
      return matches?.some((m) => m.status === 'live') ? livePollMs() : false
    },
  })
  const upcomingMatches = (matchesData?.matches ?? []).slice(0, 4)

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
          Próximos Jogos
        </h2>
        <div className="h-px flex-1 bg-border" />
      </div>
      {matchesPending ? (
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-4 lg:gap-4">
          <MatchCardSkeleton />
          <MatchCardSkeleton />
          <MatchCardSkeleton />
          <MatchCardSkeleton />
        </div>
      ) : matchesError ? (
        <ErrorMessage
          message="Não foi possível carregar os próximos jogos."
          onRetry={() => refetchMatches()}
        />
      ) : upcomingMatches.length > 0 ? (
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
  )
}

export function DashboardHome() {
  const { data: session } = useSession()
  const navigate = useNavigate()
  const [inviteCode, setInviteCode] = useState('')

  const {
    data: poolsData,
    isPending: poolsPending,
    isError: poolsError,
    refetch: refetchPools,
  } = useQuery({
    queryKey: ['pools', 'active'],
    queryFn: async () => {
      const res = await apiFetch('/api/pools')
      if (!res.ok) throw new Error('Failed to fetch pools')
      return res.json() as Promise<{ pools: PoolListItem[] }>
    },
    refetchInterval: (query) => {
      const pools = query.state.data?.pools
      return pools?.some((p) => p.hasLiveMatch) ? livePollMs() : false
    },
  })

  const activePools = poolsData?.pools ?? []

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
        <PoolsSection
          isPending={poolsPending}
          isError={poolsError}
          isEmpty={activePools.length === 0}
          onRetry={() => refetchPools()}
        >
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-5">
            {activePools.map((pool, i) => (
              <PoolCard key={pool.id} pool={pool} index={i + 1} />
            ))}
          </div>
        </PoolsSection>
      </section>

      <FinishedPoolsSection />

      <UpcomingMatchesSection />
    </div>
  )
}
