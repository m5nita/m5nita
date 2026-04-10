import { MATCH, type Match, type PoolDetail, type Prediction } from '@m5nita/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useRef, useState } from 'react'
import { ScoreInput, type ScoreInputHandle } from '../../../components/prediction/ScoreInput'
import { Loading } from '../../../components/ui/Loading'
import { apiFetch } from '../../../lib/api'

const knockoutStageLabels: Record<string, string> = {
  'round-of-32': '32-avos',
  'round-of-16': 'Oitavas',
  quarter: 'Quartas',
  semi: 'Semi',
  'third-place': '3º Lugar',
  final: 'Final',
}

const knockoutStageOrder = ['round-of-32', 'round-of-16', 'quarter', 'semi', 'third-place', 'final']

type Tab = 'groups' | 'knockout'

function MatchList({
  matches,
  predictionMap,
  onSave,
  matchdayHeaders,
}: {
  matches: Match[]
  predictionMap: Map<string, Prediction>
  onSave: (matchId: string, homeScore: number, awayScore: number) => void
  matchdayHeaders?: boolean
}) {
  const refs = useRef<(ScoreInputHandle | null)[]>([])

  function getOnAdvance(index: number) {
    for (let i = index + 1; i < matches.length; i++) {
      if (matches[i]?.status !== 'live' && matches[i]?.status !== 'finished') {
        return () => refs.current[i]?.focusHome()
      }
    }
    return () => (document.activeElement as HTMLElement)?.blur()
  }

  let lastMatchday: number | null = null

  return (
    <div className="flex flex-col">
      {matches.map((m, index) => {
        const pred = predictionMap.get(m.id)
        const showHeader = matchdayHeaders && m.matchday !== lastMatchday
        if (matchdayHeaders) lastMatchday = m.matchday
        return (
          <div key={m.id}>
            {showHeader && (
              <p className="mb-1 mt-4 first:mt-0 font-display text-[11px] font-bold uppercase tracking-widest text-gray-muted">
                {m.matchday && m.matchday > 0 ? `${m.matchday}ª Rodada` : 'Rodada'}
              </p>
            )}
            <ScoreInput
              ref={(el) => {
                refs.current[index] = el
              }}
              matchId={m.id}
              homeTeam={m.homeTeam}
              awayTeam={m.awayTeam}
              homeFlag={m.homeFlag}
              awayFlag={m.awayFlag}
              matchDate={m.matchDate}
              homeScore={pred?.homeScore ?? null}
              awayScore={pred?.awayScore ?? null}
              matchStatus={m.status}
              points={pred?.points ?? null}
              actualHomeScore={m.homeScore}
              actualAwayScore={m.awayScore}
              onSave={onSave}
              onAdvance={getOnAdvance(index)}
            />
          </div>
        )
      })}
    </div>
  )
}

function PredictionsPage() {
  const { poolId } = Route.useParams()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('groups')
  const [activeGroup, setActiveGroup] = useState('A')
  const [activeMatchday, setActiveMatchday] = useState<number | null>(null)
  const [activeKnockoutStage, setActiveKnockoutStage] = useState<string | null>(null)

  const { data: poolDetail, isPending: poolPending } = useQuery({
    queryKey: ['pool', poolId],
    queryFn: async (): Promise<PoolDetail> => {
      const res = await apiFetch(`/api/pools/${poolId}`)
      if (!res.ok) throw new Error('Erro ao carregar bolão')
      return res.json()
    },
  })

  const { data: matchesData, isPending: matchesPending } = useQuery({
    queryKey: ['matches', poolDetail?.competitionId],
    queryFn: async (): Promise<{ matches: Match[] }> => {
      const params = new URLSearchParams()
      if (poolDetail?.competitionId) params.set('competitionId', poolDetail.competitionId)
      const res = await apiFetch(`/api/matches?${params}`)
      if (!res.ok) throw new Error('Erro ao carregar jogos')
      return res.json()
    },
    enabled: !!poolDetail,
  })

  const { data: predictionsData, isPending: predictionsPending } = useQuery({
    queryKey: ['predictions', poolId],
    queryFn: async (): Promise<{ predictions: Prediction[] }> => {
      const res = await apiFetch(`/api/pools/${poolId}/predictions`)
      if (!res.ok) throw new Error('Erro ao carregar palpites')
      return res.json()
    },
  })

  const saveMutation = useMutation({
    mutationFn: async ({
      matchId,
      homeScore,
      awayScore,
    }: {
      matchId: string
      homeScore: number
      awayScore: number
    }) => {
      const res = await apiFetch(`/api/pools/${poolId}/predictions/${matchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homeScore, awayScore }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || 'Erro')
      }
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['predictions', poolId] }),
  })

  const handleSave = useCallback(
    (matchId: string, homeScore: number, awayScore: number) =>
      saveMutation.mutate({ matchId, homeScore, awayScore }),
    [saveMutation],
  )

  if (poolPending || (!!poolDetail && matchesPending) || predictionsPending)
    return <Loading message="Carregando palpites..." />

  const rawMatches = matchesData?.matches ?? []
  const allMatches = rawMatches.filter((m) => {
    if (poolDetail?.matchdayFrom != null && poolDetail?.matchdayTo != null && m.matchday != null) {
      return m.matchday >= poolDetail.matchdayFrom && m.matchday <= poolDetail.matchdayTo
    }
    return true
  })
  const predictions = predictionsData?.predictions ?? []
  const predictionMap = new Map(predictions.map((p) => [p.matchId, p]))

  const hasLeagueMatches = allMatches.some((m) => m.stage === 'league')
  const groupMatches = allMatches.filter((m) => m.stage === 'group')
  const knockoutMatches = allMatches.filter((m) => m.stage !== 'group' && m.stage !== 'league')
  const leagueMatches = allMatches.filter((m) => m.stage === 'league')
  const filteredGroupMatches = groupMatches.filter((m) => m.group === activeGroup)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">
          Seus palpites
        </p>
        <h1 className="mt-1 font-display text-4xl font-black leading-[0.9] text-black">Palpites</h1>
        <div className="mt-3 h-1 w-12 bg-red" />
      </div>

      {/* Main tabs */}
      {hasLeagueMatches ? (
        (() => {
          const byMatchday = new Map<number, Match[]>()
          for (const m of leagueMatches) {
            const md = m.matchday ?? 0
            if (!byMatchday.has(md)) byMatchday.set(md, [])
            byMatchday.get(md)?.push(m)
          }
          const sortedMatchdays = [...byMatchday.keys()].sort((a, b) => a - b)
          const currentMatchday = activeMatchday ?? sortedMatchdays[0] ?? 0
          const currentMatches = byMatchday.get(currentMatchday) ?? []

          return (
            <>
              <div
                className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pb-1"
                role="tablist"
                aria-label="Rodadas"
              >
                {sortedMatchdays.map((md) => (
                  <button
                    key={md}
                    type="button"
                    role="tab"
                    aria-selected={currentMatchday === md}
                    onClick={() => setActiveMatchday(md)}
                    className={`shrink-0 font-display text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 transition-colors cursor-pointer ${
                      currentMatchday === md
                        ? 'bg-black text-white'
                        : 'text-gray-muted hover:text-black'
                    }`}
                  >
                    {md}ª
                  </button>
                ))}
              </div>

              <p className="font-display text-[11px] font-bold uppercase tracking-widest text-gray-muted">
                {currentMatchday}ª Rodada
              </p>
              <MatchList
                matches={currentMatches}
                predictionMap={predictionMap}
                onSave={handleSave}
              />
            </>
          )
        })()
      ) : (
        <>
          <div className="flex gap-2" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'groups'}
              onClick={() => setTab('groups')}
              className={`flex-1 py-2.5 font-display text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${tab === 'groups' ? 'bg-black text-white' : 'border-2 border-border text-gray-dark hover:border-black hover:text-black'}`}
            >
              Fase de Grupos
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'knockout'}
              onClick={() => setTab('knockout')}
              className={`flex-1 py-2.5 font-display text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${tab === 'knockout' ? 'bg-black text-white' : 'border-2 border-border text-gray-dark hover:border-black hover:text-black'}`}
            >
              Mata-Mata
            </button>
          </div>
        </>
      )}

      {!hasLeagueMatches && tab === 'groups' && (
        <>
          <div
            className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pb-1"
            role="tablist"
            aria-label="Grupos"
          >
            {MATCH.GROUPS.map((group) => (
              <button
                key={group}
                type="button"
                role="tab"
                aria-selected={activeGroup === group}
                onClick={() => setActiveGroup(group)}
                className={`shrink-0 font-display text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 transition-colors cursor-pointer ${
                  activeGroup === group ? 'bg-black text-white' : 'text-gray-muted hover:text-black'
                }`}
              >
                {group}
              </button>
            ))}
          </div>

          {filteredGroupMatches.length === 0 ? (
            <div className="border-2 border-dashed border-border py-10 text-center">
              <p className="font-display text-sm font-bold uppercase tracking-wider text-gray-muted">
                Nenhum jogo no Grupo {activeGroup}
              </p>
            </div>
          ) : (
            <MatchList
              matches={[...filteredGroupMatches].sort(
                (a, b) => (a.matchday ?? 0) - (b.matchday ?? 0),
              )}
              predictionMap={predictionMap}
              onSave={handleSave}
              matchdayHeaders
            />
          )}
        </>
      )}

      {!hasLeagueMatches &&
        tab === 'knockout' &&
        (() => {
          const availableStages = knockoutStageOrder.filter((stage) =>
            knockoutMatches.some((m) => m.stage === stage),
          )

          if (availableStages.length === 0) {
            return (
              <div className="border-2 border-dashed border-border py-10 text-center">
                <p className="font-display text-sm font-bold uppercase tracking-wider text-gray-muted">
                  Em breve
                </p>
                <p className="mt-1 text-xs text-gray-muted">Mata-mata apos a fase de grupos</p>
              </div>
            )
          }

          const currentStage = activeKnockoutStage ?? availableStages[0] ?? ''
          const stageMatches = knockoutMatches.filter((m) => m.stage === currentStage)

          return (
            <>
              <div
                className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pb-1"
                role="tablist"
                aria-label="Fases"
              >
                {availableStages.map((stage) => (
                  <button
                    key={stage}
                    type="button"
                    role="tab"
                    aria-selected={currentStage === stage}
                    onClick={() => setActiveKnockoutStage(stage)}
                    className={`shrink-0 font-display text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 transition-colors cursor-pointer ${
                      currentStage === stage
                        ? 'bg-black text-white'
                        : 'text-gray-muted hover:text-black'
                    }`}
                  >
                    {knockoutStageLabels[stage] ?? stage}
                  </button>
                ))}
              </div>
              <MatchList matches={stageMatches} predictionMap={predictionMap} onSave={handleSave} />
            </>
          )
        })()}
    </div>
  )
}

export const Route = createFileRoute('/pools/$poolId/predictions')({ component: PredictionsPage })
