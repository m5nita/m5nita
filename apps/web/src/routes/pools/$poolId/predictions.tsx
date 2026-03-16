import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ScoreInput } from '../../../components/prediction/ScoreInput'
import { Bracket } from '../../../components/match/Bracket'
import { Loading } from '../../../components/ui/Loading'
import { MATCH } from '@manita/shared'
import { useState } from 'react'

type Tab = 'groups' | 'knockout'

function PredictionsPage() {
  const { poolId } = Route.useParams()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('groups')
  const [activeGroup, setActiveGroup] = useState('A')

  const { data: matchesData, isPending: matchesPending } = useQuery({
    queryKey: ['matches'],
    queryFn: async () => {
      const res = await fetch('/api/matches', { credentials: 'include' })
      if (!res.ok) throw new Error('Erro ao carregar jogos')
      return res.json()
    },
  })

  const { data: predictionsData, isPending: predictionsPending } = useQuery({
    queryKey: ['predictions', poolId],
    queryFn: async () => {
      const res = await fetch(`/api/pools/${poolId}/predictions`, { credentials: 'include' })
      if (!res.ok) throw new Error('Erro ao carregar palpites')
      return res.json()
    },
  })

  const saveMutation = useMutation({
    mutationFn: async ({ matchId, homeScore, awayScore }: { matchId: string; homeScore: number; awayScore: number }) => {
      const res = await fetch(`/api/pools/${poolId}/predictions/${matchId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ homeScore, awayScore }),
      })
      if (!res.ok) { const data = await res.json(); throw new Error(data.message || 'Erro') }
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['predictions', poolId] }),
  })

  if (matchesPending || predictionsPending) return <Loading message="Carregando palpites..." />

  const allMatches = matchesData?.matches ?? []
  const predictions = predictionsData?.predictions ?? []
  const predictionMap = new Map(predictions.map((p: any) => [p.matchId, p]))
  const groupMatches = allMatches.filter((m: any) => m.stage === 'group')
  const knockoutMatches = allMatches.filter((m: any) => m.stage !== 'group')
  const filteredGroupMatches = groupMatches.filter((m: any) => m.group === activeGroup)

  function renderScoreInputs(matches: any[]) {
    return (
      <div className="flex flex-col">
        {matches.map((m: any) => {
          const pred = predictionMap.get(m.id) as any
          return (
            <ScoreInput key={m.id} matchId={m.id} homeTeam={m.homeTeam} awayTeam={m.awayTeam}
              homeScore={pred?.homeScore ?? null} awayScore={pred?.awayScore ?? null}
              matchStatus={m.status} points={pred?.points ?? null}
              actualHomeScore={m.homeScore} actualAwayScore={m.awayScore}
              onSave={(matchId, homeScore, awayScore) => saveMutation.mutate({ matchId, homeScore, awayScore })} />
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">Seus palpites</p>
        <h1 className="mt-1 font-display text-4xl font-black leading-[0.9] text-black">Palpites</h1>
        <div className="mt-3 h-1 w-12 bg-red" />
      </div>

      {/* Main tabs */}
      <div className="flex gap-2" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'groups'} onClick={() => setTab('groups')}
          className={`flex-1 py-2.5 font-display text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${tab === 'groups' ? 'bg-black text-white' : 'border-2 border-border text-gray-dark hover:border-black hover:text-black'}`}>
          Fase de Grupos
        </button>
        <button type="button" role="tab" aria-selected={tab === 'knockout'} onClick={() => setTab('knockout')}
          className={`flex-1 py-2.5 font-display text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${tab === 'knockout' ? 'bg-black text-white' : 'border-2 border-border text-gray-dark hover:border-black hover:text-black'}`}>
          Mata-Mata
        </button>
      </div>

      {tab === 'groups' && (
        <>
          <div className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pb-1" role="tablist" aria-label="Grupos">
            {MATCH.GROUPS.map((group) => (
              <button key={group} type="button" role="tab" aria-selected={activeGroup === group} onClick={() => setActiveGroup(group)}
                className={`shrink-0 font-display text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 transition-colors cursor-pointer ${
                  activeGroup === group ? 'bg-black text-white' : 'text-gray-muted hover:text-black'
                }`}>
                {group}
              </button>
            ))}
          </div>

          {filteredGroupMatches.length === 0 ? (
            <div className="border-2 border-dashed border-border py-10 text-center">
              <p className="font-display text-sm font-bold uppercase tracking-wider text-gray-muted">Nenhum jogo no Grupo {activeGroup}</p>
            </div>
          ) : renderScoreInputs(filteredGroupMatches)}
        </>
      )}

      {tab === 'knockout' && (
        <>
          {knockoutMatches.length === 0 ? (
            <div className="border-2 border-dashed border-border py-10 text-center">
              <p className="font-display text-sm font-bold uppercase tracking-wider text-gray-muted">Em breve</p>
              <p className="mt-1 text-xs text-gray-muted">Mata-mata apos a fase de grupos</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <Bracket matches={knockoutMatches} />
              <div className="flex items-center gap-3">
                <h3 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">Seus Palpites</h3>
                <div className="h-px flex-1 bg-border" />
              </div>
              {renderScoreInputs(knockoutMatches.filter((m: any) => m.homeTeam && m.awayTeam))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export const Route = createFileRoute('/pools/$poolId/predictions')({ component: PredictionsPage })
