import type { CompetitionListItem, Match } from '@m5nita/shared'
import { MATCH } from '@m5nita/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { MatchCard } from '../components/match/MatchCard'
import { ErrorMessage } from '../components/ui/ErrorMessage'
import { Loading } from '../components/ui/Loading'
import { apiFetch } from '../lib/api'
import { requireAuthGuard } from '../lib/authGuard'

const stageLabels: Record<string, string> = {
  all: 'Todos',
  group: 'Grupos',
  'round-of-32': '32-avos',
  'round-of-16': 'Oitavas',
  quarter: 'Quartas',
  semi: 'Semi',
  'third-place': '3º Lugar',
  final: 'Final',
  league: 'Liga',
}

function MatchesPage() {
  const [activeCompetition, setActiveCompetition] = useState<string | null>(null)
  const [activeStage, setActiveStage] = useState('all')
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [activeMatchday, setActiveMatchday] = useState<number | null>(null)

  const { data: competitionsData } = useQuery({
    queryKey: ['competitions'],
    queryFn: async () => {
      const res = await apiFetch('/api/competitions')
      if (!res.ok) throw new Error('Erro')
      return res.json() as Promise<{ competitions: CompetitionListItem[] }>
    },
  })

  const allCompetitions = competitionsData?.competitions ?? []
  const competitions = allCompetitions.filter((c) => c.featured)

  const effectiveCompetition =
    activeCompetition ?? (competitions.length === 1 ? (competitions[0]?.id ?? null) : null)
  const selectedComp = allCompetitions.find((c) => c.id === effectiveCompetition)
  const isLeagueSelected = selectedComp?.type === 'league'

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['matches', effectiveCompetition],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (effectiveCompetition) params.set('competitionId', effectiveCompetition)
      else params.set('featured', 'true')
      const res = await apiFetch(`/api/matches?${params}`)
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
  if (activeGroup && activeStage === 'group')
    filtered = filtered.filter((m) => m.group === activeGroup)
  const hasLive = allMatches.some((m) => m.status === 'live')

  // For league, compute matchday tabs
  const leagueMatchdays = isLeagueSelected
    ? [...new Set(allMatches.map((m) => m.matchday).filter((md): md is number => md != null))].sort(
        (a, b) => a - b,
      )
    : []
  const currentMatchday = activeMatchday ?? leagueMatchdays[0] ?? null
  if (isLeagueSelected && currentMatchday != null) {
    filtered = allMatches.filter((m) => m.matchday === currentMatchday)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-3">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">
              Calendário
            </p>
            <h1 className="mt-1 font-display text-4xl font-black leading-[0.9] text-black">
              Jogos
            </h1>
          </div>
          {hasLive && (
            <span className="ml-auto flex items-center gap-1.5 bg-red px-3 py-1 font-display text-[10px] font-bold uppercase tracking-widest text-white">
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-white"
                aria-hidden="true"
              />
              Ao Vivo
            </span>
          )}
        </div>
        <div className="mt-3 h-1 w-12 bg-red" />
      </div>

      {competitions.length > 1 && (
        <div className="flex gap-2" role="tablist" aria-label="Competições">
          {competitions.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={effectiveCompetition === c.id}
              onClick={() => {
                setActiveCompetition(effectiveCompetition === c.id ? null : c.id)
                setActiveStage('all')
                setActiveGroup(null)
                setActiveMatchday(null)
              }}
              className={`flex-1 py-2.5 font-display text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                activeCompetition === c.id
                  ? 'bg-black text-white'
                  : 'border-2 border-border text-gray-dark hover:border-black hover:text-black'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {isLeagueSelected ? (
        <div
          className="flex gap-1.5 overflow-x-auto pb-1 -mx-5 px-5 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-visible"
          role="tablist"
          aria-label="Rodadas"
        >
          {leagueMatchdays.map((md) => (
            <button
              key={md}
              type="button"
              role="tab"
              aria-selected={currentMatchday === md}
              onClick={() => setActiveMatchday(md)}
              className={`shrink-0 font-display text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 transition-colors cursor-pointer ${
                currentMatchday === md ? 'bg-black text-white' : 'text-gray-muted hover:text-black'
              }`}
            >
              {md}ª
            </button>
          ))}
        </div>
      ) : (
        <div
          className="flex gap-1.5 overflow-x-auto pb-1 -mx-5 px-5 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-visible"
          role="tablist"
        >
          {['all', ...MATCH.STAGES.filter((s) => s !== 'league')].map((stage) => (
            <button
              key={stage}
              type="button"
              role="tab"
              aria-selected={activeStage === stage}
              onClick={() => {
                setActiveStage(stage)
                setActiveGroup(null)
              }}
              className={`shrink-0 font-display text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 transition-colors cursor-pointer ${
                activeStage === stage ? 'bg-black text-white' : 'text-gray-muted hover:text-black'
              }`}
            >
              {stageLabels[stage] ?? stage}
            </button>
          ))}
        </div>
      )}

      {activeStage === 'group' && (
        <div
          className="flex gap-1 overflow-x-auto -mx-5 px-5 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-visible"
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            aria-selected={!activeGroup}
            onClick={() => setActiveGroup(null)}
            className={`shrink-0 font-display text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 cursor-pointer ${!activeGroup ? 'bg-black text-white' : 'text-gray-muted hover:text-black'}`}
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
              className={`shrink-0 font-display text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 cursor-pointer ${activeGroup === g ? 'bg-black text-white' : 'text-gray-muted hover:text-black'}`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="border-2 border-dashed border-border py-12 text-center">
          <p className="font-display text-sm font-bold uppercase tracking-wider text-gray-muted">
            Nenhum jogo
          </p>
        </div>
      ) : activeStage === 'group' ? (
        (() => {
          const byMatchday = new Map<number, Match[]>()
          for (const m of filtered) {
            const md = m.matchday ?? 0
            if (!byMatchday.has(md)) byMatchday.set(md, [])
            byMatchday.get(md)?.push(m)
          }
          const sortedMatchdays = [...byMatchday.entries()].sort(([a], [b]) => a - b)
          return (
            <div className="flex flex-col gap-6">
              {sortedMatchdays.map(([matchday, matches]) => (
                <div key={matchday}>
                  <p className="mb-2 font-display text-[11px] font-bold uppercase tracking-widest text-gray-muted">
                    {matchday > 0 ? `${matchday}ª Rodada` : 'Rodada'}
                  </p>
                  <div className="flex flex-col lg:grid lg:grid-cols-3 lg:gap-4">
                    {matches.map((m) => (
                      <MatchCard key={m.id} match={m} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        })()
      ) : (
        <div className="flex flex-col lg:grid lg:grid-cols-3 lg:gap-4">
          {filtered.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      )}
    </div>
  )
}

export const Route = createFileRoute('/matches')({
  beforeLoad: () => requireAuthGuard(),
  component: MatchesPage,
})
