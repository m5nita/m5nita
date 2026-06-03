import {
  MATCH,
  type Match,
  type MatchPredictionsResponse,
  type PoolDetail,
  type Prediction,
} from '@m5nita/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PoolHub } from '../../../components/pool/PoolHub'
import { MatchPredictionsList } from '../../../components/prediction/MatchPredictionsList'
import { ScoreInput, type ScoreInputHandle } from '../../../components/prediction/ScoreInput'
import { ErrorMessage } from '../../../components/ui/ErrorMessage'
import { MatchCardSkeleton } from '../../../components/ui/Skeleton'
import { apiFetch } from '../../../lib/api'
import { matchParamsForPool } from '../../../lib/matchQuery'
import { upsertPrediction } from '../../../lib/optimisticPredictions'
import { livePollMs } from '../../../lib/poll'

function MatchPredictionsAccordion({
  poolId,
  matchId,
  isLive,
}: {
  poolId: string
  matchId: string
  isLive: boolean
}) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['match-predictions', poolId, matchId],
    queryFn: async (): Promise<MatchPredictionsResponse> => {
      const res = await apiFetch(`/api/pools/${poolId}/matches/${matchId}/predictions`)
      if (!res.ok) throw new Error('Erro ao carregar palpites')
      return res.json()
    },
    staleTime: 30_000,
    refetchInterval: isLive ? livePollMs() : false,
  })

  if (isPending) {
    return (
      <div className="-mx-5 mt-3 border-t border-border bg-black/2 px-5 pt-2 pb-3 lg:mx-0 lg:px-4">
        {['a', 'b', 'c'].map((k) => (
          <div key={k} className="flex items-center gap-2 py-2">
            <span className="h-4 flex-1 animate-pulse bg-black/10" />
            <span className="h-8 w-8 animate-pulse bg-black/10" />
            <span className="h-8 w-8 animate-pulse bg-black/10" />
          </div>
        ))}
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="-mx-5 mt-3 border-t border-border bg-black/2 px-5 py-4 text-center lg:mx-0 lg:px-4">
        <p className="font-display text-[10px] font-bold uppercase tracking-widest text-gray-muted">
          Erro ao carregar palpites
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-2 font-display text-[10px] font-bold uppercase tracking-widest text-black underline underline-offset-4 transition-colors hover:text-red"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  return <MatchPredictionsList data={data} />
}

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

type SubTabSelection = {
  tab?: Tab
  group?: string
  matchday?: number
  knockoutStage?: string
}

// Which sub-tab (group / round / knockout stage) must be active for `target` to
// be on screen, derived purely from the match's stage/round. Single-match pools
// render no sub-tabs, so this extra state is simply unused there.
function subTabForMatch(target: Match): SubTabSelection {
  if (target.stage === 'group') {
    return target.group ? { tab: 'groups', group: target.group } : { tab: 'groups' }
  }
  if (target.stage === 'league') {
    return target.matchday != null ? { matchday: target.matchday } : {}
  }
  return { tab: 'knockout', knockoutStage: target.stage }
}

function MatchList({
  poolId,
  matches,
  predictionMap,
  onSave,
  matchdayHeaders,
  highlightMatchId,
}: {
  poolId: string
  matches: Match[]
  predictionMap: Map<string, Prediction>
  onSave: (matchId: string, homeScore: number, awayScore: number) => void
  matchdayHeaders?: boolean
  highlightMatchId?: string | null
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

  const renderExpandedContent = useCallback(
    (matchId: string) => {
      const match = matches.find((x) => x.id === matchId)
      return (
        <MatchPredictionsAccordion
          poolId={poolId}
          matchId={matchId}
          isLive={match?.status === 'live'}
        />
      )
    },
    [poolId, matches],
  )

  type SectionItem = { match: Match; originalIndex: number; localIndex: number }
  const sections: { key: string; header: string | null; items: SectionItem[] }[] = []
  matches.forEach((match, originalIndex) => {
    const sectionKey = matchdayHeaders ? String(match.matchday ?? 'none') : 'all'
    let current = sections[sections.length - 1]
    if (!current || current.key !== sectionKey) {
      const header = matchdayHeaders
        ? match.matchday && match.matchday > 0
          ? `${match.matchday}ª Rodada`
          : 'Rodada'
        : null
      current = { key: sectionKey, header, items: [] }
      sections.push(current)
    }
    current.items.push({ match, originalIndex, localIndex: current.items.length })
  })

  function renderCard({ match, originalIndex, localIndex }: SectionItem) {
    const pred = predictionMap.get(match.id)
    return (
      <div
        key={match.id}
        id={`match-${match.id}`}
        style={{ order: localIndex }}
        className={
          highlightMatchId === match.id
            ? 'bg-red/5 transition-colors duration-700'
            : 'transition-colors duration-700'
        }
      >
        <ScoreInput
          ref={(el) => {
            refs.current[originalIndex] = el
          }}
          matchId={match.id}
          homeTeam={match.homeTeam}
          awayTeam={match.awayTeam}
          homeFlag={match.homeFlag}
          awayFlag={match.awayFlag}
          matchDate={match.matchDate}
          homeScore={pred?.homeScore ?? null}
          awayScore={pred?.awayScore ?? null}
          matchStatus={match.status}
          points={pred?.points ?? null}
          category={pred?.category ?? null}
          bonus={pred?.bonus ?? null}
          actualHomeScore={match.homeScore}
          actualAwayScore={match.awayScore}
          onSave={onSave}
          onAdvance={getOnAdvance(originalIndex)}
          renderExpandedContent={renderExpandedContent}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {sections.map((section) => {
        const isSingle = section.items.length === 1
        const leftItems = section.items.filter((item) => item.localIndex % 2 === 0)
        const rightItems = section.items.filter((item) => item.localIndex % 2 === 1)
        return (
          <div key={section.key}>
            {section.header && (
              <p className="mb-1 mt-4 first:mt-0 font-display text-[11px] font-bold uppercase tracking-widest text-gray-muted">
                {section.header}
              </p>
            )}
            {isSingle ? (
              <div className="lg:mx-auto lg:w-full lg:max-w-[600px]">
                {section.items.map(renderCard)}
              </div>
            ) : (
              <div className="flex flex-col lg:flex-row lg:items-start lg:gap-x-4">
                <div className="contents lg:flex lg:flex-1 lg:flex-col">
                  {leftItems.map(renderCard)}
                </div>
                <div className="contents lg:flex lg:flex-1 lg:flex-col">
                  {rightItems.map(renderCard)}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function filterMatchesForPool(rawMatches: Match[], pool: PoolDetail): Match[] {
  return rawMatches.filter((m) => {
    if (pool.matchId != null) {
      return m.id === pool.matchId
    }
    if (pool.matchdayFrom != null && pool.matchdayTo != null && m.matchday != null) {
      return m.matchday >= pool.matchdayFrom && m.matchday <= pool.matchdayTo
    }
    return true
  })
}

type MatchListShared = {
  poolId: string
  predictionMap: Map<string, Prediction>
  onSave: (matchId: string, homeScore: number, awayScore: number) => void
  highlightMatchId: string | null
}

function GroupKnockoutTabBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
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
  )
}

function LeagueMatchdayView({
  leagueMatches,
  activeMatchday,
  setActiveMatchday,
  poolId,
  predictionMap,
  onSave,
  highlightMatchId,
}: MatchListShared & {
  leagueMatches: Match[]
  activeMatchday: number | null
  setActiveMatchday: (md: number) => void
}) {
  const byMatchday = new Map<number, Match[]>()
  for (const m of leagueMatches) {
    const md = m.matchday ?? 0
    if (!byMatchday.has(md)) byMatchday.set(md, [])
    byMatchday.get(md)?.push(m)
  }
  const sortedMatchdays = [...byMatchday.keys()].sort((a, b) => a - b)
  const firstUnfinishedMatchday = sortedMatchdays.find((md) =>
    (byMatchday.get(md) ?? []).some((m) => m.status !== 'finished'),
  )
  const defaultMatchday =
    firstUnfinishedMatchday ?? sortedMatchdays[sortedMatchdays.length - 1] ?? 0
  const currentMatchday = activeMatchday ?? defaultMatchday
  const currentMatches = byMatchday.get(currentMatchday) ?? []

  return (
    <>
      <div
        className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pb-1 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-visible"
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
              currentMatchday === md ? 'bg-black text-white' : 'text-gray-muted hover:text-black'
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
        poolId={poolId}
        matches={currentMatches}
        predictionMap={predictionMap}
        onSave={onSave}
        highlightMatchId={highlightMatchId}
      />
    </>
  )
}

function GroupStageView({
  groupMatches,
  activeGroup,
  setActiveGroup,
  poolId,
  predictionMap,
  onSave,
  highlightMatchId,
}: MatchListShared & {
  groupMatches: Match[]
  activeGroup: string
  setActiveGroup: (group: string) => void
}) {
  const filteredGroupMatches = groupMatches.filter((m) => m.group === activeGroup)
  return (
    <>
      <div
        className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pb-1 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-visible"
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
          poolId={poolId}
          matches={[...filteredGroupMatches].sort((a, b) => (a.matchday ?? 0) - (b.matchday ?? 0))}
          predictionMap={predictionMap}
          onSave={onSave}
          matchdayHeaders
          highlightMatchId={highlightMatchId}
        />
      )}
    </>
  )
}

function KnockoutStagesView({
  knockoutMatches,
  activeKnockoutStage,
  setActiveKnockoutStage,
  poolId,
  predictionMap,
  onSave,
  highlightMatchId,
}: MatchListShared & {
  knockoutMatches: Match[]
  activeKnockoutStage: string | null
  setActiveKnockoutStage: (stage: string) => void
}) {
  const availableStages = knockoutStageOrder.filter((stage) =>
    knockoutMatches.some((m) => m.stage === stage),
  )

  if (availableStages.length === 0) {
    return (
      <div className="border-2 border-dashed border-border py-10 text-center">
        <p className="font-display text-sm font-bold uppercase tracking-wider text-gray-muted">
          Em breve
        </p>
        <p className="mt-1 text-xs text-gray-muted">Mata-mata após a fase de grupos</p>
      </div>
    )
  }

  const currentStage = activeKnockoutStage ?? availableStages[0] ?? ''
  const stageMatches = knockoutMatches.filter((m) => m.stage === currentStage)

  return (
    <>
      <div
        className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pb-1 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-visible"
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
              currentStage === stage ? 'bg-black text-white' : 'text-gray-muted hover:text-black'
            }`}
          >
            {knockoutStageLabels[stage] ?? stage}
          </button>
        ))}
      </div>
      <MatchList
        poolId={poolId}
        matches={stageMatches}
        predictionMap={predictionMap}
        onSave={onSave}
        highlightMatchId={highlightMatchId}
      />
    </>
  )
}

function PredictionsContent({
  pool,
  poolId,
  targetMatchId,
}: {
  pool: PoolDetail
  poolId: string
  targetMatchId?: string
}) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('groups')
  const [activeGroup, setActiveGroup] = useState('A')
  const [activeMatchday, setActiveMatchday] = useState<number | null>(null)
  const [activeKnockoutStage, setActiveKnockoutStage] = useState<string | null>(null)
  const [highlightMatchId, setHighlightMatchId] = useState<string | null>(null)
  const handledTargetRef = useRef<string | null>(null)

  const {
    data: matchesData,
    isPending: matchesPending,
    isError: matchesError,
    refetch: refetchMatches,
  } = useQuery({
    // Pool-scoped key: the server now returns only this pool's matches (one
    // match, a round range, or the whole competition), so it must not share a
    // cache entry with other pools of the same competition.
    queryKey: ['pool-matches', poolId],
    queryFn: async (): Promise<{ matches: Match[] }> => {
      const params = matchParamsForPool(pool)
      const res = await apiFetch(`/api/matches?${params}`)
      if (!res.ok) throw new Error('Erro ao carregar jogos')
      return res.json()
    },
    refetchInterval: (query) => {
      const matches = query.state.data?.matches
      return matches?.some((m) => m.status === 'live') ? livePollMs() : false
    },
  })

  const hasLiveMatch = (matchesData?.matches ?? []).some((m) => m.status === 'live')

  const {
    data: predictionsData,
    isPending: predictionsPending,
    isError: predictionsError,
    refetch: refetchPredictions,
  } = useQuery({
    queryKey: ['predictions', poolId],
    queryFn: async (): Promise<{ predictions: Prediction[] }> => {
      const res = await apiFetch(`/api/pools/${poolId}/predictions`)
      if (!res.ok) throw new Error('Erro ao carregar palpites')
      return res.json()
    },
    refetchInterval: hasLiveMatch ? livePollMs() : false,
  })

  const predictionsKey = ['predictions', poolId]
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
    // Optimistic: write the typed score straight into the cache so the card
    // updates instantly and we avoid a full-list refetch per keystroke. Roll
    // back to server truth on error (ScoreInput surfaces "Não salvo").
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: predictionsKey })
      const previous = queryClient.getQueryData<{ predictions: Prediction[] }>(predictionsKey)
      queryClient.setQueryData<{ predictions: Prediction[] }>(predictionsKey, (old) => ({
        predictions: upsertPrediction(old?.predictions ?? [], vars),
      }))
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(predictionsKey, context.previous)
    },
  })

  const handleSave = useCallback(
    (matchId: string, homeScore: number, awayScore: number) =>
      saveMutation.mutateAsync({ matchId, homeScore, awayScore }),
    [saveMutation],
  )

  // Deep-link from the stats "Jogos que mais importam" list: arriving with
  // ?match=<id>, jump straight to the sub-tab (group / round / knockout stage)
  // that holds that match, scroll to its card and briefly highlight it —
  // instead of dumping the user on the first tab. Runs once per target id.
  useEffect(() => {
    if (!targetMatchId || handledTargetRef.current === targetMatchId) return
    const target = matchesData?.matches?.find((m) => m.id === targetMatchId)
    if (!target) return
    handledTargetRef.current = targetMatchId

    const sel = subTabForMatch(target)
    if (sel.tab) setTab(sel.tab)
    if (sel.group) setActiveGroup(sel.group)
    if (sel.matchday != null) setActiveMatchday(sel.matchday)
    if (sel.knockoutStage) setActiveKnockoutStage(sel.knockoutStage)

    setHighlightMatchId(targetMatchId)
    const scrollTimer = setTimeout(() => {
      document
        .getElementById(`match-${targetMatchId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 120)
    const clearTimer = setTimeout(() => setHighlightMatchId(null), 2600)
    return () => {
      clearTimeout(scrollTimer)
      clearTimeout(clearTimer)
    }
  }, [targetMatchId, matchesData])

  if (matchesPending || predictionsPending) {
    return (
      <div className="flex flex-col gap-3">
        {['s1', 's2', 's3', 's4', 's5', 's6'].map((k) => (
          <MatchCardSkeleton key={k} />
        ))}
      </div>
    )
  }

  if (matchesError || predictionsError) {
    return (
      <ErrorMessage
        message="Não foi possível carregar os palpites. Tente novamente."
        onRetry={() => {
          if (matchesError) refetchMatches()
          if (predictionsError) refetchPredictions()
        }}
      />
    )
  }

  const rawMatches = matchesData?.matches ?? []
  const allMatches = filterMatchesForPool(rawMatches, pool)
  const predictions = predictionsData?.predictions ?? []
  const predictionMap = new Map(predictions.map((p) => [p.matchId, p]))

  const hasLeagueMatches = allMatches.some((m) => m.stage === 'league')
  const groupMatches = allMatches.filter((m) => m.stage === 'group')
  const knockoutMatches = allMatches.filter((m) => m.stage !== 'group' && m.stage !== 'league')
  const leagueMatches = allMatches.filter((m) => m.stage === 'league')

  return (
    <>
      {pool.matchId != null ? (
        <MatchList
          poolId={poolId}
          matches={allMatches}
          predictionMap={predictionMap}
          onSave={handleSave}
          highlightMatchId={highlightMatchId}
        />
      ) : hasLeagueMatches ? (
        <LeagueMatchdayView
          leagueMatches={leagueMatches}
          activeMatchday={activeMatchday}
          setActiveMatchday={setActiveMatchday}
          poolId={poolId}
          predictionMap={predictionMap}
          onSave={handleSave}
          highlightMatchId={highlightMatchId}
        />
      ) : (
        <GroupKnockoutTabBar tab={tab} setTab={setTab} />
      )}

      {!hasLeagueMatches && tab === 'groups' && (
        <GroupStageView
          groupMatches={groupMatches}
          activeGroup={activeGroup}
          setActiveGroup={setActiveGroup}
          poolId={poolId}
          predictionMap={predictionMap}
          onSave={handleSave}
          highlightMatchId={highlightMatchId}
        />
      )}

      {!hasLeagueMatches && tab === 'knockout' && (
        <KnockoutStagesView
          knockoutMatches={knockoutMatches}
          activeKnockoutStage={activeKnockoutStage}
          setActiveKnockoutStage={setActiveKnockoutStage}
          poolId={poolId}
          predictionMap={predictionMap}
          onSave={handleSave}
          highlightMatchId={highlightMatchId}
        />
      )}
    </>
  )
}

function PredictionsPage() {
  const { poolId } = Route.useParams()
  const { match: targetMatchId } = Route.useSearch()
  return (
    <PoolHub poolId={poolId} activeTab="predictions">
      {(pool) => <PredictionsContent pool={pool} poolId={poolId} targetMatchId={targetMatchId} />}
    </PoolHub>
  )
}

export const Route = createFileRoute('/pools/$poolId/predictions')({
  component: PredictionsPage,
  validateSearch: (search: Record<string, unknown>): { match?: string } =>
    typeof search.match === 'string' && search.match.length > 0 ? { match: search.match } : {},
})
