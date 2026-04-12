import type { Match } from '@m5nita/shared'
import { formatDate } from '../../lib/utils'

interface MatchCardProps {
  match: Match
}

const TBD_LABEL = 'A definir'

function TeamName({ name }: { name: string }) {
  const isTbd = name === TBD_LABEL || name === 'TBD'
  return (
    <span
      className={`text-center font-display text-[11px] uppercase tracking-wide truncate w-full ${
        isTbd ? 'font-medium italic text-gray-muted' : 'font-bold text-black'
      }`}
    >
      {isTbd ? TBD_LABEL : name}
    </span>
  )
}

export function MatchCard({ match }: MatchCardProps) {
  const isLive = match.status === 'live'
  const isFinished = match.status === 'finished'

  return (
    <div
      className={`flex items-center gap-3 border-b border-border py-3 lg:border-2 lg:border-border lg:p-4 ${isLive ? 'bg-red/[0.03] lg:border-red/30' : ''}`}
    >
      <div className="flex flex-1 flex-col items-center gap-1 min-w-0">
        {match.homeFlag && (
          <img
            src={match.homeFlag}
            alt=""
            className="h-6 w-6 rounded-full object-cover"
            aria-hidden="true"
          />
        )}
        <TeamName name={match.homeTeam} />
      </div>

      <div className="flex flex-col items-center gap-0.5 shrink-0">
        <span className="text-[10px] text-gray-muted">{formatDate(match.matchDate)}</span>
        {isFinished || isLive ? (
          <span className="font-display text-2xl font-black text-black">
            {match.homeScore} - {match.awayScore}
          </span>
        ) : (
          match.group && (
            <span className="font-display text-[9px] font-bold uppercase tracking-widest text-gray-muted">
              Grupo {match.group}
            </span>
          )
        )}
        {isLive && (
          <span className="flex items-center gap-1 font-display text-[9px] font-bold uppercase tracking-widest text-red">
            <span className="h-1 w-1 animate-pulse rounded-full bg-red" aria-hidden="true" />
            Ao Vivo
          </span>
        )}
        {isFinished && (
          <span className="font-display text-[9px] font-bold uppercase tracking-widest text-gray-muted">
            Final
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center gap-1 min-w-0">
        {match.awayFlag && (
          <img
            src={match.awayFlag}
            alt=""
            className="h-6 w-6 rounded-full object-cover"
            aria-hidden="true"
          />
        )}
        <TeamName name={match.awayTeam} />
      </div>
    </div>
  )
}
