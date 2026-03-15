import { formatDate } from '../../lib/utils'
import type { Match } from '@manita/shared'

interface MatchCardProps {
  match: Match
}

const statusLabels: Record<string, { text: string; color: string }> = {
  scheduled: { text: 'Agendado', color: 'text-gray' },
  live: { text: 'Ao Vivo', color: 'text-red font-bold' },
  finished: { text: 'Encerrado', color: 'text-navy' },
  postponed: { text: 'Adiado', color: 'text-gray' },
  cancelled: { text: 'Cancelado', color: 'text-gray' },
}

export function MatchCard({ match }: MatchCardProps) {
  const statusInfo = statusLabels[match.status] ?? statusLabels.scheduled!

  return (
    <div className="flex items-center gap-3 rounded-xl border border-navy/10 bg-white p-3">
      <div className="flex flex-1 flex-col items-center gap-1">
        {match.homeFlag && (
          <img src={match.homeFlag} alt="" className="h-6 w-6 rounded-full object-cover" aria-hidden="true" />
        )}
        <span className="text-center text-xs font-medium text-navy">{match.homeTeam}</span>
      </div>

      <div className="flex flex-col items-center gap-0.5">
        {match.status === 'finished' || match.status === 'live' ? (
          <span className="font-heading text-xl font-bold text-navy">
            {match.homeScore} - {match.awayScore}
          </span>
        ) : (
          <span className="text-xs text-gray">{formatDate(match.matchDate)}</span>
        )}
        <span className={`text-[10px] uppercase tracking-wider ${statusInfo.color}`}>
          {match.status === 'live' && (
            <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red" aria-hidden="true" />
          )}
          {statusInfo.text}
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center gap-1">
        {match.awayFlag && (
          <img src={match.awayFlag} alt="" className="h-6 w-6 rounded-full object-cover" aria-hidden="true" />
        )}
        <span className="text-center text-xs font-medium text-navy">{match.awayTeam}</span>
      </div>
    </div>
  )
}
