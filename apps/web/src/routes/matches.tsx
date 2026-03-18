import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { MatchCard } from '../components/match/MatchCard'
import { Loading } from '../components/ui/Loading'
import { ErrorMessage } from '../components/ui/ErrorMessage'
import { apiFetch } from '../lib/api'
import { MATCH } from '@m5nita/shared'
import type { Match } from '@m5nita/shared'

const stageLabels: Record<string, string> = {
  all: 'Todos', group: 'Grupos', 'round-of-32': '32-avos', 'round-of-16': 'Oitavas',
  quarter: 'Quartas', semi: 'Semi', 'third-place': '3º Lugar', final: 'Final',
}

function MatchesPage() {
  const [activeStage, setActiveStage] = useState('all')
  const [activeGroup, setActiveGroup] = useState<string | null>(null)

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['matches'],
    queryFn: async () => {
      const res = await apiFetch('/api/matches')
      if (!res.ok) throw new Error('Erro ao carregar jogos')
      return res.json() as Promise<{ matches: Match[] }>
    },
    refetchInterval: (query) => {
      const matches = query.state.data?.matches
      return matches?.some((m) => m.status === 'live') ? 30_000 : false
    },
  })

  if (isPending) return <Loading />
  if (error) return <ErrorMessage message={error.message} onRetry={() => refetch()} />

  const allMatches = data?.matches ?? []
  let filtered = allMatches
  if (activeStage !== 'all') filtered = filtered.filter((m) => m.stage === activeStage)
  if (activeGroup && activeStage === 'group') filtered = filtered.filter((m) => m.group === activeGroup)
  const hasLive = allMatches.some((m) => m.status === 'live')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-3">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">Calendário</p>
            <h1 className="mt-1 font-display text-4xl font-black leading-[0.9] text-black">Jogos</h1>
          </div>
          {hasLive && (
            <span className="ml-auto flex items-center gap-1.5 bg-red px-3 py-1 font-display text-[10px] font-bold uppercase tracking-widest text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden="true" />
              Ao Vivo
            </span>
          )}
        </div>
        <div className="mt-3 h-1 w-12 bg-red" />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-5 px-5" role="tablist">
        {['all', ...MATCH.STAGES].map((stage) => (
          <button
            key={stage}
            type="button"
            role="tab"
            aria-selected={activeStage === stage}
            onClick={() => { setActiveStage(stage); setActiveGroup(null) }}
            className={`shrink-0 font-display text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 transition-colors cursor-pointer ${
              activeStage === stage ? 'bg-black text-white' : 'text-gray-muted hover:text-black'
            }`}
          >
            {stageLabels[stage] ?? stage}
          </button>
        ))}
      </div>

      {activeStage === 'group' && (
        <div className="flex gap-1 overflow-x-auto -mx-5 px-5" role="tablist">
          <button type="button" role="tab" aria-selected={!activeGroup} onClick={() => setActiveGroup(null)}
            className={`shrink-0 font-display text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 cursor-pointer ${!activeGroup ? 'bg-black text-white' : 'text-gray-muted hover:text-black'}`}>
            Todos
          </button>
          {MATCH.GROUPS.map((g) => (
            <button key={g} type="button" role="tab" aria-selected={activeGroup === g} onClick={() => setActiveGroup(g)}
              className={`shrink-0 font-display text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 cursor-pointer ${activeGroup === g ? 'bg-black text-white' : 'text-gray-muted hover:text-black'}`}>
              {g}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="border-2 border-dashed border-border py-12 text-center">
          <p className="font-display text-sm font-bold uppercase tracking-wider text-gray-muted">Nenhum jogo</p>
        </div>
      ) : activeStage === 'group' ? (
        (() => {
          const byMatchday = new Map<number, Match[]>()
          for (const m of filtered) {
            const md = m.matchday ?? 0
            if (!byMatchday.has(md)) byMatchday.set(md, [])
            byMatchday.get(md)!.push(m)
          }
          const sortedMatchdays = [...byMatchday.entries()].sort(([a], [b]) => a - b)
          return (
            <div className="flex flex-col gap-6">
              {sortedMatchdays.map(([matchday, matches]) => (
                <div key={matchday}>
                  <p className="mb-2 font-display text-[11px] font-bold uppercase tracking-widest text-gray-muted">
                    {matchday > 0 ? `${matchday}a Rodada` : 'Rodada'}
                  </p>
                  <div className="flex flex-col">
                    {matches.map((m) => <MatchCard key={m.id} match={m} />)}
                  </div>
                </div>
              ))}
            </div>
          )
        })()
      ) : (
        <div className="flex flex-col">
          {filtered.map((m) => <MatchCard key={m.id} match={m} />)}
        </div>
      )}
    </div>
  )
}

export const Route = createFileRoute('/matches')({ component: MatchesPage })
