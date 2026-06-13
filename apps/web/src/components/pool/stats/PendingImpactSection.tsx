import { Link } from '@tanstack/react-router'
import type { PendingMatchImpact } from './types'

const IMPACT_LABEL = { high: 'Alto impacto', medium: 'Médio', low: 'Baixo' } as const
const IMPACT_CLASS = {
  high: 'text-red border-red',
  medium: 'text-black border-black',
  low: 'text-gray-muted border-border',
} as const

const MAX_SHOWN = 8

function formatKickoff(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Plain-language reason this match matters, from the points at stake and how
// many rivals a result here could overtake/lose to.
function reason(m: PendingMatchImpact): string {
  const pts = `Vale até ${m.pointsAtStake} pts`
  if (m.reachableRivals > 0) {
    const r = `${m.reachableRivals} riva${m.reachableRivals > 1 ? 'is' : 'l'} ao seu alcance`
    return `${pts} · ${r} — pode mudar sua posição`
  }
  return `${pts} · ninguém colado em você por enquanto`
}

/**
 * The viewer's own not-yet-started matches (predicted or not), ranked by impact.
 * Each row explains WHY it matters and links to the predictions screen to submit
 * or change before kickoff. Never shows any other member's prediction.
 */
export function PendingImpactSection({
  poolId,
  items,
}: {
  poolId: string
  items: PendingMatchImpact[]
}) {
  const shown = items.slice(0, MAX_SHOWN)
  const hidden = items.length - shown.length

  return (
    <section className="flex flex-col gap-4 border-l-4 border-black pl-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-sm font-bold uppercase tracking-wider text-text-primary">
          Jogos que mais importam
        </h2>
        <p className="text-xs leading-snug text-text-secondary">
          Próximos jogos, ordenados pelo quanto mexem na sua posição.
        </p>
      </div>
      {items.length === 0 ? (
        <p className="border-2 border-dashed border-border py-6 text-center font-display text-xs font-semibold uppercase tracking-wider text-gray-muted">
          Tudo em dia — nenhum jogo pendente
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((m) => (
            <Link
              key={m.matchId}
              to="/pools/$poolId/predictions"
              params={{ poolId }}
              search={{ match: m.matchId }}
              className="flex items-center gap-3 border-2 border-border p-3 transition-colors hover:border-black"
            >
              <span
                className={`shrink-0 border px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-widest ${IMPACT_CLASS[m.impact]}`}
              >
                {IMPACT_LABEL[m.impact]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-bold text-text-primary">
                  {m.homeTeam} × {m.awayTeam}
                </p>
                <p className="text-[11px] leading-snug text-text-secondary">{reason(m)}</p>
                <p className="text-[10px] text-gray-muted">Fecha {formatKickoff(m.kickoff)}</p>
              </div>
              <span className="shrink-0 font-display text-xs font-bold uppercase tracking-wider text-red">
                {m.action === 'submit' ? 'Palpitar' : 'Revisar'}
              </span>
            </Link>
          ))}
          {hidden > 0 && (
            <p className="pt-1 text-center font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted">
              + {hidden} outros jogos pendentes
            </p>
          )}
        </div>
      )}
    </section>
  )
}
