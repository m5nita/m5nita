import { formatDate } from '../../lib/utils'
import type { Match } from '@manita/shared'

interface MatchCardProps { match: Match }

export function MatchCard({ match }: MatchCardProps) {
  const isLive = match.status === 'live'
  const isFinished = match.status === 'finished'

  return (
    <div className={`flex items-center gap-3 border-b border-border py-3 ${isLive ? 'bg-red/[0.03]' : ''}`}>
      <div className="flex flex-1 flex-col items-center gap-1 min-w-0">
        {match.homeFlag && <img src={match.homeFlag} alt="" className="h-6 w-6 rounded-full object-cover" aria-hidden="true" />}
        <span className="text-center font-display text-[11px] font-bold uppercase tracking-wide text-black truncate w-full">{match.homeTeam}</span>
      </div>

      <div className="flex flex-col items-center gap-0.5 shrink-0">
        {isFinished || isLive ? (
          <span className="font-display text-2xl font-black text-black">{match.homeScore} - {match.awayScore}</span>
        ) : (
          <span className="text-xs text-gray-muted">{formatDate(match.matchDate)}</span>
        )}
        {isLive && (
          <span className="flex items-center gap-1 font-display text-[9px] font-bold uppercase tracking-widest text-red">
            <span className="h-1 w-1 animate-pulse rounded-full bg-red" aria-hidden="true" />
            Ao Vivo
          </span>
        )}
        {isFinished && (
          <span className="font-display text-[9px] font-bold uppercase tracking-widest text-gray-muted">Final</span>
        )}
        {!isLive && !isFinished && match.group && (
          <span className="font-display text-[9px] font-bold uppercase tracking-widest text-gray-muted">Grupo {match.group}</span>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center gap-1 min-w-0">
        {match.awayFlag && <img src={match.awayFlag} alt="" className="h-6 w-6 rounded-full object-cover" aria-hidden="true" />}
        <span className="text-center font-display text-[11px] font-bold uppercase tracking-wide text-black truncate w-full">{match.awayTeam}</span>
      </div>
    </div>
  )
}
