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

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

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

  const statusBadge = matchStatus === 'live'
    ? { text: 'AO VIVO', color: 'bg-red text-cream' }
    : matchStatus === 'finished'
    ? { text: 'FINALIZADO', color: 'bg-navy/10 text-navy' }
    : status === 'saved'
    ? { text: 'SALVO', color: 'bg-green/10 text-green' }
    : status === 'saving'
    ? { text: 'SALVANDO...', color: 'bg-navy/5 text-gray' }
    : null

  return (
    <div className={`rounded-xl border p-3 ${isLocked ? 'border-navy/10 bg-navy/[0.02]' : 'border-navy/10 bg-white'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex-1 truncate text-sm font-medium text-navy">{homeTeam}</span>
        <div className="flex items-center gap-1">
          <input
            type="text"
            inputMode="numeric"
            value={isLocked && actualHomeScore != null ? actualHomeScore : home}
            onChange={(e) => handleHomeChange(e.target.value)}
            disabled={isLocked}
            className="h-10 w-10 rounded-lg border border-navy/20 text-center font-heading text-lg font-bold text-navy focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20 disabled:bg-navy/5 disabled:text-navy/50"
            aria-label={`Gols ${homeTeam}`}
          />
          <span className="text-gray-dark font-bold">x</span>
          <input
            type="text"
            inputMode="numeric"
            value={isLocked && actualAwayScore != null ? actualAwayScore : away}
            onChange={(e) => handleAwayChange(e.target.value)}
            disabled={isLocked}
            className="h-10 w-10 rounded-lg border border-navy/20 text-center font-heading text-lg font-bold text-navy focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20 disabled:bg-navy/5 disabled:text-navy/50"
            aria-label={`Gols ${awayTeam}`}
          />
        </div>
        <span className="flex-1 truncate text-right text-sm font-medium text-navy">{awayTeam}</span>
      </div>

      <div className="mt-2 flex items-center justify-between">
        {statusBadge && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusBadge.color}`}>
            {statusBadge.text}
          </span>
        )}
        {points != null && matchStatus === 'finished' && (
          <span className="ml-auto font-heading text-sm font-bold text-green">
            +{points} pts
          </span>
        )}
        {matchStatus === 'finished' && initialHome != null && initialAway != null && (
          <span className="text-xs text-gray ml-2">
            Palpite: {initialHome}x{initialAway}
          </span>
        )}
      </div>
    </div>
  )
}
