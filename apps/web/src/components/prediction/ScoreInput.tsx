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
import { formatDate, formatMatchMinute } from '../../lib/utils'

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
  winner?: 'home' | 'away' | 'draw' | null
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

function ScoreBreakdownToggle({
  total,
  variant,
  isOpen,
  onToggle,
}: {
  total: number
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
      <span>{totalLabel}</span>
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
    <div className="mt-2 w-full border-2 border-border bg-white/70 p-3 text-left">
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
  wentToOvertime,
  minute,
  injuryTime,
}: {
  matchStatus: string
  isLocked: boolean
  hasActualScore: boolean
  actualHomeScore: number | null
  actualAwayScore: number | null
  wentToOvertime: boolean
  minute?: number | null
  injuryTime?: number | null
}) {
  if (!((isLocked && hasActualScore) || matchStatus === 'live')) return null
  // For matches that went past 90', the displayed score is the regular-time
  // score (what predictions grade against), so label it as such.
  const finishedLabel = wentToOvertime ? 'Tempo normal' : 'Resultado oficial'
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
      {clock && <span>· {clock}</span>}
      {hasActualScore && (
        <span className="flex items-center gap-1.5">
          <span>{actualHomeScore}</span>
          <span>x</span>
          <span>{actualAwayScore}</span>
        </span>
      )}
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
              variant="live"
              isOpen={breakdownOpen}
              onToggle={onToggleBreakdown}
            />
          ) : (
            <span className="flex items-center gap-1 font-display text-xs font-black text-red">
              <span className="h-1 w-1 animate-pulse rounded-full bg-red" aria-hidden="true" />+
              {points} pts
            </span>
          ))}
        {matchStatus === 'finished' &&
          (scoreReady && points !== null ? (
            <ScoreBreakdownToggle
              total={points}
              variant="finished"
              isOpen={breakdownOpen}
              onToggle={onToggleBreakdown}
            />
          ) : (
            <span className="font-display text-xs font-black text-green">+{points ?? 0} pts</span>
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

function resolvingScoreLabel({
  duration,
  regHomeScore,
  regAwayScore,
  extraTimeHomeScore,
  extraTimeAwayScore,
  penaltyHomeScore,
  penaltyAwayScore,
}: {
  duration: MatchDuration
  regHomeScore: number | null | undefined
  regAwayScore: number | null | undefined
  extraTimeHomeScore: number | null | undefined
  extraTimeAwayScore: number | null | undefined
  penaltyHomeScore: number | null | undefined
  penaltyAwayScore: number | null | undefined
}): string {
  const hasReg = regHomeScore != null && regAwayScore != null
  const extraTimeHadGoals = (extraTimeHomeScore ?? 0) > 0 || (extraTimeAwayScore ?? 0) > 0
  const afterExtraTime = hasReg
    ? `${regHomeScore + (extraTimeHomeScore ?? 0)}×${regAwayScore + (extraTimeAwayScore ?? 0)} ao final da prorrogação`
    : null

  if (duration === 'penalty_shootout') {
    const pens =
      penaltyHomeScore != null && penaltyAwayScore != null
        ? `${penaltyHomeScore}×${penaltyAwayScore} nos pênaltis`
        : 'nos pênaltis'
    // Only mention the extra-time score when it adds information (ET goals);
    // otherwise it just repeats the 90' score already in the header.
    return extraTimeHadGoals && afterExtraTime ? `${afterExtraTime} · ${pens}` : pens
  }
  // extra time decided it: there was a goal, so the score differs from 90'
  return afterExtraTime ?? 'ao final da prorrogação'
}

function AdvanceResultNote({
  homeTeam,
  awayTeam,
  winner,
  duration,
  regHomeScore,
  regAwayScore,
  extraTimeHomeScore,
  extraTimeAwayScore,
  penaltyHomeScore,
  penaltyAwayScore,
}: {
  homeTeam: string
  awayTeam: string
  winner: 'home' | 'away' | 'draw' | null | undefined
  duration: MatchDuration | null | undefined
  regHomeScore: number | null | undefined
  regAwayScore: number | null | undefined
  extraTimeHomeScore: number | null | undefined
  extraTimeAwayScore: number | null | undefined
  penaltyHomeScore: number | null | undefined
  penaltyAwayScore: number | null | undefined
}) {
  if (!winner || winner === 'draw' || !duration || duration === 'regular') return null
  const advTeam = winner === 'home' ? homeTeam : awayTeam
  const detail = resolvingScoreLabel({
    duration,
    regHomeScore,
    regAwayScore,
    extraTimeHomeScore,
    extraTimeAwayScore,
    penaltyHomeScore,
    penaltyAwayScore,
  })
  return (
    <p className="mt-0.5 text-center font-display text-[9px] font-bold uppercase tracking-widest text-gray-muted">
      {displayTeamName(advTeam)} se classificou ({detail})
    </p>
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
    winner,
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
      <p className="mb-1.5 text-center font-display text-[10px] text-gray-muted">
        {formatDate(matchDate)}
      </p>
      <LiveResultHeader
        matchStatus={matchStatus}
        isLocked={isLocked}
        hasActualScore={hasActualScore}
        actualHomeScore={actualHomeScore}
        actualAwayScore={actualAwayScore}
        wentToOvertime={duration === 'extra_time' || duration === 'penalty_shootout'}
        minute={minute}
        injuryTime={injuryTime}
      />
      {isLocked && (
        <AdvanceResultNote
          homeTeam={displayTeamName(homeTeam)}
          awayTeam={displayTeamName(awayTeam)}
          winner={winner}
          duration={duration}
          regHomeScore={actualHomeScore}
          regAwayScore={actualAwayScore}
          extraTimeHomeScore={extraTimeHomeScore}
          extraTimeAwayScore={extraTimeAwayScore}
          penaltyHomeScore={penaltyHomeScore}
          penaltyAwayScore={penaltyAwayScore}
        />
      )}
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
