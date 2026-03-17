import type { Match } from '@manita/shared'

interface BracketProps {
  matches: Match[]
}

const stageOrder = ['round-of-32', 'round-of-16', 'quarter', 'semi', 'third-place', 'final'] as const
const stageLabels: Record<string, string> = {
  'round-of-32': '32-avos',
  'round-of-16': 'Oitavas',
  quarter: 'Quartas',
  semi: 'Semi',
  'third-place': '3º Lugar',
  final: 'Final',
}

function BracketMatch({ match }: { match: Match }) {
  const hasTeams = match.homeTeam && match.awayTeam
  const homeWon = match.status === 'finished' && match.homeScore != null && match.awayScore != null && match.homeScore > match.awayScore
  const awayWon = match.status === 'finished' && match.homeScore != null && match.awayScore != null && match.awayScore > match.homeScore

  return (
    <div className="border-2 border-border overflow-hidden">
      <div className={`flex items-center gap-2 px-3 py-2 ${homeWon ? 'bg-green/5' : ''}`}>
        {match.homeFlag && <img src={match.homeFlag} alt="" className="h-4 w-4 rounded-full" aria-hidden="true" />}
        <span className={`flex-1 truncate font-display text-[11px] uppercase tracking-wide ${homeWon ? 'font-black text-black' : hasTeams ? 'font-bold text-gray-dark' : 'font-bold text-gray-muted'}`}>
          {hasTeams ? match.homeTeam : 'A definir'}
        </span>
        {match.homeScore != null && <span className="font-display text-sm font-black text-black">{match.homeScore}</span>}
      </div>
      <div className="h-px bg-border" />
      <div className={`flex items-center gap-2 px-3 py-2 ${awayWon ? 'bg-green/5' : ''}`}>
        {match.awayFlag && <img src={match.awayFlag} alt="" className="h-4 w-4 rounded-full" aria-hidden="true" />}
        <span className={`flex-1 truncate font-display text-[11px] uppercase tracking-wide ${awayWon ? 'font-black text-black' : hasTeams ? 'font-bold text-gray-dark' : 'font-bold text-gray-muted'}`}>
          {hasTeams ? match.awayTeam : 'A definir'}
        </span>
        {match.awayScore != null && <span className="font-display text-sm font-black text-black">{match.awayScore}</span>}
      </div>
    </div>
  )
}

export function Bracket({ matches }: BracketProps) {
  const matchesByStage = new Map<string, Match[]>()
  for (const m of matches) {
    const existing = matchesByStage.get(m.stage) ?? []
    existing.push(m)
    matchesByStage.set(m.stage, existing)
  }

  return (
    <div className="flex flex-col gap-6">
      {stageOrder.map((stage) => {
        const stageMatches = matchesByStage.get(stage) ?? []
        if (stageMatches.length === 0) return null

        return (
          <div key={stage}>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
                {stageLabels[stage] ?? stage}
              </h3>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-1 gap-2">
              {stageMatches.map((m) => (
                <BracketMatch key={m.id} match={m} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
