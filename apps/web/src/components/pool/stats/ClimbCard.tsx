import { Link } from '@tanstack/react-router'
import type { ClimbBlock } from './types'

function ordinal(n: number): string {
  return `${n}º`
}

function formatKickoff(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Hero({ block }: { block: ClimbBlock }) {
  const { position, memberCount, leads, nextUp, chaser } = block

  const chaserLine =
    chaser?.close === true ? (
      <p className="mt-3 border-t border-white/15 pt-3 font-display text-xs font-semibold uppercase tracking-widest text-white/70">
        ⚠️ {chaser.name ?? `O ${ordinal((position ?? 0) + 1)}`} está colado: {chaser.gap} pts atrás
      </p>
    ) : null

  if (position == null) {
    return (
      <section className="border-2 border-black bg-black px-5 py-6 text-white">
        <span className="font-display text-5xl font-black leading-none">—</span>
        <p className="mt-3 font-display text-xs font-semibold uppercase tracking-widest text-white/70">
          Sua posição aparece quando o 1º jogo terminar
        </p>
      </section>
    )
  }

  if (leads || !nextUp) {
    return (
      <section className="border-2 border-black bg-black px-5 py-6 text-white">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-6xl font-black leading-none">1º</span>
          <span className="font-display text-base font-semibold uppercase tracking-wider text-white/60">
            de {memberCount}
          </span>
        </div>
        <p className="mt-3 font-display text-xs font-semibold uppercase tracking-widest text-white/70">
          🏆 Você lidera — segure a ponta até o fim.
        </p>
        {chaserLine}
      </section>
    )
  }

  const rankAbove = (position ?? 1) - 1
  const aboveLabel = rankAbove <= 3 ? 'do pódio' : `do ${ordinal(rankAbove)}`
  const subtitle =
    nextUp.gap === 0
      ? `Empate técnico com o ${ordinal(rankAbove)} — desempate nas cravadas`
      : nextUp.exactsToClose === 1
        ? `1 cravada te coloca em ${ordinal(rankAbove)}`
        : `${nextUp.exactsToClose} cravadas te colocam em ${ordinal(rankAbove)}`

  return (
    <section className="border-2 border-black bg-black px-5 py-6 text-white">
      <p className="font-display text-xs font-semibold uppercase tracking-widest text-white/60">
        {ordinal(position)} de {memberCount}
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-6xl font-black leading-none">{nextUp.gap}</span>
        <span className="font-display text-base font-semibold uppercase tracking-wider text-white/60">
          pts {aboveLabel}
        </span>
      </div>
      <p className="mt-2 font-display text-xs font-semibold uppercase tracking-widest text-white/70">
        {subtitle}
      </p>
      {chaserLine}
    </section>
  )
}

/**
 * "Caminho até o topo": how far to the rank above (points + exact scores), who
 * is chasing, and the single next match the viewer can still act on — a concrete
 * next step into the predictions flow. Replaces the old impact-ranked list.
 */
export function ClimbCard({ poolId, block }: { poolId: string; block: ClimbBlock }) {
  return (
    <div className="flex flex-col gap-3">
      <Hero block={block} />
      {block.nextMatch && (
        <Link
          to="/pools/$poolId/predictions"
          params={{ poolId }}
          search={{ match: block.nextMatch.matchId }}
          className="flex items-center justify-between gap-3 border-2 border-border p-3 transition-colors hover:border-black"
        >
          <div className="min-w-0">
            <p className="font-display text-[10px] font-bold uppercase tracking-widest text-gray-muted">
              Próximo decisivo
            </p>
            <p className="truncate font-display text-sm font-bold text-text-primary">
              {block.nextMatch.homeTeam} × {block.nextMatch.awayTeam}
            </p>
            <p className="text-[10px] text-gray-muted">
              Fecha {formatKickoff(block.nextMatch.kickoff)}
            </p>
          </div>
          <span className="shrink-0 font-display text-xs font-bold uppercase tracking-wider text-red">
            {block.nextMatch.action === 'submit' ? 'Palpitar' : 'Revisar'}
          </span>
        </Link>
      )}
    </div>
  )
}
