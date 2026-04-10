import {
  forwardRef,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { formatDate } from '../../lib/utils'

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
  homeScore: number | null
  awayScore: number | null
  matchStatus: string
  points: number | null
  actualHomeScore: number | null
  actualAwayScore: number | null
  onSave: (matchId: string, homeScore: number, awayScore: number) => void
  onAdvance?: () => void
}

function teamNameStyle(name: string): string {
  return name === 'TBD' ? 'font-medium italic text-gray-muted' : 'font-bold text-black'
}

function displayTeamName(name: string): string {
  return name === 'TBD' ? 'A definir' : name
}

export const ScoreInput = forwardRef<ScoreInputHandle, ScoreInputProps>(function ScoreInput(
  {
    matchId,
    homeTeam,
    awayTeam,
    homeFlag,
    awayFlag,
    matchDate,
    homeScore: initialHome,
    awayScore: initialAway,
    matchStatus,
    points,
    actualHomeScore,
    actualAwayScore,
    onSave,
    onAdvance,
  },
  ref,
) {
  const [home, setHome] = useState(initialHome?.toString() ?? '')
  const [away, setAway] = useState(initialAway?.toString() ?? '')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const homeInputRef = useRef<HTMLInputElement>(null)
  const awayInputRef = useRef<HTMLInputElement>(null)
  const isLocked =
    matchStatus === 'live' ||
    matchStatus === 'finished' ||
    new Date(matchDate).getTime() <= Date.now()

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
        setStatus('saving')
        onSave(matchId, homeVal, awayVal)
        setTimeout(() => setStatus('saved'), 300)
        setTimeout(() => setStatus('idle'), 2000)
      }, 500)
    },
    [matchId, onSave],
  )

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

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
    if (digits.length === 1) onAdvance?.()
  }

  function handleAwayKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !away) {
      e.preventDefault()
      homeInputRef.current?.focus()
    }
  }

  return (
    <div className="border-b border-border py-3">
      <p className="mb-1.5 text-center font-display text-[10px] text-gray-muted">
        {formatDate(matchDate)}
      </p>
      {isLocked && hasActualScore && (
        <div className="mb-1 flex items-center justify-center gap-1.5">
          <span className="font-display text-[10px] font-bold uppercase tracking-wider text-gray-muted">
            {actualHomeScore}
          </span>
          <span className="font-display text-[9px] text-gray-muted">x</span>
          <span className="font-display text-[10px] font-bold uppercase tracking-wider text-gray-muted">
            {actualAwayScore}
          </span>
        </div>
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
      <div className="mt-1 flex items-center justify-center gap-2">
        {matchStatus === 'live' && (
          <span className="flex items-center gap-1 font-display text-[9px] font-bold uppercase tracking-widest text-red">
            <span className="h-1 w-1 animate-pulse rounded-full bg-red" aria-hidden="true" />
            Ao Vivo
          </span>
        )}
        {isLocked && !hasPrediction && (
          <span className="font-display text-[9px] font-bold uppercase tracking-widest text-gray-muted">
            Sem palpite
          </span>
        )}
        {status === 'saved' && (
          <span className="font-display text-[9px] font-bold uppercase tracking-widest text-green">
            Salvo
          </span>
        )}
        {status === 'saving' && (
          <span className="font-display text-[9px] font-bold uppercase tracking-widest text-gray-muted">
            Salvando...
          </span>
        )}
        {points != null && matchStatus === 'finished' && (
          <span className="font-display text-xs font-black text-green">+{points} pts</span>
        )}
      </div>
    </div>
  )
})
