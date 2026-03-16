import { useState, useEffect, useRef, useCallback } from 'react'

interface ScoreInputProps {
  matchId: string
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
  matchStatus: string
  points: number | null
  actualHomeScore: number | null
  actualAwayScore: number | null
  onSave: (matchId: string, homeScore: number, awayScore: number) => void
}

export function ScoreInput({
  matchId,
  homeTeam,
  awayTeam,
  homeScore: initialHome,
  awayScore: initialAway,
  matchStatus,
  points,
  actualHomeScore,
  actualAwayScore,
  onSave,
}: ScoreInputProps) {
  const [home, setHome] = useState(initialHome?.toString() ?? '')
  const [away, setAway] = useState(initialAway?.toString() ?? '')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLocked = matchStatus === 'live' || matchStatus === 'finished'

  const debouncedSave = useCallback(
    (h: string, a: string) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      const homeVal = parseInt(h, 10)
      const awayVal = parseInt(a, 10)
      if (isNaN(homeVal) || isNaN(awayVal) || homeVal < 0 || awayVal < 0) return
      timerRef.current = setTimeout(() => {
        setStatus('saving')
        onSave(matchId, homeVal, awayVal)
        setTimeout(() => setStatus('saved'), 300)
        setTimeout(() => setStatus('idle'), 2000)
      }, 500)
    },
    [matchId, onSave],
  )

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  function handleHomeChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 2)
    setHome(digits)
    if (digits && away) debouncedSave(digits, away)
  }

  function handleAwayChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 2)
    setAway(digits)
    if (home && digits) debouncedSave(home, digits)
  }

  return (
    <div className={`border-b border-border py-3 ${isLocked ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate font-display text-xs font-bold uppercase tracking-wide text-black text-right">
          {homeTeam}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <input type="text" inputMode="numeric" value={isLocked && actualHomeScore != null ? actualHomeScore : home}
            onChange={(e) => handleHomeChange(e.target.value)} disabled={isLocked}
            className="h-10 w-10 border-2 border-border bg-transparent text-center font-display text-lg font-black text-black transition-colors focus:border-black focus:outline-none disabled:text-gray-muted"
            aria-label={`Gols ${homeTeam}`} />
          <span className="font-display text-xs font-black text-gray-muted">x</span>
          <input type="text" inputMode="numeric" value={isLocked && actualAwayScore != null ? actualAwayScore : away}
            onChange={(e) => handleAwayChange(e.target.value)} disabled={isLocked}
            className="h-10 w-10 border-2 border-border bg-transparent text-center font-display text-lg font-black text-black transition-colors focus:border-black focus:outline-none disabled:text-gray-muted"
            aria-label={`Gols ${awayTeam}`} />
        </div>
        <span className="flex-1 truncate font-display text-xs font-bold uppercase tracking-wide text-black">
          {awayTeam}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-center gap-2">
        {matchStatus === 'live' && (
          <span className="flex items-center gap-1 font-display text-[9px] font-bold uppercase tracking-widest text-red">
            <span className="h-1 w-1 animate-pulse rounded-full bg-red" aria-hidden="true" />Ao Vivo
          </span>
        )}
        {status === 'saved' && <span className="font-display text-[9px] font-bold uppercase tracking-widest text-green">Salvo</span>}
        {status === 'saving' && <span className="font-display text-[9px] font-bold uppercase tracking-widest text-gray-muted">Salvando...</span>}
        {points != null && matchStatus === 'finished' && <span className="font-display text-xs font-black text-green">+{points} pts</span>}
      </div>
    </div>
  )
}
