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
  'third-place': '3o Lugar',
  final: 'Final',
}

function BracketMatch({ match }: { match: Match }) {
  const hasTeams = match.homeTeam && match.awayTeam

  return (
    <div className="flex flex-col rounded-lg border border-navy/10 bg-white overflow-hidden text-xs">
      <div className={`flex items-center gap-2 px-2 py-1.5 ${match.status === 'finished' && match.homeScore != null && match.awayScore != null && match.homeScore > match.awayScore ? 'bg-green/5 font-bold' : ''}`}>
        {match.homeFlag && <img src={match.homeFlag} alt="" className="h-4 w-4 rounded-full" aria-hidden="true" />}
        <span className="flex-1 truncate">{hasTeams ? match.homeTeam : 'A definir'}</span>
        {match.homeScore != null && <span className="font-heading font-bold">{match.homeScore}</span>}
      </div>
      <div className="h-px bg-navy/10" />
      <div className={`flex items-center gap-2 px-2 py-1.5 ${match.status === 'finished' && match.homeScore != null && match.awayScore != null && match.awayScore > match.homeScore ? 'bg-green/5 font-bold' : ''}`}>
        {match.awayFlag && <img src={match.awayFlag} alt="" className="h-4 w-4 rounded-full" aria-hidden="true" />}
        <span className="flex-1 truncate">{hasTeams ? match.awayTeam : 'A definir'}</span>
        {match.awayScore != null && <span className="font-heading font-bold">{match.awayScore}</span>}
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
            <h3 className="mb-2 font-heading text-sm font-bold uppercase tracking-wider text-gray-dark">
              {stageLabels[stage] ?? stage}
            </h3>
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
