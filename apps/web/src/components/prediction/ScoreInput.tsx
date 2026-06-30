import type { AdvanceSide, MatchDuration } from '@m5nita/shared'
import {
  forwardRef,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { vibrate } from '../../lib/celebrate'
import { formatDate, formatMatchMinute } from '../../lib/utils'
import { Confetti } from '../ui/Confetti'

export interface ScoreInputHandle {
  focusHome: () => void
}

interface ScoreInputProps {
  matchId: string
  homeTeam: string
  awayTeam: string
  homeFlag: string | null
  awayFlag: string | null
  matchDate: string
  stage: string
  homeScore: number | null
  awayScore: number | null
  advancePick?: AdvanceSide | null
  matchStatus: string
  points: number | null
  category?: number | null
  bonus?: number | null
  advanceBonus?: number | null
  actualHomeScore: number | null
  actualAwayScore: number | null
  duration?: MatchDuration | null
  extraTimeHomeScore?: number | null
  extraTimeAwayScore?: number | null
  penaltyHomeScore?: number | null
  penaltyAwayScore?: number | null
  minute?: number | null
  injuryTime?: number | null
  onSave: (
    matchId: string,
    homeScore: number,
    awayScore: number,
    advancePick: AdvanceSide | null,
  ) => unknown
  onAdvance?: () => void
  renderExpandedContent?: (matchId: string) => ReactNode
}

const NON_KNOCKOUT_STAGES = new Set(['group', 'league'])
function isKnockoutStage(stage: string): boolean {
  return !NON_KNOCKOUT_STAGES.has(stage)
}

/**
 * The score shown in the result header for a knockout past 90' (extra time /
 * penalties): the aggregate (90' + extra-time goals), so the header reflects the
 * real match score — live or finished. (The 90' score is still what predictions
 * grade against.)
 */
function headerScore(
  duration: MatchDuration | null | undefined,
  regScore: number | null,
  extraTimeScore: number | null | undefined,
): number | null {
  if ((duration === 'extra_time' || duration === 'penalty_shootout') && regScore !== null) {
    return regScore + (extraTimeScore ?? 0)
  }
  return regScore
}

/** The shootout tally shown in the result header for a penalty-decided match. */
function shootoutTally(
  duration: MatchDuration | null | undefined,
  penaltyHomeScore: number | null | undefined,
  penaltyAwayScore: number | null | undefined,
): { home: number; away: number } | null {
  if (duration === 'penalty_shootout' && penaltyHomeScore != null && penaltyAwayScore != null) {
    return { home: penaltyHomeScore, away: penaltyAwayScore }
  }
  return null
}

function teamNameStyle(name: string): string {
  return name === 'TBD' ? 'font-medium italic text-gray-muted' : 'font-bold text-black'
}

function displayTeamName(name: string): string {
  return name === 'TBD' ? 'A definir' : name
}

function buildExplanation({
  homeTeam,
  awayTeam,
  realHome,
  realAway,
  category,
  bonus,
}: {
  homeTeam: string
  awayTeam: string
  realHome: number
  realAway: number
  category: number
  bonus: number
}): { categoryLine: string; bonusLine: string } {
  const realIsDraw = realHome === realAway
  const realWinnerTeam = realHome > realAway ? homeTeam : awayTeam

  let categoryLine: string
  if (category === 10) {
    categoryLine = `10 pts — você acertou o placar exato.`
  } else if (category === 7) {
    categoryLine = `7 pts — você acertou o vencedor (${realWinnerTeam}) e a diferença de gols.`
  } else if (category === 5) {
    categoryLine = realIsDraw
      ? `5 pts — você acertou que ia empatar (mesmo errando o placar exato).`
      : `5 pts — você acertou o vencedor (${realWinnerTeam}), mas errou a diferença.`
  } else {
    categoryLine = realIsDraw
      ? `0 pts da categoria — o jogo foi empate e você apostou em vencedor.`
      : `0 pts da categoria — você errou o vencedor (era o ${realWinnerTeam}).`
  }

  let bonusLine: string
  if (bonus === 4) {
    bonusLine = `4 pts de bônus — placar exato dá o bônus máximo.`
  } else if (bonus > 0) {
    bonusLine = `${bonus} pts de bônus — seu palpite ficou perto do placar real.`
  } else {
    bonusLine = `Sem bônus — seu placar ficou longe do real.`
  }

  return { categoryLine, bonusLine }
}

function PointsLabel({
  total,
  advanceBonus,
  className,
}: {
  total: number
  advanceBonus: number
  className: string
}) {
  if (advanceBonus > 0) {
    const scoreline = total - advanceBonus
    return (
      <span className={`flex items-center gap-1 ${className}`}>
        <span>+{scoreline}</span>
        <span>+{advanceBonus}</span>
        <span>pts</span>
      </span>
    )
  }
  const label = total === 1 ? '+1 pt' : `+${total} pts`
  return <span className={className}>{label}</span>
}

function ScoreBreakdownToggle({
  total,
  advanceBonus = 0,
  variant,
  isOpen,
  onToggle,
}: {
  total: number
  advanceBonus?: number
  variant: 'live' | 'finished'
  isOpen: boolean
  onToggle: () => void
}) {
  const totalLabel = total === 1 ? '+1 pt' : `+${total} pts`
  const colorClass = variant === 'live' ? 'text-red' : 'text-green'

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      aria-label={`Ver como ${totalLabel} foram calculados`}
      className={`flex items-center gap-1.5 font-display text-xs font-black ${colorClass} transition-opacity hover:opacity-80`}
    >
      {variant === 'live' && (
        <span className="h-1 w-1 animate-pulse rounded-full bg-red" aria-hidden="true" />
      )}
      <PointsLabel total={total} advanceBonus={advanceBonus} className="" />
      <span
        aria-hidden="true"
        className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current text-[9px] font-black"
      >
        ?
      </span>
    </button>
  )
}

function ScoreBreakdownPanel({
  total,
  category,
  bonus,
  advanceBonus,
  predHome,
  predAway,
  realHome,
  realAway,
  homeTeam,
  awayTeam,
}: {
  total: number
  category: number
  bonus: number
  advanceBonus: number
  predHome: number
  predAway: number
  realHome: number
  realAway: number
  homeTeam: string
  awayTeam: string
}) {
  const explanation = buildExplanation({
    homeTeam,
    awayTeam,
    realHome,
    realAway,
    category,
    bonus,
  })
  return (
    <div className="mt-2 w-full border-2 border-border bg-surface p-3 text-left">
      <p className="font-display text-[10px] font-bold uppercase tracking-widest text-gray-muted">
        Como esses {total} pts foram calculados:
      </p>
      <p className="mt-2 text-xs text-gray-dark">
        O jogo terminou {realHome}×{realAway} (tempo normal) e você palpitou {predHome}×{predAway}.
      </p>
      <p className="mt-2 text-xs text-gray-dark">{explanation.categoryLine}</p>
      <p className="mt-1 text-xs text-gray-dark">{explanation.bonusLine}</p>
      {advanceBonus > 0 && (
        <p className="mt-1 text-xs text-gray-dark">
          +{advanceBonus} pts — você acertou quem se classificou ao final da prorrogação/pênaltis.
        </p>
      )}
      <div className="mt-3 border-t border-border pt-2 text-[11px] leading-relaxed text-gray-muted">
        Em bolões de jogo único, além dos pontos da categoria, você ganha até 4 pts extras por
        proximidade do placar. No mata-mata, +2 por acertar quem se classifica.
      </div>
    </div>
  )
}

function ExpandPredictionsControl({
  isLocked,
  matchId,
  renderExpandedContent,
}: {
  isLocked: boolean
  matchId: string
  renderExpandedContent: (matchId: string) => ReactNode
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  if (!isLocked) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        aria-expanded={isExpanded}
        className={`mt-2 flex w-full items-center justify-center gap-1.5 font-display text-[10px] font-bold uppercase tracking-widest transition-colors ${
          isExpanded ? 'text-black' : 'text-gray-muted hover:text-black'
        }`}
      >
        {isExpanded ? 'Ocultar palpites dos oponentes' : 'Ver palpites dos oponentes'}
        <span aria-hidden="true">{isExpanded ? '▴' : '▾'}</span>
      </button>
      {isExpanded && renderExpandedContent(matchId)}
    </>
  )
}

function LiveResultHeader({
  matchStatus,
  isLocked,
  hasActualScore,
  actualHomeScore,
  actualAwayScore,
  penaltyTally,
  minute,
  injuryTime,
}: {
  matchStatus: string
  isLocked: boolean
  hasActualScore: boolean
  actualHomeScore: number | null
  actualAwayScore: number | null
  penaltyTally?: { home: number; away: number } | null
  minute?: number | null
  injuryTime?: number | null
}) {
  if (!((isLocked && hasActualScore) || matchStatus === 'live')) return null
  const finishedLabel = 'Resultado oficial'
  // Live clock sits between the "Ao Vivo" indicator and the score, same line.
  const clock = matchStatus === 'live' ? formatMatchMinute(minute, injuryTime) : null
  return (
    <div
      className={`mb-1 flex items-center justify-center gap-2 font-display text-[10px] font-bold uppercase leading-none tracking-widest ${
        matchStatus === 'live' ? 'text-red' : 'text-gray-muted'
      }`}
    >
      {matchStatus === 'live' ? (
        <span className="flex items-center gap-1">
          <span className="h-1 w-1 animate-pulse rounded-full bg-red" aria-hidden="true" />
          Ao Vivo
        </span>
      ) : (
        <span>{finishedLabel}</span>
      )}
      {clock && <span>{clock}</span>}
      {hasActualScore &&
        (penaltyTally ? (
          // On penalties the shootout tally sits in parens beside each team's
          // score — "1 (4) x (2) 1". The visual parens are aria-hidden; the
          // aria-label keeps the "pênaltis" context for screen readers.
          <span
            className="flex items-center gap-1.5 whitespace-nowrap"
            role="img"
            aria-label={`${actualHomeScore} a ${actualAwayScore}, pênaltis ${penaltyTally.home} a ${penaltyTally.away}`}
          >
            <span aria-hidden="true">{actualHomeScore}</span>
            <span aria-hidden="true">({penaltyTally.home})</span>
            <span aria-hidden="true">x</span>
            <span aria-hidden="true">({penaltyTally.away})</span>
            <span aria-hidden="true">{actualAwayScore}</span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <span>{actualHomeScore}</span>
            <span>x</span>
            <span>{actualAwayScore}</span>
          </span>
        ))}
    </div>
  )
}

function SaveStatus({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (status === 'saved') {
    return (
      <span className="font-display text-[9px] font-bold uppercase tracking-widest text-green">
        Salvo
      </span>
    )
  }
  if (status === 'saving') {
    return (
      <span className="font-display text-[9px] font-bold uppercase tracking-widest text-gray-muted">
        Salvando...
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="font-display text-[9px] font-bold uppercase tracking-widest text-red">
        Não salvo
      </span>
    )
  }
  return null
}

function MaybeScoreBreakdownPanel({
  breakdownOpen,
  points,
  category,
  bonus,
  advanceBonus,
  initialHome,
  initialAway,
  actualHomeScore,
  actualAwayScore,
  homeTeam,
  awayTeam,
}: {
  breakdownOpen: boolean
  points: number | null
  category: number | null | undefined
  bonus: number | null | undefined
  advanceBonus: number | null | undefined
  initialHome: number | null
  initialAway: number | null
  actualHomeScore: number | null
  actualAwayScore: number | null
  homeTeam: string
  awayTeam: string
}) {
  if (
    !breakdownOpen ||
    typeof category !== 'number' ||
    typeof bonus !== 'number' ||
    points === null ||
    initialHome === null ||
    initialAway === null ||
    actualHomeScore === null ||
    actualAwayScore === null
  ) {
    return null
  }
  return (
    <ScoreBreakdownPanel
      total={points}
      category={category}
      bonus={bonus}
      advanceBonus={advanceBonus ?? 0}
      predHome={initialHome}
      predAway={initialAway}
      realHome={actualHomeScore}
      realAway={actualAwayScore}
      homeTeam={displayTeamName(homeTeam)}
      awayTeam={displayTeamName(awayTeam)}
    />
  )
}

function ScoreResultFooter({
  status,
  matchStatus,
  hasPrediction,
  points,
  category,
  bonus,
  advanceBonus,
  initialHome,
  initialAway,
  actualHomeScore,
  actualAwayScore,
  homeTeam,
  awayTeam,
  breakdownOpen,
  onToggleBreakdown,
  onBurst,
}: {
  status: 'idle' | 'saving' | 'saved' | 'error'
  matchStatus: string
  hasPrediction: boolean
  points: number | null
  category: number | null | undefined
  bonus: number | null | undefined
  advanceBonus: number | null | undefined
  initialHome: number | null
  initialAway: number | null
  actualHomeScore: number | null
  actualAwayScore: number | null
  homeTeam: string
  awayTeam: string
  breakdownOpen: boolean
  onToggleBreakdown: () => void
  onBurst: () => void
}) {
  const scoreReady =
    typeof category === 'number' &&
    typeof bonus === 'number' &&
    actualHomeScore !== null &&
    actualAwayScore !== null

  return (
    <>
      <div className="mt-1 flex items-center justify-center gap-2" role="status" aria-live="polite">
        <SaveStatus status={status} />
        {matchStatus === 'live' &&
          hasPrediction &&
          points != null &&
          (scoreReady ? (
            <ScoreBreakdownToggle
              total={points}
              advanceBonus={advanceBonus ?? 0}
              variant="live"
              isOpen={breakdownOpen}
              onToggle={onToggleBreakdown}
            />
          ) : (
            <span className="flex items-center gap-1 font-display text-xs font-black text-red">
              <span className="h-1 w-1 animate-pulse rounded-full bg-red" aria-hidden="true" />
              <PointsLabel total={points ?? 0} advanceBonus={advanceBonus ?? 0} className="" />
            </span>
          ))}
        {matchStatus === 'finished' &&
          (points === 10 ? (
            // A 10-point finish is an exact score — clicking it drops confetti
            // (every click), and still opens the breakdown on single-match pools.
            <button
              type="button"
              onClick={() => {
                onBurst()
                if (scoreReady) onToggleBreakdown()
              }}
              aria-label="Comemorar o placar exato"
              className="flex items-center gap-1.5 font-display text-xs font-black text-green transition-opacity hover:opacity-80 cursor-pointer"
            >
              +10 pts
              {scoreReady && (
                <span
                  aria-hidden="true"
                  className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current text-[9px] font-black"
                >
                  ?
                </span>
              )}
            </button>
          ) : scoreReady && points !== null ? (
            <ScoreBreakdownToggle
              total={points}
              advanceBonus={advanceBonus ?? 0}
              variant="finished"
              isOpen={breakdownOpen}
              onToggle={onToggleBreakdown}
            />
          ) : (
            <PointsLabel
              total={points ?? 0}
              advanceBonus={advanceBonus ?? 0}
              className="font-display text-xs font-black text-green"
            />
          ))}
      </div>
      <MaybeScoreBreakdownPanel
        breakdownOpen={breakdownOpen}
        points={points}
        category={category}
        bonus={bonus}
        advanceBonus={advanceBonus}
        initialHome={initialHome}
        initialAway={initialAway}
        actualHomeScore={actualHomeScore}
        actualAwayScore={actualAwayScore}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
      />
    </>
  )
}

function AdvancePicker({
  homeTeam,
  awayTeam,
  value,
  locked,
  onPick,
  firstButtonRef,
}: {
  homeTeam: string
  awayTeam: string
  value: AdvanceSide | null
  locked: boolean
  onPick: (side: AdvanceSide) => void
  firstButtonRef?: Ref<HTMLButtonElement>
}) {
  // Before kickoff: always offer the pick. After kickoff: keep showing the
  // chosen side (locked), but hide entirely if the member never picked.
  if (locked && !value) return null
  return (
    <div className="mt-2 flex flex-col items-center gap-1">
      <p className="font-display text-[9px] font-bold uppercase tracking-widest text-gray-muted">
        Quem se classifica?{' '}
        <span className="font-normal normal-case tracking-normal">(prorrogação / pênaltis)</span>
      </p>
      <div className="flex gap-1.5">
        {(['home', 'away'] as const).map((side) => {
          const selected = value === side
          return (
            <button
              key={side}
              ref={side === 'home' ? firstButtonRef : undefined}
              type="button"
              disabled={locked}
              aria-pressed={selected}
              onClick={() => onPick(side)}
              className={`max-w-[130px] truncate px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wide transition-colors ${
                selected
                  ? 'bg-black text-white'
                  : 'border-2 border-border text-gray-dark hover:border-black hover:text-black'
              } ${locked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
            >
              {displayTeamName(side === 'home' ? homeTeam : awayTeam)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export const ScoreInput = forwardRef<ScoreInputHandle, ScoreInputProps>(function ScoreInput(
  {
    matchId,
    homeTeam,
    awayTeam,
    homeFlag,
    awayFlag,
    matchDate,
    stage,
    homeScore: initialHome,
    awayScore: initialAway,
    advancePick,
    matchStatus,
    points,
    category,
    bonus,
    advanceBonus,
    actualHomeScore,
    actualAwayScore,
    duration,
    extraTimeHomeScore,
    extraTimeAwayScore,
    penaltyHomeScore,
    penaltyAwayScore,
    minute,
    injuryTime,
    onSave,
    onAdvance,
    renderExpandedContent,
  },
  ref,
) {
  const [home, setHome] = useState(initialHome?.toString() ?? '')
  const [away, setAway] = useState(initialAway?.toString() ?? '')
  const [advance, setAdvance] = useState<AdvanceSide | null>(advancePick ?? null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  // Bumped on each "+10 pts" click to re-mount <Confetti> for a fresh burst.
  const [burstKey, setBurstKey] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const aliveRef = useRef(true)
  const homeInputRef = useRef<HTMLInputElement>(null)
  const awayInputRef = useRef<HTMLInputElement>(null)
  const advanceFirstRef = useRef<HTMLButtonElement>(null)
  // Read the latest pick inside the debounced save without re-creating it.
  const advanceRef = useRef(advance)
  advanceRef.current = advance
  const knockout = isKnockoutStage(stage)
  const isLocked =
    matchStatus === 'live' ||
    matchStatus === 'finished' ||
    new Date(matchDate).getTime() <= Date.now() // leak-allow: front mirror of domain `Prediction.canSubmitFor`; API does not yet ship a `predictionsLocked` flag — track in follow-up

  useImperativeHandle(ref, () => ({
    focusHome: () => homeInputRef.current?.focus(),
  }))
  const hasPrediction = initialHome !== null && initialAway !== null
  const hasActualScore = actualHomeScore != null && actualAwayScore != null

  const debouncedSave = useCallback(
    (h: string, a: string) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      const homeVal = Number.parseInt(h, 10)
      const awayVal = Number.parseInt(a, 10)
      if (Number.isNaN(homeVal) || Number.isNaN(awayVal) || homeVal < 0 || awayVal < 0) return
      timerRef.current = setTimeout(() => {
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
        setStatus('saving')
        // Drive the status off the actual save result, not a fixed timer — a
        // rejected save (e.g. 403 after kickoff) must NOT report "Salvo".
        Promise.resolve(onSave(matchId, homeVal, awayVal, advanceRef.current))
          .then(() => {
            if (!aliveRef.current) return
            setStatus('saved')
            resetTimerRef.current = setTimeout(() => {
              if (aliveRef.current) setStatus('idle')
            }, 2000)
          })
          .catch(() => {
            if (aliveRef.current) setStatus('error')
          })
      }, 500)
    },
    [matchId, onSave],
  )

  useEffect(() => {
    // Re-arm on (re)mount — StrictMode double-invokes setup/cleanup in dev, so a
    // cleanup-only effect would leave aliveRef stuck false and freeze the status.
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    }
  }, [])

  function handleHomeChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 2)
    setHome(digits)
    if (digits && away) debouncedSave(digits, away)
    if (digits.length === 1) awayInputRef.current?.focus()
  }

  function handleAwayChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 2)
    setAway(digits)
    if (home && digits) debouncedSave(home, digits)
    if (digits.length !== 1) return
    // On knockout matches, step onto the "who advances" pick before jumping to
    // the next match; otherwise advance straight to the next match.
    if (knockout) advanceFirstRef.current?.focus()
    else onAdvance?.()
  }

  function handleAwayKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !away) {
      e.preventDefault()
      homeInputRef.current?.focus()
    }
  }

  function handlePick(side: AdvanceSide) {
    setAdvance(side)
    advanceRef.current = side
    // Persist together with the current scoreline (a prediction always has one);
    // if no scoreline yet, the pick is held until the member enters it.
    if (home && away) debouncedSave(home, away)
    // Picking a side completes this card — move on to the next match.
    onAdvance?.()
  }

  return (
    <div className="border-b border-border py-3">
      {burstKey > 0 && <Confetti key={burstKey} />}
      <p className="mb-1.5 text-center font-display text-[10px] text-gray-muted">
        {formatDate(matchDate)}
      </p>
      <LiveResultHeader
        matchStatus={matchStatus}
        isLocked={isLocked}
        hasActualScore={hasActualScore}
        actualHomeScore={headerScore(duration, actualHomeScore, extraTimeHomeScore)}
        actualAwayScore={headerScore(duration, actualAwayScore, extraTimeAwayScore)}
        penaltyTally={shootoutTally(duration, penaltyHomeScore, penaltyAwayScore)}
        minute={minute}
        injuryTime={injuryTime}
      />
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center justify-end gap-1.5 min-w-0">
          <span
            className={`truncate font-display text-xs uppercase tracking-wide text-right ${teamNameStyle(homeTeam)}`}
          >
            {displayTeamName(homeTeam)}
          </span>
          {homeFlag && (
            <img src={homeFlag} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isLocked && !hasPrediction ? (
            <>
              <div className="flex h-10 w-10 items-center justify-center border-2 border-border bg-transparent font-display text-lg font-black text-gray-muted">
                –
              </div>
              <span className="font-display text-xs font-black text-gray-muted">x</span>
              <div className="flex h-10 w-10 items-center justify-center border-2 border-border bg-transparent font-display text-lg font-black text-gray-muted">
                –
              </div>
            </>
          ) : (
            <>
              <input
                ref={homeInputRef}
                type="text"
                inputMode="numeric"
                value={home}
                onChange={(e) => handleHomeChange(e.target.value)}
                onFocus={(e) => e.target.select()}
                disabled={isLocked}
                className="h-10 w-10 border-2 border-border bg-transparent text-center font-display text-lg font-black text-black transition-colors focus:border-black focus:outline-none disabled:cursor-not-allowed disabled:text-gray-muted disabled:border-border/50"
                aria-label={`Gols ${homeTeam}`}
              />
              <span className="font-display text-xs font-black text-gray-muted">x</span>
              <input
                ref={awayInputRef}
                type="text"
                inputMode="numeric"
                value={away}
                onChange={(e) => handleAwayChange(e.target.value)}
                onFocus={(e) => e.target.select()}
                onKeyDown={handleAwayKeyDown}
                disabled={isLocked}
                className="h-10 w-10 border-2 border-border bg-transparent text-center font-display text-lg font-black text-black transition-colors focus:border-black focus:outline-none disabled:cursor-not-allowed disabled:text-gray-muted disabled:border-border/50"
                aria-label={`Gols ${awayTeam}`}
              />
            </>
          )}
        </div>
        <div className="flex flex-1 items-center gap-1.5 min-w-0">
          {awayFlag && (
            <img src={awayFlag} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
          )}
          <span
            className={`truncate font-display text-xs uppercase tracking-wide ${teamNameStyle(awayTeam)}`}
          >
            {displayTeamName(awayTeam)}
          </span>
        </div>
      </div>
      {knockout && (
        <AdvancePicker
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          value={advance}
          locked={isLocked}
          onPick={handlePick}
          firstButtonRef={advanceFirstRef}
        />
      )}
      <ScoreResultFooter
        status={status}
        matchStatus={matchStatus}
        hasPrediction={hasPrediction}
        points={points}
        category={category}
        bonus={bonus}
        advanceBonus={advanceBonus}
        initialHome={initialHome}
        initialAway={initialAway}
        actualHomeScore={actualHomeScore}
        actualAwayScore={actualAwayScore}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        breakdownOpen={breakdownOpen}
        onToggleBreakdown={() => setBreakdownOpen((v) => !v)}
        onBurst={() => {
          setBurstKey((k) => k + 1)
          vibrate(30)
        }}
      />
      {renderExpandedContent && (
        <ExpandPredictionsControl
          isLocked={isLocked}
          matchId={matchId}
          renderExpandedContent={renderExpandedContent}
        />
      )}
    </div>
  )
})
