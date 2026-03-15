import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { MatchCard } from '../components/match/MatchCard'
import { Loading } from '../components/ui/Loading'
import { ErrorMessage } from '../components/ui/ErrorMessage'
import { MATCH } from '@manita/shared'
import type { Match } from '@manita/shared'

const stageLabels: Record<string, string> = {
  all: 'Todos',
  group: 'Grupos',
  'round-of-32': '32-avos',
  'round-of-16': 'Oitavas',
  quarter: 'Quartas',
  semi: 'Semi',
  'third-place': '3o Lugar',
  final: 'Final',
}

function MatchesPage() {
  const [activeStage, setActiveStage] = useState('all')
  const [activeGroup, setActiveGroup] = useState<string | null>(null)

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['matches'],
    queryFn: async () => {
      const res = await fetch('/api/matches', { credentials: 'include' })
      if (!res.ok) throw new Error('Erro ao carregar jogos')
      return res.json() as Promise<{ matches: Match[] }>
    },
    refetchInterval: (query) => {
      const matches = query.state.data?.matches
      return matches?.some((m) => m.status === 'live') ? 30_000 : false
    },
  })

  if (isPending) return <Loading message="Carregando jogos..." />
  if (error) return <ErrorMessage message={error.message} onRetry={() => refetch()} />

  const allMatches = data?.matches ?? []

  let filtered = allMatches
  if (activeStage !== 'all') {
    filtered = filtered.filter((m) => m.stage === activeStage)
  }
  if (activeGroup && activeStage === 'group') {
    filtered = filtered.filter((m) => m.group === activeGroup)
  }

  const hasLive = allMatches.some((m) => m.status === 'live')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-navy">Jogos</h1>
        {hasLive && (
          <span className="flex items-center gap-1.5 rounded-full bg-red/10 px-3 py-1 text-xs font-bold text-red">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red" aria-hidden="true" />
            AO VIVO
          </span>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Filtro por fase">
        {['all', ...MATCH.STAGES].map((stage) => (
          <button
            key={stage}
            type="button"
            role="tab"
            aria-selected={activeStage === stage}
            onClick={() => { setActiveStage(stage); setActiveGroup(null) }}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeStage === stage
                ? 'bg-navy text-cream'
                : 'text-gray-dark hover:bg-navy/5'
            }`}
          >
            {stageLabels[stage] ?? stage}
          </button>
        ))}
      </div>

      {activeStage === 'group' && (
        <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Filtro por grupo">
          <button
            type="button"
            role="tab"
            aria-selected={!activeGroup}
            onClick={() => setActiveGroup(null)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
              !activeGroup ? 'bg-navy text-cream' : 'text-gray-dark hover:bg-navy/5'
            }`}
          >
            Todos
          </button>
          {MATCH.GROUPS.map((g) => (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={activeGroup === g}
              onClick={() => setActiveGroup(g)}
              className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                activeGroup === g ? 'bg-navy text-cream' : 'text-gray-dark hover:bg-navy/5'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-gray-dark">Nenhum jogo encontrado.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      )}
    </div>
  )
}

export const Route = createFileRoute('/matches')({
  component: MatchesPage,
})
