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
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ homeScore, awayScore }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || 'Erro ao salvar palpite')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['predictions', poolId] })
    },
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
      <div className="flex flex-col gap-3">
        {matches.map((m: any) => {
          const pred = predictionMap.get(m.id) as any
          return (
            <ScoreInput
              key={m.id}
              matchId={m.id}
              homeTeam={m.homeTeam}
              awayTeam={m.awayTeam}
              homeScore={pred?.homeScore ?? null}
              awayScore={pred?.awayScore ?? null}
              matchStatus={m.status}
              points={pred?.points ?? null}
              actualHomeScore={m.homeScore}
              actualAwayScore={m.awayScore}
              onSave={(matchId, homeScore, awayScore) =>
                saveMutation.mutate({ matchId, homeScore, awayScore })
              }
            />
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold text-navy">Palpites</h1>

      <div className="flex gap-2" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'groups'}
          onClick={() => setTab('groups')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            tab === 'groups' ? 'bg-navy text-cream' : 'text-gray-dark hover:bg-navy/5'
          }`}
        >
          Fase de Grupos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'knockout'}
          onClick={() => setTab('knockout')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            tab === 'knockout' ? 'bg-navy text-cream' : 'text-gray-dark hover:bg-navy/5'
          }`}
        >
          Mata-mata
        </button>
      </div>

      {tab === 'groups' && (
        <>
          <div className="flex gap-1 overflow-x-auto pb-2" role="tablist" aria-label="Grupos">
            {MATCH.GROUPS.map((group) => (
              <button
                key={group}
                type="button"
                role="tab"
                aria-selected={activeGroup === group}
                onClick={() => setActiveGroup(group)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeGroup === group ? 'bg-navy text-cream' : 'text-gray-dark hover:bg-navy/5'
                }`}
              >
                {group}
              </button>
            ))}
          </div>

          {filteredGroupMatches.length === 0 ? (
            <p className="py-8 text-center text-gray-dark">Nenhum jogo no Grupo {activeGroup}</p>
          ) : (
            renderScoreInputs(filteredGroupMatches)
          )}
        </>
      )}

      {tab === 'knockout' && (
        <>
          {knockoutMatches.length === 0 ? (
            <p className="py-8 text-center text-gray-dark">
              Jogos do mata-mata serao exibidos apos a fase de grupos.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <Bracket matches={knockoutMatches} />
              <h3 className="font-heading font-bold text-navy">Seus palpites</h3>
              {renderScoreInputs(knockoutMatches.filter((m: any) => m.homeTeam && m.awayTeam))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export const Route = createFileRoute('/pools/$poolId/predictions')({
  component: PredictionsPage,
})
