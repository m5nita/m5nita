import {
  type AdvanceSide,
  MATCH,
  type Match,
  type MatchPredictionsResponse,
  type PoolDetail,
  type Prediction,
} from '@m5nita/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { PoolHub } from '../../../components/pool/PoolHub'
import { MatchPredictionsList } from '../../../components/prediction/MatchPredictionsList'
import { ScoreInput, type ScoreInputHandle } from '../../../components/prediction/ScoreInput'
import { Confetti } from '../../../components/ui/Confetti'
import { ErrorMessage } from '../../../components/ui/ErrorMessage'
import { MatchCardSkeleton } from '../../../components/ui/Skeleton'
import { apiFetch } from '../../../lib/api'
import { claimUncelebrated } from '../../../lib/celebrate'
import { matchParamsForPool } from '../../../lib/matchQuery'
import {
  buildSections,
  type Grouping,
  matchesToday,
  type SectionItem,
  sortByDate,
} from '../../../lib/matchSchedule'
import { upsertPrediction } from '../../../lib/optimisticPredictions'
import { livePollMs, matchesPollMs } from '../../../lib/poll'

function MatchPredictionsAccordion({
  poolId,
  matchId,
  isLive,
  stage,
  homeTeam,
  awayTeam,
  homeFlag,
  awayFlag,
}: {
  poolId: string
  matchId: string
  isLive: boolean
  stage: string
  homeTeam: string
  awayTeam: string
  homeFlag: string | null
  awayFlag: string | null
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

  return (
    <MatchPredictionsList
      data={data}
      stage={stage}
      homeTeam={homeTeam}
      awayTeam={awayTeam}
      homeFlag={homeFlag}
      awayFlag={awayFlag}
    />
  )
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

// 'today' / 'all' are the universal schedule views (every multi-match format);
// 'format' falls back to the competition-shaped navigation (groups + knockout,
// or league rounds).
type ViewMode = 'today' | 'all' | 'format'

const ALL_BATCH_SIZE = 20

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
  grouping,
  highlightMatchId,
}: {
  poolId: string
  matches: Match[]
  predictionMap: Map<string, Prediction>
  onSave: (
    matchId: string,
    homeScore: number,
    awayScore: number,
    advancePick: AdvanceSide | null,
  ) => void
  grouping?: Grouping
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
          stage={match?.stage ?? 'group'}
          homeTeam={match?.homeTeam ?? ''}
          awayTeam={match?.awayTeam ?? ''}
          homeFlag={match?.homeFlag ?? null}
          awayFlag={match?.awayFlag ?? null}
        />
      )
    },
    [poolId, matches],
  )

  const sections = buildSections(matches, grouping ?? 'none')

  // Auto-celebrate: when a freshly-graded exact score first appears, fire one
  // confetti burst (once per match, localStorage-deduped). Clicking the "+10 pts"
  // re-fires it on demand (handled in ScoreInput). Exact = predicted scoreline
  // equals the actual regular-time scoreline (works for every pool type).
  const [autoBurst, setAutoBurst] = useState(0)
  useEffect(() => {
    const exactKeys = matches
      .filter((m) => {
        if (m.status !== 'finished' || m.homeScore === null || m.awayScore === null) return false
        const p = predictionMap.get(m.id)
        return p != null && p.homeScore === m.homeScore && p.awayScore === m.awayScore
      })
      .map((m) => `exact:${poolId}:${m.id}`)
    // No vibrate() here: this fires on load with no user gesture, which the
    // browser blocks anyway (haptics need a tap). The click path still vibrates.
    if (claimUncelebrated(exactKeys).length > 0) {
      setAutoBurst((k) => k + 1)
    }
  }, [matches, predictionMap, poolId])

  function renderCard({ match, originalIndex, localIndex }: SectionItem<Match>) {
    const pred = predictionMap.get(match.id)
    return (
      <div
        key={match.id}
        id={`match-${match.id}`}
        style={{ order: localIndex }}
        className={`scroll-mt-24 transition-colors duration-700 ${
          highlightMatchId === match.id ? 'bg-red/5' : ''
        }`}
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
          stage={match.stage}
          homeScore={pred?.homeScore ?? null}
          awayScore={pred?.awayScore ?? null}
          advancePick={pred?.advancePick ?? null}
          matchStatus={match.status}
          points={pred?.points ?? null}
          category={pred?.category ?? null}
          bonus={pred?.bonus ?? null}
          advanceBonus={pred?.advanceBonus ?? null}
          actualHomeScore={match.homeScore}
          actualAwayScore={match.awayScore}
          minute={match.minute}
          injuryTime={match.injuryTime}
          duration={match.duration}
          extraTimeHomeScore={match.extraTimeHomeScore}
          extraTimeAwayScore={match.extraTimeAwayScore}
          penaltyHomeScore={match.penaltyHomeScore}
          penaltyAwayScore={match.penaltyAwayScore}
          onSave={onSave}
          onAdvance={getOnAdvance(originalIndex)}
          renderExpandedContent={renderExpandedContent}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {autoBurst > 0 && <Confetti key={`auto-${autoBurst}`} />}
      {sections.map((section) => {
        const isSingle = section.items.length === 1
        const leftItems = section.items.filter((item) => item.localIndex % 2 === 0)
        const rightItems = section.items.filter((item) => item.localIndex % 2 === 1)
        return (
          // Top spacing lives on the section (not the header), so `first:` targets
          // the real first day — a header is always first-child of its own div.
          <div key={section.key} data-day-section className="mt-1 first:mt-0">
            {section.header && (
              <p className="-mb-1 font-display text-[11px] font-bold uppercase tracking-widest text-gray-muted">
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
  onSave: (
    matchId: string,
    homeScore: number,
    awayScore: number,
    advancePick: AdvanceSide | null,
  ) => void
  highlightMatchId: string | null
}

function TopTab({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`border-2 py-2 font-display text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
        active
          ? 'border-black bg-black text-white'
          : 'border-border text-gray-dark hover:border-black hover:text-black'
      }`}
    >
      {label}
    </button>
  )
}

// Cup pools: the universal Jogos do dia / Todos os jogos row sits with the
// format toggle in one grid — 2×2 on mobile, a single row of 4 on desktop.
function ScheduleTabBarCup({
  viewMode,
  tab,
  onSelectToday,
  onSelectAll,
  onSelectFormat,
}: {
  viewMode: ViewMode
  tab: Tab
  onSelectToday: () => void
  onSelectAll: () => void
  onSelectFormat: (t: Tab) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="tablist">
      <TopTab label="Jogos do dia" active={viewMode === 'today'} onClick={onSelectToday} />
      <TopTab label="Todos os jogos" active={viewMode === 'all'} onClick={onSelectAll} />
      <TopTab
        label="Fase de Grupos"
        active={viewMode === 'format' && tab === 'groups'}
        onClick={() => onSelectFormat('groups')}
      />
      <TopTab
        label="Mata-Mata"
        active={viewMode === 'format' && tab === 'knockout'}
        onClick={() => onSelectFormat('knockout')}
      />
    </div>
  )
}

// League pools: the universal row pairs with the round selector below it.
function ScheduleTabBarLeague({
  viewMode,
  onSelectToday,
  onSelectAll,
}: {
  viewMode: ViewMode
  onSelectToday: () => void
  onSelectAll: () => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2" role="tablist">
      <TopTab label="Jogos do dia" active={viewMode === 'today'} onClick={onSelectToday} />
      <TopTab label="Todos os jogos" active={viewMode === 'all'} onClick={onSelectAll} />
    </div>
  )
}

function TodayView({
  matches,
  poolId,
  predictionMap,
  onSave,
  highlightMatchId,
  onSeeAll,
}: MatchListShared & { matches: Match[]; onSeeAll: () => void }) {
  if (matches.length === 0) {
    return (
      <div className="border-2 border-dashed border-border py-10 text-center">
        <p className="font-display text-sm font-bold uppercase tracking-wider text-gray-muted">
          Nenhum jogo hoje
        </p>
        <button
          type="button"
          onClick={onSeeAll}
          className="mt-2 font-display text-[11px] font-bold uppercase tracking-widest text-black underline underline-offset-4 transition-colors hover:text-red cursor-pointer"
        >
          Ver todos os jogos
        </button>
      </div>
    )
  }
  return (
    // Single flex child so the parent's gap-6 sits above the label (matching the
    // day header in "Todos os jogos"), not between the label and the list.
    <div>
      <p className="-mb-1 font-display text-[11px] font-bold uppercase tracking-widest text-gray-muted">
        Hoje · {matches.length} {matches.length === 1 ? 'jogo' : 'jogos'}
      </p>
      <MatchList
        poolId={poolId}
        matches={matches}
        predictionMap={predictionMap}
        onSave={onSave}
        highlightMatchId={highlightMatchId}
      />
    </div>
  )
}

function AllMatchesView({
  matches,
  poolId,
  predictionMap,
  onSave,
  highlightMatchId,
}: MatchListShared & { matches: Match[] }) {
  // On open, land on the next game to play. Matches are date-sorted, so the
  // first not-yet-finished one is the earliest live/upcoming fixture.
  const firstUnfinishedIndex = matches.findIndex((m) => m.status !== 'finished')

  // Reveal enough batches up front so that target card is in the DOM and we can
  // scroll to it (otherwise it sits past the initial infinite-scroll window).
  const [visible, setVisible] = useState(() =>
    firstUnfinishedIndex < 0
      ? ALL_BATCH_SIZE
      : Math.ceil((firstUnfinishedIndex + 1) / ALL_BATCH_SIZE) * ALL_BATCH_SIZE,
  )
  const shown = matches.slice(0, visible)
  const hasMore = visible < matches.length

  // On open, bring the first unfinished match to the top (its card carries
  // scroll-mt to clear the sticky header). The content ABOVE the target keeps
  // growing after first paint — web fonts swap in (Barlow Condensed/Inter,
  // display=swap), flag images decode, and the infinite-scroll window expands —
  // and each push moves the target down, so a single well-timed scroll lands
  // stale and strands the target mid-screen. Re-assert the scroll on every
  // layout change until the user takes over or a short window elapses.
  // Mount-only: live-poll refetches must not yank the user back here.
  // biome-ignore lint/correctness/useExhaustiveDependencies: align once on open
  useEffect(() => {
    if (firstUnfinishedIndex < 0) return
    const target = matches[firstUnfinishedIndex]
    if (!target) return
    let done = false
    const align = () => {
      if (done) return
      const card = document.getElementById(`match-${target.id}`)
      if (!card) return
      // First match of its day → anchor on the day header (section top) so the
      // header sits at the top. Otherwise (a mid-day target, with earlier
      // finished matches the same day) anchor on the card itself so none of
      // those finished matches show above it.
      const section = card.closest('[data-day-section]')
      const firstCard = section
        ? [...section.querySelectorAll('[id^="match-"]')].sort(
            (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top,
          )[0]
        : null
      const anchor = section && firstCard === card ? section : card
      // Scroll the anchor flush to the top. The sticky header doesn't actually
      // pin on this page, so scrollIntoView's scroll-margin would only reveal
      // the preceding match — scroll to the anchor's exact offset instead.
      window.scrollTo({ top: Math.max(0, anchor.getBoundingClientRect().top + window.scrollY) })
    }
    align()
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => requestAnimationFrame(align))
        : null
    observer?.observe(document.body)
    const stop = () => {
      done = true
      observer?.disconnect()
    }
    // Stop as soon as the user scrolls (don't fight them) and after a bounded
    // backstop so a late refetch never re-snaps the view.
    window.addEventListener('wheel', stop, { passive: true, once: true })
    window.addEventListener('touchmove', stop, { passive: true, once: true })
    window.addEventListener('keydown', stop, { once: true })
    const timer = window.setTimeout(stop, 1500)
    return () => {
      done = true
      observer?.disconnect()
      window.clearTimeout(timer)
      window.removeEventListener('wheel', stop)
      window.removeEventListener('touchmove', stop)
      window.removeEventListener('keydown', stop)
    }
  }, [])

  // Infinite scroll: a sentinel below the list grows the window as it nears the
  // viewport. A callback ref re-attaches the observer whenever the sentinel
  // mounts/unmounts (so it stops cleanly once the whole list is revealed).
  const observerRef = useRef<IntersectionObserver | null>(null)
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect()
    if (!node) return
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisible((v) => v + ALL_BATCH_SIZE)
      },
      { rootMargin: '400px' },
    )
    observerRef.current.observe(node)
  }, [])

  return (
    <>
      <MatchList
        poolId={poolId}
        matches={shown}
        predictionMap={predictionMap}
        onSave={onSave}
        grouping="day"
        highlightMatchId={highlightMatchId}
      />
      {hasMore && <div ref={sentinelRef} aria-hidden className="h-1" />}
    </>
  )
}

function leagueMatchdayModel(leagueMatches: Match[], activeMatchday: number | null) {
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
  return { sortedMatchdays, currentMatchday, currentMatches }
}

// Always visible for league pools, so the user can return to a round from the
// today/all views; highlighted only while the round view is active.
function LeagueRoundTabs({
  sortedMatchdays,
  currentMatchday,
  active,
  onSelect,
}: {
  sortedMatchdays: number[]
  currentMatchday: number
  active: boolean
  onSelect: (md: number) => void
}) {
  return (
    <div
      className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pb-1 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-visible"
      role="tablist"
      aria-label="Rodadas"
    >
      {sortedMatchdays.map((md) => {
        const selected = active && currentMatchday === md
        return (
          <button
            key={md}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(md)}
            className={`shrink-0 font-display text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 transition-colors cursor-pointer ${
              selected ? 'bg-black text-white' : 'text-gray-muted hover:text-black'
            }`}
          >
            {md}ª
          </button>
        )
      })}
    </div>
  )
}

function LeagueRoundMatches({
  currentMatchday,
  currentMatches,
  poolId,
  predictionMap,
  onSave,
  highlightMatchId,
}: MatchListShared & { currentMatchday: number; currentMatches: Match[] }) {
  return (
    <>
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
          grouping="matchday"
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

// Cup pools: universal schedule row + Fase de Grupos / Mata-Mata, with the
// group/knockout sub-views shown only while the competition view is active.
function CupSchedule({
  viewMode,
  setViewMode,
  tab,
  setTab,
  onSelectAll,
  scheduleViews,
  groupMatches,
  knockoutMatches,
  activeGroup,
  setActiveGroup,
  activeKnockoutStage,
  setActiveKnockoutStage,
  poolId,
  predictionMap,
  onSave,
  highlightMatchId,
}: MatchListShared & {
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void
  tab: Tab
  setTab: (t: Tab) => void
  onSelectAll: () => void
  scheduleViews: ReactNode
  groupMatches: Match[]
  knockoutMatches: Match[]
  activeGroup: string
  setActiveGroup: (g: string) => void
  activeKnockoutStage: string | null
  setActiveKnockoutStage: (s: string) => void
}) {
  return (
    <>
      <ScheduleTabBarCup
        viewMode={viewMode}
        tab={tab}
        onSelectToday={() => setViewMode('today')}
        onSelectAll={onSelectAll}
        onSelectFormat={(t) => {
          setViewMode('format')
          setTab(t)
        }}
      />
      {scheduleViews}
      {viewMode === 'format' && tab === 'groups' && (
        <GroupStageView
          groupMatches={groupMatches}
          activeGroup={activeGroup}
          setActiveGroup={setActiveGroup}
          poolId={poolId}
          predictionMap={predictionMap}
          onSave={onSave}
          highlightMatchId={highlightMatchId}
        />
      )}
      {viewMode === 'format' && tab === 'knockout' && (
        <KnockoutStagesView
          knockoutMatches={knockoutMatches}
          activeKnockoutStage={activeKnockoutStage}
          setActiveKnockoutStage={setActiveKnockoutStage}
          poolId={poolId}
          predictionMap={predictionMap}
          onSave={onSave}
          highlightMatchId={highlightMatchId}
        />
      )}
    </>
  )
}

// League pools: universal schedule row + always-visible round selector, with
// the selected round's matches shown only while the round view is active.
function LeagueSchedule({
  viewMode,
  setViewMode,
  activeMatchday,
  setActiveMatchday,
  leagueMatches,
  onSelectAll,
  scheduleViews,
  poolId,
  predictionMap,
  onSave,
  highlightMatchId,
}: MatchListShared & {
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void
  activeMatchday: number | null
  setActiveMatchday: (md: number) => void
  leagueMatches: Match[]
  onSelectAll: () => void
  scheduleViews: ReactNode
}) {
  const league = leagueMatchdayModel(leagueMatches, activeMatchday)
  return (
    <>
      <ScheduleTabBarLeague
        viewMode={viewMode}
        onSelectToday={() => setViewMode('today')}
        onSelectAll={onSelectAll}
      />
      <LeagueRoundTabs
        sortedMatchdays={league.sortedMatchdays}
        currentMatchday={league.currentMatchday}
        active={viewMode === 'format'}
        onSelect={(md) => {
          setViewMode('format')
          setActiveMatchday(md)
        }}
      />
      {scheduleViews}
      {viewMode === 'format' && (
        <LeagueRoundMatches
          currentMatchday={league.currentMatchday}
          currentMatches={league.currentMatches}
          poolId={poolId}
          predictionMap={predictionMap}
          onSave={onSave}
          highlightMatchId={highlightMatchId}
        />
      )}
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
  // Land on "Jogos do dia" by default; a ?match deep-link jumps straight to the
  // competition view that holds that match instead.
  const [viewMode, setViewMode] = useState<ViewMode>(targetMatchId ? 'format' : 'today')
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
    staleTime: 0,
    refetchInterval: (query) => matchesPollMs(query.state.data?.matches),
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
      advancePick,
    }: {
      matchId: string
      homeScore: number
      awayScore: number
      advancePick: AdvanceSide | null
    }) => {
      const res = await apiFetch(`/api/pools/${poolId}/predictions/${matchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homeScore, awayScore, advancePick }),
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
    (matchId: string, homeScore: number, awayScore: number, advancePick: AdvanceSide | null) =>
      saveMutation.mutateAsync({ matchId, homeScore, awayScore, advancePick }),
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
    setViewMode('format')
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

  // Single-match pools have exactly one game — the schedule tabs add nothing.
  if (pool.matchId != null) {
    return (
      <MatchList
        poolId={poolId}
        matches={allMatches}
        predictionMap={predictionMap}
        onSave={handleSave}
        highlightMatchId={highlightMatchId}
      />
    )
  }

  const todayMatches = matchesToday(allMatches, new Date())
  const allSorted = sortByDate(allMatches)
  const goToAll = () => setViewMode('all')

  const scheduleViews = (
    <>
      {viewMode === 'today' && (
        <TodayView
          matches={todayMatches}
          poolId={poolId}
          predictionMap={predictionMap}
          onSave={handleSave}
          highlightMatchId={highlightMatchId}
          onSeeAll={goToAll}
        />
      )}
      {viewMode === 'all' && (
        <AllMatchesView
          matches={allSorted}
          poolId={poolId}
          predictionMap={predictionMap}
          onSave={handleSave}
          highlightMatchId={highlightMatchId}
        />
      )}
    </>
  )

  if (hasLeagueMatches) {
    return (
      <LeagueSchedule
        viewMode={viewMode}
        setViewMode={setViewMode}
        activeMatchday={activeMatchday}
        setActiveMatchday={setActiveMatchday}
        leagueMatches={leagueMatches}
        onSelectAll={goToAll}
        scheduleViews={scheduleViews}
        poolId={poolId}
        predictionMap={predictionMap}
        onSave={handleSave}
        highlightMatchId={highlightMatchId}
      />
    )
  }

  return (
    <CupSchedule
      viewMode={viewMode}
      setViewMode={setViewMode}
      tab={tab}
      setTab={setTab}
      onSelectAll={goToAll}
      scheduleViews={scheduleViews}
      groupMatches={groupMatches}
      knockoutMatches={knockoutMatches}
      activeGroup={activeGroup}
      setActiveGroup={setActiveGroup}
      activeKnockoutStage={activeKnockoutStage}
      setActiveKnockoutStage={setActiveKnockoutStage}
      poolId={poolId}
      predictionMap={predictionMap}
      onSave={handleSave}
      highlightMatchId={highlightMatchId}
    />
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
